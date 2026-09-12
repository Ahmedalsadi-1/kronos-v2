// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshserver

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
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

func validateOSWorktreeFilePath(repoPath string, path string) error {
	path = strings.TrimSpace(path)
	if path == "" || len(path) > 4096 {
		return fmt.Errorf("path is required")
	}
	if filepath.IsAbs(path) || strings.HasPrefix(path, "..") {
		return fmt.Errorf("path must be relative to the repository")
	}
	return nil
}

// OSWorktreeChangesCommand lists working-tree changes with numstat counts (diff viewer foundation).
func (ws *WshServer) OSWorktreeChangesCommand(ctx context.Context, repoPath string) ([]wshrpc.OSWorktreeChange, error) {
	if err := validateOSWorktreeRepo(repoPath); err != nil {
		return nil, err
	}
	statusOut, err := runOSGit(repoPath, "status", "--porcelain")
	if err != nil {
		return nil, fmt.Errorf("read changes: %w", err)
	}
	insertions := make(map[string]int)
	deletions := make(map[string]int)
	numstatOut, _ := runOSGit(repoPath, "diff", "HEAD", "--numstat")
	for _, line := range strings.Split(numstatOut, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		insertions[fields[2]] = parseIntOrZero(fields[0])
		deletions[fields[2]] = parseIntOrZero(fields[1])
	}
	changes := make([]wshrpc.OSWorktreeChange, 0)
	for _, line := range strings.Split(statusOut, "\n") {
		if len(line) < 4 {
			continue
		}
		code := line[:2]
		path := strings.TrimSpace(line[3:])
		if renameAt := strings.Index(path, " -> "); renameAt >= 0 {
			path = path[renameAt+4:]
		}
		status := "modified"
		switch {
		case code == "??":
			status = "untracked"
		case strings.HasPrefix(code, "A"):
			status = "added"
		case strings.Contains(code, "D"):
			status = "deleted"
		}
		changes = append(changes, wshrpc.OSWorktreeChange{
			Path:       path,
			Status:     status,
			Insertions: insertions[path],
			Deletions:  deletions[path],
		})
	}
	sort.Slice(changes, func(i, j int) bool { return changes[i].Path < changes[j].Path })
	return changes, nil
}

func parseIntOrZero(value string) int {
	n, _ := strconv.Atoi(strings.TrimSpace(value))
	return n
}

// OSWorktreeFileDiffCommand returns the unified diff for a file (untracked files diff against /dev/null).
func (ws *WshServer) OSWorktreeFileDiffCommand(ctx context.Context, data wshrpc.OSWorktreeFileRequest) (string, error) {
	if err := validateOSWorktreeRepo(data.RepoPath); err != nil {
		return "", err
	}
	if err := validateOSWorktreeFilePath(data.RepoPath, data.Path); err != nil {
		return "", err
	}
	fullPath := filepath.Join(data.RepoPath, data.Path)
	out, err := runOSGit(data.RepoPath, "diff", "HEAD", "--", data.Path)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(out) == "" {
		if statusOut, _ := runOSGit(data.RepoPath, "status", "--porcelain", "--", data.Path); strings.HasPrefix(strings.TrimSpace(statusOut), "??") {
			content, readErr := os.ReadFile(fullPath)
			if readErr != nil {
				return "", fmt.Errorf("read file: %w", readErr)
			}
			// git has no native diff output for untracked files, so synthesize the add-file diff
			if len(content) == 0 {
				return "", nil
			}
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("--- /dev/null\n+++ %s\n@@ -0,0 +1,%d @@\n", data.Path, len(content)))
			for _, line := range strings.Split(strings.TrimRight(string(content), "\n"), "\n") {
				sb.WriteString("+" + line + "\n")
			}
			return sb.String(), nil
		}
	}
	return out, nil
}

// OSWorktreeFileRevertCommand discards working-tree changes for a file (reject agent change).
func (ws *WshServer) OSWorktreeFileRevertCommand(ctx context.Context, data wshrpc.OSWorktreeFileRequest) error {
	if err := validateOSWorktreeRepo(data.RepoPath); err != nil {
		return err
	}
	if err := validateOSWorktreeFilePath(data.RepoPath, data.Path); err != nil {
		return err
	}
	if statusOut, _ := runOSGit(data.RepoPath, "status", "--porcelain", "--", data.Path); strings.HasPrefix(strings.TrimSpace(statusOut), "??") {
		if err := os.Remove(filepath.Join(data.RepoPath, data.Path)); err != nil {
			return fmt.Errorf("revert untracked file: %w", err)
		}
		return nil
	}
	if _, err := runOSGit(data.RepoPath, "checkout", "HEAD", "--", data.Path); err != nil {
		return fmt.Errorf("revert file: %w", err)
	}
	return nil
}

// OSWorktreeFileStageCommand stages a file (accept agent change).
func (ws *WshServer) OSWorktreeFileStageCommand(ctx context.Context, data wshrpc.OSWorktreeFileRequest) error {
	if err := validateOSWorktreeRepo(data.RepoPath); err != nil {
		return err
	}
	if err := validateOSWorktreeFilePath(data.RepoPath, data.Path); err != nil {
		return err
	}
	if _, err := runOSGit(data.RepoPath, "add", "--", data.Path); err != nil {
		return fmt.Errorf("stage file: %w", err)
	}
	return nil
}
