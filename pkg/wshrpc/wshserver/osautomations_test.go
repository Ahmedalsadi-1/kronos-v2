// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshserver

import (
	"strings"
	"testing"
	"time"

	"github.com/wavetermdev/waveterm/pkg/wshrpc"
)

func TestNormalizeOSAutomations(t *testing.T) {
	now := time.Now()
	items, err := normalizeOSAutomations([]wshrpc.OSAutomation{
		{Name: "Triage", Schedule: "@daily", Prompt: "triage issues", Enabled: true},
		{Name: "Deps", Schedule: "@weekly", Enabled: false},
	}, now)
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2, got %d", len(items))
	}
	if items[0].Id == "" {
		t.Errorf("expected generated id")
	}
	if items[0].LastRunTs != now.UnixMilli() {
		t.Errorf("expected LastRunTs seeded to now, got %d", items[0].LastRunTs)
	}
	if strings.ToLower(items[0].Name) > strings.ToLower(items[1].Name) {
		t.Errorf("expected sorted output, got %q then %q", items[0].Name, items[1].Name)
	}

	if _, err := normalizeOSAutomations([]wshrpc.OSAutomation{{Name: "X", Schedule: "@bogus"}}, now); err == nil {
		t.Errorf("expected error for unknown schedule")
	}
	if _, err := normalizeOSAutomations([]wshrpc.OSAutomation{{Name: "", Schedule: "@daily"}}, now); err == nil {
		t.Errorf("expected error for empty name")
	}
	if _, err := normalizeOSAutomations([]wshrpc.OSAutomation{{Name: strings.Repeat("x", 4001), Schedule: "@daily"}}, now); err == nil {
		t.Errorf("expected error for oversized prompt")
	}

	dupes, err := normalizeOSAutomations([]wshrpc.OSAutomation{
		{Id: "11111111-1111-4111-8111-111111111111", Name: "A", Schedule: "@15m"},
		{Id: "11111111-1111-4111-8111-111111111111", Name: "B", Schedule: "@15m"},
	}, now)
	if err != nil {
		t.Fatalf("normalize dupes: %v", err)
	}
	if len(dupes) != 1 {
		t.Errorf("expected duplicate id dropped, got %d", len(dupes))
	}
}

func TestOSAutomationDue(t *testing.T) {
	now := time.Now()
	hourly := wshrpc.OSAutomation{Id: "a", Name: "x", Schedule: "@hourly", Enabled: true, LastRunTs: now.Add(-2 * time.Hour).UnixMilli()}
	if !osAutomationDue(hourly, now) {
		t.Errorf("expected due after 2h with @hourly")
	}
	hourly.LastRunTs = now.Add(-10 * time.Minute).UnixMilli()
	if osAutomationDue(hourly, now) {
		t.Errorf("expected not due after 10m with @hourly")
	}
	hourly.Enabled = false
	if osAutomationDue(hourly, now) {
		t.Errorf("expected disabled automation never due")
	}
	hourly.Enabled = true
	hourly.Schedule = "@nonsense"
	if osAutomationDue(hourly, now) {
		t.Errorf("expected unknown schedule never due")
	}
}