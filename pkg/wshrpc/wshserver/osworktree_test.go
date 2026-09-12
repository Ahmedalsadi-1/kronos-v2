// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshserver

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/wavetermdev/waveterm/pkg/wshrpc"
)

func makeTestGitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=test", "GIT_AUTHOR_EMAIL=test@test", "GIT_COMMITTER_NAME=test", "GIT_COMMITTER_EMAIL=test@test")
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %s: %v: %s", strings.Join(args, " "), err, out)
		}
	}
	run("init")
	run("config", "user.email", "test@test")
	run("config", "user.name", "test")
	os.WriteFile(filepath.Join(dir, "README.md"), []byte("test\n"), 0644)
	run("add", ".")
	run("commit", "-m", "init")
	return dir
}

func TestOSWorktreeCreateAndList(t *testing.T) {
	repo := makeTestGitRepo(t)
	ws := &WshServer{}
	ctx := context.Background()

	created, err := ws.OSWorktreeCreateCommand(ctx, wshrpc.OSWorktreeCreateRequest{RepoPath: repo, Name: "agent-one"})
	if err != nil {
		t.Fatalf("create worktree: %v", err)
	}
	if created.Branch != "kronterm/agent-one" {
		t.Errorf("unexpected branch %q", created.Branch)
	}
	if _, err := os.Stat(filepath.Join(created.Path, "README.md")); err != nil {
		t.Errorf("worktree missing checked-out file: %v", err)
	}

	worktrees, err := ws.OSWorktreeListCommand(ctx, repo)
	if err != nil {
		t.Fatalf("list worktrees: %v", err)
	}
	if len(worktrees) != 2 {
		t.Fatalf("expected 2 worktrees, got %d", len(worktrees))
	}
	if !worktrees[0].IsMain {
		t.Errorf("expected first worktree to be main, got %+v", worktrees[0])
	}
	found := false
	for _, wt := range worktrees {
		if wt.Branch == "kronterm/agent-one" {
			found = true
		}
	}
	if !found {
		t.Errorf("created worktree not in list: %+v", worktrees)
	}
}

func TestOSWorktreeRemove(t *testing.T) {
	repo := makeTestGitRepo(t)
	ws := &WshServer{}
	ctx := context.Background()

	created, err := ws.OSWorktreeCreateCommand(ctx, wshrpc.OSWorktreeCreateRequest{RepoPath: repo, Name: "agent-two"})
	if err != nil {
		t.Fatalf("create worktree: %v", err)
	}
	if err := ws.OSWorktreeRemoveCommand(ctx, wshrpc.OSWorktreeRemoveRequest{RepoPath: repo, Path: created.Path, Force: true}); err != nil {
		t.Fatalf("remove worktree: %v", err)
	}
	if _, err := os.Stat(created.Path); !os.IsNotExist(err) {
		t.Errorf("worktree path still exists after removal: %v", err)
	}
	worktrees, _ := ws.OSWorktreeListCommand(ctx, repo)
	for _, wt := range worktrees {
		if wt.Branch == "kronterm/agent-two" {
			t.Errorf("worktree still listed after removal")
		}
	}
}

func TestOSWorktreeValidation(t *testing.T) {
	ws := &WshServer{}
	ctx := context.Background()

	if _, err := ws.OSWorktreeCreateCommand(ctx, wshrpc.OSWorktreeCreateRequest{RepoPath: "/definitely/not/a/repo", Name: "x"}); err == nil {
		t.Errorf("expected error for non-repo path")
	}
	repo := makeTestGitRepo(t)
	if _, err := ws.OSWorktreeCreateCommand(ctx, wshrpc.OSWorktreeCreateRequest{RepoPath: repo, Name: "Bad Name"}); err == nil {
		t.Errorf("expected error for invalid worktree name")
	}
}
