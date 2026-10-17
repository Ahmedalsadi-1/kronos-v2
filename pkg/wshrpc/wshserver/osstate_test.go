// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshserver

import (
	"testing"
	"time"

	"github.com/wavetermdev/waveterm/pkg/wshrpc"
)

const (
	testOSSpaceId = "27eff9f2-b121-4d9e-91e8-6f0250be7547"
	testOSTabId   = "4e405766-030b-44b8-a62f-3dadf8aaec65"
)

func TestNormalizeOSSpaceProfile(t *testing.T) {
	profile, err := normalizeOSSpaceProfile(wshrpc.OSSpaceProfile{
		Roots:         []string{" /repo ", "/repo", ""},
		PinnedAppIds:  []string{"view:term", "view:term", "app:browser"},
		RestorePolicy: "",
		ArtifactShelf: []wshrpc.OSArtifactShelfItem{
			{Id: "local:/repo/report.md", Kind: "file", Name: "Report", Resource: "/repo/report.md"},
			{Id: "duplicate", Kind: "file", Name: "Report copy", Resource: "/repo/report.md"},
			{Id: "invalid", Kind: "secret", Name: "Do not keep", Resource: "/repo/.env"},
		},
	})
	if err != nil {
		t.Fatalf("normalize profile: %v", err)
	}
	if profile.Version != 1 || profile.RestorePolicy != "smart" {
		t.Fatalf("unexpected defaults: %#v", profile)
	}
	if len(profile.Roots) != 1 || profile.Roots[0] != "/repo" {
		t.Fatalf("roots were not normalized: %#v", profile.Roots)
	}
	if len(profile.PinnedAppIds) != 2 {
		t.Fatalf("pinned app ids were not deduplicated: %#v", profile.PinnedAppIds)
	}
	if len(profile.ArtifactShelf) != 1 || profile.ArtifactShelf[0].Name != "Report" {
		t.Fatalf("artifact shelf was not normalized: %#v", profile.ArtifactShelf)
	}
}

func TestNormalizeOSSystemEventRejectsUnboundedOrUnknownData(t *testing.T) {
	event, err := normalizeOSSystemEvent(wshrpc.OSSystemEventInput{
		SpaceId: testOSSpaceId,
		Kind:    "agent",
		Status:  "running",
		Title:   "Running project checks",
		Source:  "kronos",
		Actions: []string{"os.activity.interrupt", "os.activity.interrupt"},
	})
	if err != nil {
		t.Fatalf("normalize event: %v", err)
	}
	if event.Title != "Running project checks" || len(event.Actions) != 1 {
		t.Fatalf("unexpected event: %#v", event)
	}
	_, err = normalizeOSSystemEvent(wshrpc.OSSystemEventInput{
		SpaceId: testOSSpaceId,
		Kind:    "reasoning",
		Status:  "running",
		Title:   "private data",
	})
	if err == nil {
		t.Fatal("expected unknown event kind to be rejected")
	}
}

func TestNormalizeOSCapabilityGrantAppliesOnceExpiration(t *testing.T) {
	before := time.Now().Add(14 * time.Minute).UnixMilli()
	grant, err := normalizeOSCapabilityGrant(wshrpc.OSCapabilityGrantRequest{
		SpaceId:        testOSSpaceId,
		Capability:     "clipboard",
		Scope:          "once",
		AgentSessionId: "agent-run-1",
	})
	if err != nil {
		t.Fatalf("normalize grant: %v", err)
	}
	if grant.ExpiresTs < before {
		t.Fatalf("once grant should expire automatically: %#v", grant)
	}
	_, err = normalizeOSCapabilityGrant(wshrpc.OSCapabilityGrantRequest{
		SpaceId:        testOSSpaceId,
		Capability:     "credentials",
		Scope:          "space",
		AgentSessionId: "agent-run-1",
	})
	if err == nil {
		t.Fatal("expected unsupported capability to be rejected")
	}
}

func TestValidateOSCheckpointRejectsSensitiveFields(t *testing.T) {
	_, err := validateOSCheckpoint(wshrpc.OSCheckpointSaveRequest{
		SpaceId:      testOSSpaceId,
		TabId:        testOSTabId,
		Reason:       "periodic",
		SnapshotJson: `{"version":3,"scene":{"kind":"freeform"}}`,
	})
	if err != nil {
		t.Fatalf("validate safe checkpoint: %v", err)
	}
	_, err = validateOSCheckpoint(wshrpc.OSCheckpointSaveRequest{
		SpaceId:      testOSSpaceId,
		TabId:        testOSTabId,
		Reason:       "periodic",
		SnapshotJson: `{"window":{"terminal_output":"secret"}}`,
	})
	if err == nil {
		t.Fatal("expected terminal output to be rejected")
	}
}
