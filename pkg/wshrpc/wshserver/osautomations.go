// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshserver

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wcore"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
	"github.com/wavetermdev/waveterm/pkg/wstore"
)

const (
	osAutomationsMetaKey  = "os:automations"
	osAutomationMaxPrompt = 4000
	osAutomationMaxCount  = 50
)

var osAutomationSchedules = map[string]time.Duration{
	"@15m":    15 * time.Minute,
	"@hourly": time.Hour,
	"@daily":  24 * time.Hour,
	"@weekly": 7 * 24 * time.Hour,
}

func normalizeOSAutomations(items []wshrpc.OSAutomation, now time.Time) ([]wshrpc.OSAutomation, error) {
	seen := make(map[string]bool)
	rtn := make([]wshrpc.OSAutomation, 0, min(len(items), osAutomationMaxCount))
	for _, item := range items {
		item.Id = strings.TrimSpace(item.Id)
		if item.Id == "" {
			item.Id = uuid.NewString()
		}
		if err := validateOSUUID("automation id", item.Id); err != nil {
			return nil, err
		}
		item.Name = strings.TrimSpace(item.Name)
		if item.Name == "" || len(item.Name) > 64 {
			return nil, fmt.Errorf("automation name must be between 1 and 64 characters")
		}
		if _, ok := osAutomationSchedules[item.Schedule]; !ok {
			return nil, fmt.Errorf("invalid automation schedule %q (supported: @15m, @hourly, @daily, @weekly)", item.Schedule)
		}
		item.Prompt = strings.TrimSpace(item.Prompt)
		if len(item.Prompt) > osAutomationMaxPrompt {
			return nil, fmt.Errorf("automation prompt is too long (max %d characters)", osAutomationMaxPrompt)
		}
		if seen[item.Id] {
			continue
		}
		if item.LastRunTs == 0 {
			item.LastRunTs = now.UnixMilli()
		}
		seen[item.Id] = true
		rtn = append(rtn, item)
		if len(rtn) == osAutomationMaxCount {
			break
		}
	}
	sort.Slice(rtn, func(i, j int) bool { return strings.ToLower(rtn[i].Name) < strings.ToLower(rtn[j].Name) })
	return rtn, nil
}

func osAutomationDue(item wshrpc.OSAutomation, now time.Time) bool {
	interval, ok := osAutomationSchedules[item.Schedule]
	if !item.Enabled || !ok {
		return false
	}
	return now.UnixMilli()-item.LastRunTs >= interval.Milliseconds()
}

func readOSAutomations(ctx context.Context, spaceId string) ([]wshrpc.OSAutomation, error) {
	workspace, err := wstore.DBMustGet[*waveobj.Workspace](ctx, spaceId)
	if err != nil {
		return nil, fmt.Errorf("get automations: %w", err)
	}
	raw := workspace.Meta[osAutomationsMetaKey]
	if raw == nil {
		return nil, nil
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return nil, nil
	}
	var items []wshrpc.OSAutomation
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, nil
	}
	return normalizeOSAutomations(items, time.Now())
}

func writeOSAutomations(ctx context.Context, spaceId string, items []wshrpc.OSAutomation) error {
	data, err := json.Marshal(items)
	if err != nil {
		return fmt.Errorf("encode automations: %w", err)
	}
	var raw []map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("encode automations: %w", err)
	}
	err = wstore.DBUpdateFnErr[*waveobj.Workspace](ctx, spaceId, func(workspace *waveobj.Workspace) error {
		if workspace.Meta == nil {
			workspace.Meta = make(waveobj.MetaMapType)
		}
		workspace.Meta[osAutomationsMetaKey] = raw
		return nil
	})
	if err != nil {
		return fmt.Errorf("save automations: %w", err)
	}
	wcore.SendWaveObjUpdate(waveobj.MakeORef(waveobj.OType_Workspace, spaceId))
	return nil
}

func (ws *WshServer) OSAutomationListCommand(ctx context.Context, spaceId string) ([]wshrpc.OSAutomation, error) {
	if err := validateOSUUID("space id", spaceId); err != nil {
		return nil, err
	}
	return readOSAutomations(ctx, spaceId)
}

func (ws *WshServer) OSAutomationSaveCommand(ctx context.Context, data wshrpc.OSAutomationSaveRequest) ([]wshrpc.OSAutomation, error) {
	if err := validateOSUUID("space id", data.SpaceId); err != nil {
		return nil, err
	}
	items, err := normalizeOSAutomations(data.Automations, time.Now())
	if err != nil {
		return nil, err
	}
	if err := writeOSAutomations(ctx, data.SpaceId, items); err != nil {
		return nil, err
	}
	ensureOSAutomationTicker(ws)
	return items, nil
}

func fireOSAutomation(ctx context.Context, ws *WshServer, spaceId string, item wshrpc.OSAutomation) error {
	_, err := ws.OSActivityAppendCommand(ctx, wshrpc.OSSystemEventInput{
		SpaceId: spaceId,
		Kind:    "agent",
		Status:  "automation-run",
		Title:   "Automation: " + item.Name,
		Source:  "os-automation",
		Meta:    map[string]any{"automationid": item.Id, "prompt": item.Prompt},
	})
	return err
}

func (ws *WshServer) OSAutomationRunCommand(ctx context.Context, data wshrpc.OSAutomationRunRequest) error {
	if err := validateOSUUID("space id", data.SpaceId); err != nil {
		return err
	}
	if err := validateOSUUID("automation id", data.AutomationId); err != nil {
		return err
	}
	items, err := readOSAutomations(ctx, data.SpaceId)
	if err != nil {
		return err
	}
	for idx := range items {
		if items[idx].Id != data.AutomationId {
			continue
		}
		items[idx].LastRunTs = time.Now().UnixMilli()
		if err := writeOSAutomations(ctx, data.SpaceId, items); err != nil {
			return err
		}
		return fireOSAutomation(ctx, ws, data.SpaceId, items[idx])
	}
	return fmt.Errorf("automation not found")
}

func RunDueOSAutomations(ctx context.Context, ws *WshServer, now time.Time) (int, error) {
	workspaces, err := wstore.DBGetAllObjsByType[*waveobj.Workspace](ctx, waveobj.OType_Workspace)
	if err != nil {
		return 0, fmt.Errorf("list workspaces: %w", err)
	}
	fired := 0
	for _, workspace := range workspaces {
		items, err := readOSAutomations(ctx, workspace.OID)
		if err != nil || len(items) == 0 {
			continue
		}
		changed := false
		for idx := range items {
			if !osAutomationDue(items[idx], now) {
				continue
			}
			if err := fireOSAutomation(ctx, ws, workspace.OID, items[idx]); err != nil {
				return fired, err
			}
			items[idx].LastRunTs = now.UnixMilli()
			changed = true
			fired++
		}
		if changed {
			if err := writeOSAutomations(ctx, workspace.OID, items); err != nil {
				return fired, err
			}
		}
	}
	return fired, nil
}

var osAutomationTickerOnce sync.Once

func ensureOSAutomationTicker(ws *WshServer) {
	osAutomationTickerOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(time.Minute)
			defer ticker.Stop()
			for now := range ticker.C {
				fired, err := RunDueOSAutomations(context.Background(), ws, now)
				if err != nil {
					log.Printf("automation scheduler: %v", err)
				} else if fired > 0 {
					log.Printf("automation scheduler: fired %d", fired)
				}
			}
		}()
	})
}