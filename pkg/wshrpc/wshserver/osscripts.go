// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wcore"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
	"github.com/wavetermdev/waveterm/pkg/wstore"
)

const (
	osScriptsMetaKey    = "os:lifecycle"
	osScriptMaxCmdLen   = 512
	osScriptMaxCount    = 32
	osScriptRunOutputMax = 4000
)

var osScriptStages = map[string]bool{
	"setup":    true,
	"teardown": true,
	"run":      true,
}

func normalizeOSWorkspaceScripts(items []wshrpc.OSWorkspaceScript) ([]wshrpc.OSWorkspaceScript, error) {
	seen := make(map[string]bool)
	rtn := make([]wshrpc.OSWorkspaceScript, 0, min(len(items), osScriptMaxCount))
	for _, item := range items {
		item.Id = strings.TrimSpace(item.Id)
		if item.Id == "" {
			item.Id = uuid.NewString()
		}
		if err := validateOSUUID("script id", item.Id); err != nil {
			return nil, err
		}
		if !osScriptStages[item.Stage] {
			return nil, fmt.Errorf("invalid script stage %q (supported: setup, teardown, run)", item.Stage)
		}
		item.Command = strings.TrimSpace(item.Command)
		if item.Command == "" || len(item.Command) > osScriptMaxCmdLen {
			return nil, fmt.Errorf("script command must be between 1 and %d characters", osScriptMaxCmdLen)
		}
		if seen[item.Id] {
			continue
		}
		seen[item.Id] = true
		rtn = append(rtn, item)
		if len(rtn) == osScriptMaxCount {
			break
		}
	}
	sort.Slice(rtn, func(i, j int) bool {
		if rtn[i].Stage != rtn[j].Stage {
			return rtn[i].Stage < rtn[j].Stage
		}
		return rtn[i].Command < rtn[j].Command
	})
	return rtn, nil
}

func readOSWorkspaceScripts(ctx context.Context, spaceId string) ([]wshrpc.OSWorkspaceScript, error) {
	workspace, err := wstore.DBMustGet[*waveobj.Workspace](ctx, spaceId)
	if err != nil {
		return nil, fmt.Errorf("get workspace scripts: %w", err)
	}
	raw := workspace.Meta[osScriptsMetaKey]
	if raw == nil {
		return nil, nil
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return nil, nil
	}
	var items []wshrpc.OSWorkspaceScript
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, nil
	}
	return normalizeOSWorkspaceScripts(items)
}

func writeOSWorkspaceScripts(ctx context.Context, spaceId string, items []wshrpc.OSWorkspaceScript) error {
	data, err := json.Marshal(items)
	if err != nil {
		return fmt.Errorf("encode workspace scripts: %w", err)
	}
	var raw []map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("encode workspace scripts: %w", err)
	}
	err = wstore.DBUpdateFnErr[*waveobj.Workspace](ctx, spaceId, func(workspace *waveobj.Workspace) error {
		if workspace.Meta == nil {
			workspace.Meta = make(waveobj.MetaMapType)
		}
		workspace.Meta[osScriptsMetaKey] = raw
		return nil
	})
	if err != nil {
		return fmt.Errorf("save workspace scripts: %w", err)
	}
	wcore.SendWaveObjUpdate(waveobj.MakeORef(waveobj.OType_Workspace, spaceId))
	return nil
}

func runOSWorkspaceScript(ctx context.Context, root string, command string) (int, string, error) {
	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	cmd.Dir = root
	out, err := cmd.CombinedOutput()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return exitErr.ExitCode(), string(out), nil
		}
		return -1, string(out), err
	}
	return 0, string(out), nil
}

func (ws *WshServer) OSWorkspaceScriptListCommand(ctx context.Context, spaceId string) ([]wshrpc.OSWorkspaceScript, error) {
	if err := validateOSUUID("space id", spaceId); err != nil {
		return nil, err
	}
	return readOSWorkspaceScripts(ctx, spaceId)
}

func (ws *WshServer) OSWorkspaceScriptSaveCommand(ctx context.Context, data wshrpc.OSWorkspaceScriptSaveRequest) ([]wshrpc.OSWorkspaceScript, error) {
	if err := validateOSUUID("space id", data.SpaceId); err != nil {
		return nil, err
	}
	items, err := normalizeOSWorkspaceScripts(data.Scripts)
	if err != nil {
		return nil, err
	}
	if err := writeOSWorkspaceScripts(ctx, data.SpaceId, items); err != nil {
		return nil, err
	}
	return items, nil
}

func (ws *WshServer) OSWorkspaceScriptRunCommand(ctx context.Context, data wshrpc.OSWorkspaceScriptRunRequest) (wshrpc.OSWorkspaceScriptRunResponse, error) {
	if err := validateOSUUID("space id", data.SpaceId); err != nil {
		return wshrpc.OSWorkspaceScriptRunResponse{}, err
	}
	if err := validateOSUUID("script id", data.ScriptId); err != nil {
		return wshrpc.OSWorkspaceScriptRunResponse{}, err
	}
	scripts, err := readOSWorkspaceScripts(ctx, data.SpaceId)
	if err != nil {
		return wshrpc.OSWorkspaceScriptRunResponse{}, err
	}
	var script *wshrpc.OSWorkspaceScript
	for idx := range scripts {
		if scripts[idx].Id == data.ScriptId {
			script = &scripts[idx]
			break
		}
	}
	if script == nil {
		return wshrpc.OSWorkspaceScriptRunResponse{}, fmt.Errorf("script not found")
	}
	profile, err := ws.OSSpaceProfileGetCommand(ctx, data.SpaceId)
	if err != nil {
		return wshrpc.OSWorkspaceScriptRunResponse{}, err
	}
	if len(profile.Roots) == 0 || strings.TrimSpace(profile.Roots[0]) == "" {
		return wshrpc.OSWorkspaceScriptRunResponse{}, fmt.Errorf("no workspace root configured for this space")
	}
	exitCode, output, err := runOSWorkspaceScript(ctx, profile.Roots[0], script.Command)
	if err != nil {
		return wshrpc.OSWorkspaceScriptRunResponse{}, err
	}
	if len(output) > osScriptRunOutputMax {
		output = output[:osScriptRunOutputMax]
	}
	title := script.Stage + ": " + script.Command
	if len(title) > 280 {
		title = title[:280]
	}
	_, _ = ws.OSActivityAppendCommand(ctx, wshrpc.OSSystemEventInput{
		SpaceId: data.SpaceId,
		Kind:    "update",
		Status:  "script-run",
		Title:   title,
		Source:  "os-lifecycle",
		Meta:    map[string]any{"scriptid": script.Id, "exitcode": exitCode, "output": output},
	})
	return wshrpc.OSWorkspaceScriptRunResponse{Ok: exitCode == 0, ExitCode: exitCode, Output: output}, nil
}