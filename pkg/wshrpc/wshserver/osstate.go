// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshserver

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/wcore"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
	"github.com/wavetermdev/waveterm/pkg/wstore"
)

const (
	osSpaceProfileMetaKey       = "space:profile"
	osSpaceProfileVersion       = 1
	osActivityDefaultLimit      = 100
	osActivityMaxListLimit      = 500
	osActivityRetentionPerSpace = 1000
	osGrantRetentionPerSpace    = 500
	osCheckpointRetention       = 20
	osCheckpointMaxBytes        = 1024 * 1024
	osOnceGrantLifetime         = 15 * time.Minute
	osArtifactShelfLimit        = 200
)

var osIdentifierPattern = regexp.MustCompile(`^[a-z][a-z0-9._:-]{0,95}$`)

var osEventKinds = map[string]bool{
	"agent":        true,
	"approval":     true,
	"app":          true,
	"notification": true,
	"update":       true,
	"recovery":     true,
}

var osGrantCapabilities = map[string]bool{
	"screen-capture": true,
	"accessibility":  true,
	"files":          true,
	"terminal":       true,
	"network":        true,
	"microphone":     true,
	"clipboard":      true,
}

var osGrantScopes = map[string]bool{
	"once":  true,
	"run":   true,
	"space": true,
}

var osArtifactKinds = map[string]bool{
	"file":               true,
	"folder":             true,
	"repository":         true,
	"url":                true,
	"generated-artifact": true,
}

var osCheckpointReasons = map[string]bool{
	"startup":   true,
	"manual":    true,
	"crash":     true,
	"update":    true,
	"sleep":     true,
	"periodic":  true,
	"migration": true,
}

var osSensitiveCheckpointKeys = []string{
	"password",
	"secret",
	"token",
	"clipboard",
	"terminaloutput",
	"terminal-output",
	"hiddenreasoning",
	"hidden-reasoning",
	"chainofthought",
	"chain-of-thought",
}

func normalizeOSSpaceProfile(profile wshrpc.OSSpaceProfile) (wshrpc.OSSpaceProfile, error) {
	if profile.Version == 0 {
		profile.Version = osSpaceProfileVersion
	}
	if profile.Version != osSpaceProfileVersion {
		return profile, fmt.Errorf("unsupported space profile version %d", profile.Version)
	}
	if profile.RestorePolicy == "" {
		profile.RestorePolicy = "smart"
	}
	if profile.RestorePolicy != "smart" && profile.RestorePolicy != "manual" && profile.RestorePolicy != "auto" {
		return profile, fmt.Errorf("invalid restore policy %q", profile.RestorePolicy)
	}
	if len(profile.Roots) > 32 {
		return profile, fmt.Errorf("space profile has too many roots")
	}
	if len(profile.PinnedAppIds) > 128 {
		return profile, fmt.Errorf("space profile has too many pinned applications")
	}
	profile.Roots = compactOSStrings(profile.Roots, 4096)
	profile.PinnedAppIds = compactOSStrings(profile.PinnedAppIds, 256)
	profile.ArtifactShelf = normalizeOSArtifactShelf(profile.ArtifactShelf)
	return profile, nil
}

func normalizeOSArtifactShelf(items []wshrpc.OSArtifactShelfItem) []wshrpc.OSArtifactShelfItem {
	seen := make(map[string]bool)
	rtn := make([]wshrpc.OSArtifactShelfItem, 0, min(len(items), osArtifactShelfLimit))
	for _, item := range items {
		item.Id = strings.TrimSpace(item.Id)
		item.Kind = strings.TrimSpace(item.Kind)
		item.Name = strings.TrimSpace(item.Name)
		item.Resource = strings.TrimSpace(item.Resource)
		item.Detail = strings.TrimSpace(item.Detail)
		key := item.Kind + "\x00" + item.Resource
		if !osArtifactKinds[item.Kind] || item.Id == "" || len(item.Id) > 8256 || item.Name == "" || len(item.Name) > 256 ||
			item.Resource == "" || len(item.Resource) > 8192 || len(item.Detail) > 512 || seen[key] {
			continue
		}
		seen[key] = true
		rtn = append(rtn, item)
		if len(rtn) == osArtifactShelfLimit {
			break
		}
	}
	return rtn
}

func compactOSStrings(values []string, maxLength int) []string {
	seen := make(map[string]bool)
	rtn := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || len(value) > maxLength || seen[value] {
			continue
		}
		seen[value] = true
		rtn = append(rtn, value)
	}
	return rtn
}

func validateOSUUID(name string, value string) error {
	if _, err := uuid.Parse(value); err != nil {
		return fmt.Errorf("invalid %s", name)
	}
	return nil
}

func validateOSIdentifier(name string, value string) error {
	if !osIdentifierPattern.MatchString(value) {
		return fmt.Errorf("invalid %s", name)
	}
	return nil
}

func (ws *WshServer) OSSpaceProfileGetCommand(ctx context.Context, spaceId string) (wshrpc.OSSpaceProfile, error) {
	if err := validateOSUUID("space id", spaceId); err != nil {
		return wshrpc.OSSpaceProfile{}, err
	}
	workspace, err := wstore.DBMustGet[*waveobj.Workspace](ctx, spaceId)
	if err != nil {
		return wshrpc.OSSpaceProfile{}, fmt.Errorf("get space profile: %w", err)
	}
	profile := wshrpc.OSSpaceProfile{Version: osSpaceProfileVersion, RestorePolicy: "smart"}
	rawProfile := workspace.Meta[osSpaceProfileMetaKey]
	if rawProfile == nil {
		return profile, nil
	}
	data, err := json.Marshal(rawProfile)
	if err != nil {
		return profile, nil
	}
	if err := json.Unmarshal(data, &profile); err != nil {
		return wshrpc.OSSpaceProfile{Version: osSpaceProfileVersion, RestorePolicy: "smart"}, nil
	}
	return normalizeOSSpaceProfile(profile)
}

func (ws *WshServer) OSSpaceProfileSetCommand(
	ctx context.Context,
	data wshrpc.OSSpaceProfileSetRequest,
) (wshrpc.OSSpaceProfile, error) {
	if err := validateOSUUID("space id", data.SpaceId); err != nil {
		return wshrpc.OSSpaceProfile{}, err
	}
	profile, err := normalizeOSSpaceProfile(data.Profile)
	if err != nil {
		return wshrpc.OSSpaceProfile{}, err
	}
	profileData, err := json.Marshal(profile)
	if err != nil {
		return wshrpc.OSSpaceProfile{}, fmt.Errorf("encode space profile: %w", err)
	}
	var profileMap map[string]any
	if err := json.Unmarshal(profileData, &profileMap); err != nil {
		return wshrpc.OSSpaceProfile{}, fmt.Errorf("encode space profile: %w", err)
	}
	err = wstore.DBUpdateFnErr[*waveobj.Workspace](ctx, data.SpaceId, func(workspace *waveobj.Workspace) error {
		if workspace.Meta == nil {
			workspace.Meta = make(waveobj.MetaMapType)
		}
		workspace.Meta[osSpaceProfileMetaKey] = profileMap
		return nil
	})
	if err != nil {
		return wshrpc.OSSpaceProfile{}, fmt.Errorf("save space profile: %w", err)
	}
	wcore.SendWaveObjUpdate(waveobj.MakeORef(waveobj.OType_Workspace, data.SpaceId))
	return profile, nil
}

func normalizeOSSystemEvent(data wshrpc.OSSystemEventInput) (*waveobj.OSSystemEvent, error) {
	if err := validateOSUUID("space id", data.SpaceId); err != nil {
		return nil, err
	}
	if !osEventKinds[data.Kind] {
		return nil, fmt.Errorf("invalid system event kind %q", data.Kind)
	}
	if err := validateOSIdentifier("system event status", data.Status); err != nil {
		return nil, err
	}
	title := strings.TrimSpace(data.Title)
	if title == "" || len(title) > 280 {
		return nil, fmt.Errorf("system event title must be between 1 and 280 characters")
	}
	if data.Source != "" {
		if err := validateOSIdentifier("system event source", data.Source); err != nil {
			return nil, err
		}
	}
	if data.BlockId != "" {
		if err := validateOSUUID("block id", data.BlockId); err != nil {
			return nil, err
		}
	}
	actions := compactOSStrings(data.Actions, 96)
	for _, action := range actions {
		if err := validateOSIdentifier("system event action", action); err != nil {
			return nil, err
		}
	}
	meta := make(waveobj.MetaMapType, len(data.Meta))
	for key, value := range data.Meta {
		key = strings.TrimSpace(key)
		if key == "" || len(key) > 64 {
			return nil, fmt.Errorf("invalid system event meta key")
		}
		meta[key] = value
	}
	return &waveobj.OSSystemEvent{
		OID:       uuid.NewString(),
		SpaceId:   data.SpaceId,
		Kind:      data.Kind,
		Status:    data.Status,
		Title:     title,
		Source:    data.Source,
		BlockId:   data.BlockId,
		CreatedTs: time.Now().UnixMilli(),
		Actions:   actions,
		Meta:      meta,
	}, nil
}

func (ws *WshServer) OSActivityAppendCommand(
	ctx context.Context,
	data wshrpc.OSSystemEventInput,
) (*waveobj.OSSystemEvent, error) {
	event, err := normalizeOSSystemEvent(data)
	if err != nil {
		return nil, err
	}
	if err := wstore.DBInsert(ctx, event); err != nil {
		return nil, fmt.Errorf("append system event: %w", err)
	}
	if err := pruneOSActivity(ctx, data.SpaceId); err != nil {
		return nil, err
	}
	return event, nil
}

func (ws *WshServer) OSActivityListCommand(
	ctx context.Context,
	data wshrpc.OSActivityListRequest,
) ([]*waveobj.OSSystemEvent, error) {
	if err := validateOSUUID("space id", data.SpaceId); err != nil {
		return nil, err
	}
	limit := data.Limit
	if limit <= 0 {
		limit = osActivityDefaultLimit
	}
	if limit > osActivityMaxListLimit {
		limit = osActivityMaxListLimit
	}
	events, err := wstore.DBGetAllObjsByType[*waveobj.OSSystemEvent](ctx, waveobj.OType_OSSystemEvent)
	if err != nil {
		return nil, fmt.Errorf("list system events: %w", err)
	}
	filtered := make([]*waveobj.OSSystemEvent, 0, limit)
	for _, event := range events {
		if event.SpaceId == data.SpaceId && (data.IncludeRead || event.ReadTs == 0) {
			filtered = append(filtered, event)
		}
	}
	sort.Slice(filtered, func(i int, j int) bool { return filtered[i].CreatedTs > filtered[j].CreatedTs })
	if len(filtered) > limit {
		filtered = filtered[:limit]
	}
	return filtered, nil
}

func (ws *WshServer) OSActivityReadCommand(ctx context.Context, data wshrpc.OSActivityReadRequest) error {
	if err := validateOSUUID("space id", data.SpaceId); err != nil {
		return err
	}
	if !data.All && len(data.EventIds) == 0 {
		return fmt.Errorf("event ids are required unless all is set")
	}
	eventIds := make(map[string]bool, len(data.EventIds))
	for _, eventId := range data.EventIds {
		if err := validateOSUUID("event id", eventId); err != nil {
			return err
		}
		eventIds[eventId] = true
	}
	events, err := wstore.DBGetAllObjsByType[*waveobj.OSSystemEvent](ctx, waveobj.OType_OSSystemEvent)
	if err != nil {
		return fmt.Errorf("list system events: %w", err)
	}
	now := time.Now().UnixMilli()
	for _, event := range events {
		if event.SpaceId != data.SpaceId || (!data.All && !eventIds[event.OID]) || event.ReadTs != 0 {
			continue
		}
		event.ReadTs = now
		if err := wstore.DBUpdate(ctx, event); err != nil {
			return fmt.Errorf("mark system event read: %w", err)
		}
	}
	return nil
}

func normalizeOSCapabilityGrant(data wshrpc.OSCapabilityGrantRequest) (*waveobj.OSCapabilityGrant, error) {
	if err := validateOSUUID("space id", data.SpaceId); err != nil {
		return nil, err
	}
	if !osGrantCapabilities[data.Capability] {
		return nil, fmt.Errorf("unsupported capability %q", data.Capability)
	}
	if !osGrantScopes[data.Scope] {
		return nil, fmt.Errorf("invalid capability scope %q", data.Scope)
	}
	if strings.TrimSpace(data.AgentSessionId) == "" || len(data.AgentSessionId) > 256 {
		return nil, fmt.Errorf("agent session id is required")
	}
	resource := strings.TrimSpace(data.Resource)
	if len(resource) > 4096 {
		return nil, fmt.Errorf("capability resource is too long")
	}
	now := time.Now()
	expiresTs := data.ExpiresTs
	if data.Scope == "once" && expiresTs == 0 {
		expiresTs = now.Add(osOnceGrantLifetime).UnixMilli()
	}
	if expiresTs != 0 && expiresTs <= now.UnixMilli() {
		return nil, fmt.Errorf("capability expiration must be in the future")
	}
	return &waveobj.OSCapabilityGrant{
		OID:            uuid.NewString(),
		SpaceId:        data.SpaceId,
		Capability:     data.Capability,
		Scope:          data.Scope,
		Resource:       resource,
		AgentSessionId: strings.TrimSpace(data.AgentSessionId),
		CreatedTs:      now.UnixMilli(),
		ExpiresTs:      expiresTs,
		Meta:           make(waveobj.MetaMapType),
	}, nil
}

func (ws *WshServer) OSCapabilityGrantCommand(
	ctx context.Context,
	data wshrpc.OSCapabilityGrantRequest,
) (*waveobj.OSCapabilityGrant, error) {
	grant, err := normalizeOSCapabilityGrant(data)
	if err != nil {
		return nil, err
	}
	if err := wstore.DBInsert(ctx, grant); err != nil {
		return nil, fmt.Errorf("save capability grant: %w", err)
	}
	if err := pruneOSGrants(ctx, data.SpaceId); err != nil {
		return nil, err
	}
	return grant, nil
}

func (ws *WshServer) OSCapabilityListCommand(
	ctx context.Context,
	data wshrpc.OSCapabilityListRequest,
) ([]*waveobj.OSCapabilityGrant, error) {
	if err := validateOSUUID("space id", data.SpaceId); err != nil {
		return nil, err
	}
	grants, err := wstore.DBGetAllObjsByType[*waveobj.OSCapabilityGrant](ctx, waveobj.OType_OSCapabilityGrant)
	if err != nil {
		return nil, fmt.Errorf("list capability grants: %w", err)
	}
	now := time.Now().UnixMilli()
	filtered := make([]*waveobj.OSCapabilityGrant, 0, len(grants))
	for _, grant := range grants {
		if grant.SpaceId != data.SpaceId {
			continue
		}
		if data.AgentSessionId != "" && grant.AgentSessionId != data.AgentSessionId {
			continue
		}
		inactive := grant.RevokedTs != 0 || (grant.ExpiresTs != 0 && grant.ExpiresTs <= now)
		if !data.IncludeInactive && inactive {
			continue
		}
		filtered = append(filtered, grant)
	}
	sort.Slice(filtered, func(i int, j int) bool { return filtered[i].CreatedTs > filtered[j].CreatedTs })
	return filtered, nil
}

func (ws *WshServer) OSCapabilityRevokeCommand(ctx context.Context, grantId string) error {
	if err := validateOSUUID("grant id", grantId); err != nil {
		return err
	}
	grant, err := wstore.DBMustGet[*waveobj.OSCapabilityGrant](ctx, grantId)
	if err != nil {
		return fmt.Errorf("get capability grant: %w", err)
	}
	if grant.RevokedTs != 0 {
		return nil
	}
	grant.RevokedTs = time.Now().UnixMilli()
	if err := wstore.DBUpdate(ctx, grant); err != nil {
		return fmt.Errorf("revoke capability grant: %w", err)
	}
	return nil
}

func validateOSCheckpoint(data wshrpc.OSCheckpointSaveRequest) (map[string]any, error) {
	if err := validateOSUUID("space id", data.SpaceId); err != nil {
		return nil, err
	}
	if err := validateOSUUID("tab id", data.TabId); err != nil {
		return nil, err
	}
	if !osCheckpointReasons[data.Reason] {
		return nil, fmt.Errorf("invalid checkpoint reason %q", data.Reason)
	}
	if len(data.SnapshotJson) == 0 || len(data.SnapshotJson) > osCheckpointMaxBytes {
		return nil, fmt.Errorf("checkpoint snapshot must be between 1 byte and %d bytes", osCheckpointMaxBytes)
	}
	var snapshot map[string]any
	if err := json.Unmarshal([]byte(data.SnapshotJson), &snapshot); err != nil {
		return nil, fmt.Errorf("checkpoint snapshot must be a JSON object: %w", err)
	}
	if containsOSSensitiveCheckpointKey(snapshot) {
		return nil, fmt.Errorf("checkpoint snapshot contains a prohibited sensitive field")
	}
	return snapshot, nil
}

func containsOSSensitiveCheckpointKey(value any) bool {
	switch typedValue := value.(type) {
	case map[string]any:
		for key, child := range typedValue {
			normalizedKey := strings.ToLower(strings.NewReplacer("_", "", "-", "", ":", "", " ", "").Replace(key))
			for _, prohibited := range osSensitiveCheckpointKeys {
				normalizedProhibited := strings.NewReplacer("-", "", "_", "").Replace(prohibited)
				if strings.Contains(normalizedKey, normalizedProhibited) {
					return true
				}
			}
			if containsOSSensitiveCheckpointKey(child) {
				return true
			}
		}
	case []any:
		for _, child := range typedValue {
			if containsOSSensitiveCheckpointKey(child) {
				return true
			}
		}
	}
	return false
}

func (ws *WshServer) OSCheckpointSaveCommand(
	ctx context.Context,
	data wshrpc.OSCheckpointSaveRequest,
) (*waveobj.OSRecoveryCheckpoint, error) {
	if _, err := validateOSCheckpoint(data); err != nil {
		return nil, err
	}
	checkpoint := &waveobj.OSRecoveryCheckpoint{
		OID:          uuid.NewString(),
		SpaceId:      data.SpaceId,
		TabId:        data.TabId,
		Reason:       data.Reason,
		SnapshotJson: data.SnapshotJson,
		CreatedTs:    time.Now().UnixMilli(),
		Meta:         make(waveobj.MetaMapType),
	}
	if err := wstore.DBInsert(ctx, checkpoint); err != nil {
		return nil, fmt.Errorf("save recovery checkpoint: %w", err)
	}
	if err := pruneOSCheckpoints(ctx, data.SpaceId); err != nil {
		return nil, err
	}
	return checkpoint, nil
}

func (ws *WshServer) OSCheckpointLatestCommand(
	ctx context.Context,
	data wshrpc.OSCheckpointLatestRequest,
) (*waveobj.OSRecoveryCheckpoint, error) {
	if err := validateOSUUID("space id", data.SpaceId); err != nil {
		return nil, err
	}
	if data.TabId != "" {
		if err := validateOSUUID("tab id", data.TabId); err != nil {
			return nil, err
		}
	}
	checkpoints, err := wstore.DBGetAllObjsByType[*waveobj.OSRecoveryCheckpoint](ctx, waveobj.OType_OSCheckpoint)
	if err != nil {
		return nil, fmt.Errorf("list recovery checkpoints: %w", err)
	}
	var latest *waveobj.OSRecoveryCheckpoint
	for _, checkpoint := range checkpoints {
		if checkpoint.SpaceId != data.SpaceId || (data.TabId != "" && checkpoint.TabId != data.TabId) {
			continue
		}
		if latest == nil || checkpoint.CreatedTs > latest.CreatedTs {
			latest = checkpoint
		}
	}
	return latest, nil
}

func pruneOSActivity(ctx context.Context, spaceId string) error {
	events, err := wstore.DBGetAllObjsByType[*waveobj.OSSystemEvent](ctx, waveobj.OType_OSSystemEvent)
	if err != nil {
		return fmt.Errorf("prune system events: %w", err)
	}
	spaceEvents := make([]*waveobj.OSSystemEvent, 0, len(events))
	for _, event := range events {
		if event.SpaceId == spaceId {
			spaceEvents = append(spaceEvents, event)
		}
	}
	sort.Slice(spaceEvents, func(i int, j int) bool { return spaceEvents[i].CreatedTs > spaceEvents[j].CreatedTs })
	for _, event := range spaceEvents[min(len(spaceEvents), osActivityRetentionPerSpace):] {
		if event.Kind == "approval" && event.Status == "approval-required" {
			continue
		}
		if err := wstore.DBDelete(ctx, waveobj.OType_OSSystemEvent, event.OID); err != nil {
			return fmt.Errorf("prune system event: %w", err)
		}
	}
	return nil
}

func pruneOSGrants(ctx context.Context, spaceId string) error {
	grants, err := wstore.DBGetAllObjsByType[*waveobj.OSCapabilityGrant](ctx, waveobj.OType_OSCapabilityGrant)
	if err != nil {
		return fmt.Errorf("prune capability grants: %w", err)
	}
	spaceGrants := make([]*waveobj.OSCapabilityGrant, 0, len(grants))
	for _, grant := range grants {
		if grant.SpaceId == spaceId {
			spaceGrants = append(spaceGrants, grant)
		}
	}
	sort.Slice(spaceGrants, func(i int, j int) bool { return spaceGrants[i].CreatedTs > spaceGrants[j].CreatedTs })
	now := time.Now().UnixMilli()
	for _, grant := range spaceGrants[min(len(spaceGrants), osGrantRetentionPerSpace):] {
		if grant.RevokedTs == 0 && (grant.ExpiresTs == 0 || grant.ExpiresTs > now) {
			continue
		}
		if err := wstore.DBDelete(ctx, waveobj.OType_OSCapabilityGrant, grant.OID); err != nil {
			return fmt.Errorf("prune capability grant: %w", err)
		}
	}
	return nil
}

func pruneOSCheckpoints(ctx context.Context, spaceId string) error {
	checkpoints, err := wstore.DBGetAllObjsByType[*waveobj.OSRecoveryCheckpoint](ctx, waveobj.OType_OSCheckpoint)
	if err != nil {
		return fmt.Errorf("prune recovery checkpoints: %w", err)
	}
	spaceCheckpoints := make([]*waveobj.OSRecoveryCheckpoint, 0, len(checkpoints))
	for _, checkpoint := range checkpoints {
		if checkpoint.SpaceId == spaceId {
			spaceCheckpoints = append(spaceCheckpoints, checkpoint)
		}
	}
	sort.Slice(spaceCheckpoints, func(i int, j int) bool {
		return spaceCheckpoints[i].CreatedTs > spaceCheckpoints[j].CreatedTs
	})
	for _, checkpoint := range spaceCheckpoints[min(len(spaceCheckpoints), osCheckpointRetention):] {
		if err := wstore.DBDelete(ctx, waveobj.OType_OSCheckpoint, checkpoint.OID); err != nil {
			return fmt.Errorf("prune recovery checkpoint: %w", err)
		}
	}
	return nil
}
