// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshserver

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
)

const (
	osWorktreeBranchPrefix = "kronterm/"
	osWorktreeMaxNameLen   = 64
)

var osWorktreeNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,63}$`)

func runOSGit(repoPath string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		trimmed := strings.TrimSpace(string(out))
		if trimmed == "" {
			return "", fmt.Errorf("git %s: %w", args[0], err)
		}
		return "", fmt.Errorf("git %s: %s", strings.Join(args, " "), trimmed)
	}
	return string(out), nil
}

func validateOSWorktreeRepo(repoPath string) error {
	repoPath = strings.TrimSpace(repoPath)
	if repoPath == "" || len(repoPath) > 4096 {
		return fmt.Errorf("repopath is required")
	}
	if !filepath.IsAbs(repoPath) {
		return fmt.Errorf("repopath must be absolute")
	}
	out, err := runOSGit(repoPath, "rev-parse", "--git-dir")
	if err != nil {
		return fmt.Errorf("not a git repository: %s", repoPath)
	}
	if strings.TrimSpace(out) == "" {
		return fmt.Errorf("not a git repository: %s", repoPath)
	}
	return nil
}

// OSWorktreeListCommand lists git worktrees for a repository (Superset-style parallel worktree foundation).
func (ws *WshServer) OSWorktreeListCommand(ctx context.Context, repoPath string) ([]wshrpc.OSWorktree, error) {
	if err := validateOSWorktreeRepo(repoPath); err != nil {
		return nil, err
	}
	out, err := runOSGit(repoPath, "worktree", "list", "--porcelain")
	if err != nil {
		return nil, err
	}
	var worktrees []wshrpc.OSWorktree
	var current *wshrpc.OSWorktree
	mainSeen := false
	for _, line := range strings.Split(out, "\n") {
		switch {
		case strings.HasPrefix(line, "worktree "):
			if current != nil {
				worktrees = append(worktrees, *current)
			}
			path := strings.TrimPrefix(line, "worktree ")
			current = &wshrpc.OSWorktree{
				Id:        uuid.NewString(),
				Path:      path,
				Name:      filepath.Base(path),
				CreatedTs: time.Now().UnixMilli(),
			}
			if !mainSeen {
				current.IsMain = true
				mainSeen = true
			}
		case strings.HasPrefix(line, "HEAD "):
			if current != nil {
				current.Head = strings.TrimPrefix(line, "HEAD ")
			}
		case strings.HasPrefix(line, "branch "):
			if current != nil {
				ref := strings.TrimPrefix(line, "branch ")
				current.Branch = strings.TrimPrefix(ref, "refs/heads/")
			}
		}
	}
	if current != nil {
		worktrees = append(worktrees, *current)
	}
	sort.Slice(worktrees, func(i, j int) bool {
		if worktrees[i].IsMain != worktrees[j].IsMain {
			return worktrees[i].IsMain
		}
		return worktrees[i].Path < worktrees[j].Path
	})
	return worktrees, nil
}

// OSWorktreeCreateCommand creates a new git worktree with a kronterm/<name> branch (parallel agent isolation).
func (ws *WshServer) OSWorktreeCreateCommand(ctx context.Context, data wshrpc.OSWorktreeCreateRequest) (wshrpc.OSWorktree, error) {
	if err := validateOSWorktreeRepo(data.RepoPath); err != nil {
		return wshrpc.OSWorktree{}, err
	}
	name := strings.TrimSpace(data.Name)
	if !osWorktreeNamePattern.MatchString(name) {
		return wshrpc.OSWorktree{}, fmt.Errorf("invalid worktree name %q (must match %s)", name, osWorktreeNamePattern.String())
	}
	branch := osWorktreeBranchPrefix + name
	worktreePath := filepath.Join(data.RepoPath, "..", ".kronterm-worktrees", filepath.Base(data.RepoPath), name)
	args := []string{"worktree", "add", "-b", branch, worktreePath}
	if strings.TrimSpace(data.BaseBranch) != "" {
		args = append(args, strings.TrimSpace(data.BaseBranch))
	}
	if _, err := runOSGit(data.RepoPath, args...); err != nil {
		return wshrpc.OSWorktree{}, fmt.Errorf("create worktree: %w", err)
	}
	head, _ := runOSGit(worktreePath, "rev-parse", "HEAD")
	return wshrpc.OSWorktree{
		Id:        uuid.NewString(),
		Path:      worktreePath,
		Branch:    branch,
		Name:      name,
		Head:      strings.TrimSpace(head),
		CreatedTs: time.Now().UnixMilli(),
	}, nil
}

// OSWorktreeRemoveCommand removes a worktree. Force is required when it has uncommitted changes.
func (ws *WshServer) OSWorktreeRemoveCommand(ctx context.Context, data wshrpc.OSWorktreeRemoveRequest) error {
	if err := validateOSWorktreeRepo(data.RepoPath); err != nil {
		return err
	}
	path := strings.TrimSpace(data.Path)
	if path == "" || len(path) > 4096 || !filepath.IsAbs(path) {
		return fmt.Errorf("invalid worktree path")
	}
	args := []string{"worktree", "remove"}
	if data.Force {
		args = append(args, "--force")
	}
	args = append(args, path)
	if _, err := runOSGit(data.RepoPath, args...); err != nil {
		return fmt.Errorf("remove worktree: %w", err)
	}
	branch := filepath.Base(path)
	if _, err := runOSGit(data.RepoPath, "branch", "-D", osWorktreeBranchPrefix+branch); err != nil {
		// branch deletion is best-effort; the worktree removal already succeeded
		_ = err
	}
	return nil
}
