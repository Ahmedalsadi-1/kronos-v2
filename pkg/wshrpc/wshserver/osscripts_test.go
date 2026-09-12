// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshserver

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/wavetermdev/waveterm/pkg/wshrpc"
)

func TestNormalizeOSWorkspaceScripts(t *testing.T) {
	items, err := normalizeOSWorkspaceScripts([]wshrpc.OSWorkspaceScript{
		{Id: "11111111-1111-4111-8111-111111111111", Stage: "run", Command: "echo hi"},
		{Stage: "setup", Command: "npm install"},
		{Stage: "teardown", Command: "rm -rf .cache"},
	})
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("expected 3, got %d", len(items))
	}
	if items[0].Stage != "run" {
		t.Errorf("expected run sorted first, got %q", items[0].Stage)
	}
	if items[1].Id == "" {
		t.Errorf("expected generated id for new script")
	}

	if _, err := normalizeOSWorkspaceScripts([]wshrpc.OSWorkspaceScript{{Stage: "bogus", Command: "x"}}); err == nil {
		t.Errorf("expected error for invalid stage")
	}
	if _, err := normalizeOSWorkspaceScripts([]wshrpc.OSWorkspaceScript{{Stage: "setup", Command: ""}}); err == nil {
		t.Errorf("expected error for empty command")
	}
	if _, err := normalizeOSWorkspaceScripts([]wshrpc.OSWorkspaceScript{{Stage: "setup", Command: strings.Repeat("x", 513)}}); err == nil {
		t.Errorf("expected error for oversized command")
	}

	dupes, err := normalizeOSWorkspaceScripts([]wshrpc.OSWorkspaceScript{
		{Id: "22222222-2222-4222-8222-222222222222", Stage: "run", Command: "a"},
		{Id: "22222222-2222-4222-8222-222222222222", Stage: "run", Command: "b"},
	})
	if err != nil {
		t.Fatalf("normalize dupes: %v", err)
	}
	if len(dupes) != 1 {
		t.Errorf("expected duplicate id dropped, got %d", len(dupes))
	}
}

func TestRunOSWorkspaceScript(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()

	exitCode, _, err := runOSWorkspaceScript(ctx, dir, "echo hi > out.txt")
	if err != nil || exitCode != 0 {
		t.Fatalf("expected success, got exit %d err %v", exitCode, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "out.txt")); err != nil {
		t.Errorf("script did not write file: %v", err)
	}

	exitCode, _, err = runOSWorkspaceScript(ctx, dir, "exit 7")
	if err != nil {
		t.Fatalf("expected nil error for nonzero exit, got %v", err)
	}
	if exitCode != 7 {
		t.Errorf("expected exit 7, got %d", exitCode)
	}

	exitCode, _, err = runOSWorkspaceScript(ctx, dir, "definitely-not-a-real-command-xyz")
	if err != nil {
		t.Fatalf("expected nil error for command-not-found (exit 127), got %v", err)
	}
	if exitCode == 0 {
		t.Errorf("expected nonzero exit for missing command, got %d", exitCode)
	}
}