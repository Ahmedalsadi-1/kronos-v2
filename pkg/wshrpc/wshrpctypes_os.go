// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshrpc

type OSArtifactShelfItem struct {
	Id       string `json:"id"`
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	Resource string `json:"resource"`
	Detail   string `json:"detail,omitempty"`
	AddedAt  int64  `json:"addedat"`
}

type OSSpaceProfile struct {
	Version       int                   `json:"version"`
	Roots         []string              `json:"roots"`
	PinnedAppIds  []string              `json:"pinnedappids"`
	RestorePolicy string                `json:"restorepolicy"`
	ArtifactShelf []OSArtifactShelfItem `json:"artifactshelf,omitempty"`
}

type OSSpaceProfileSetRequest struct {
	SpaceId string         `json:"spaceid"`
	Profile OSSpaceProfile `json:"profile"`
}

type OSSystemEventInput struct {
	SpaceId string   `json:"spaceid"`
	Kind    string   `json:"kind"`
	Status  string   `json:"status"`
	Title   string   `json:"title"`
	Source  string   `json:"source,omitempty"`
	BlockId string   `json:"blockid,omitempty"`
	Actions []string `json:"actions,omitempty"`
	Meta    map[string]any `json:"meta,omitempty"`
}

type OSActivityListRequest struct {
	SpaceId     string `json:"spaceid"`
	Limit       int    `json:"limit,omitempty"`
	IncludeRead bool   `json:"includeread,omitempty"`
}

type OSActivityReadRequest struct {
	SpaceId  string   `json:"spaceid"`
	EventIds []string `json:"eventids,omitempty"`
	All      bool     `json:"all,omitempty"`
}

type OSCapabilityGrantRequest struct {
	SpaceId        string `json:"spaceid"`
	Capability     string `json:"capability"`
	Scope          string `json:"scope"`
	Resource       string `json:"resource,omitempty"`
	AgentSessionId string `json:"agentsessionid"`
	ExpiresTs      int64  `json:"expirests,omitempty"`
}

type OSCapabilityListRequest struct {
	SpaceId         string `json:"spaceid"`
	AgentSessionId  string `json:"agentsessionid,omitempty"`
	IncludeInactive bool   `json:"includeinactive,omitempty"`
}

type OSCheckpointSaveRequest struct {
	SpaceId      string `json:"spaceid"`
	TabId        string `json:"tabid"`
	Reason       string `json:"reason"`
	SnapshotJson string `json:"snapshotjson"`
}

type OSCheckpointLatestRequest struct {
	SpaceId string `json:"spaceid"`
	TabId   string `json:"tabid,omitempty"`
}

type OSWorktree struct {
	Id        string `json:"id"`
	Path      string `json:"path"`
	Branch    string `json:"branch"`
	Name      string `json:"name"`
	Head      string `json:"head,omitempty"`
	IsMain    bool   `json:"ismain"`
	CreatedTs int64  `json:"createdts"`
}

type OSWorktreeCreateRequest struct {
	RepoPath   string `json:"repopath"`
	Name       string `json:"name"`
	BaseBranch string `json:"basebranch,omitempty"`
}

type OSWorktreeRemoveRequest struct {
	RepoPath string `json:"repopath"`
	Path     string `json:"path"`
	Force    bool   `json:"force,omitempty"`
}

type OSWorktreeChange struct {
	Path       string `json:"path"`
	Status     string `json:"status"`
	Insertions int    `json:"insertions"`
	Deletions  int    `json:"deletions"`
}

type OSWorktreeFileRequest struct {
	RepoPath string `json:"repopath"`
	Path     string `json:"path"`
}

type OSAutomation struct {
	Id        string `json:"id"`
	Name      string `json:"name"`
	Schedule  string `json:"schedule"`
	Prompt    string `json:"prompt,omitempty"`
	Enabled   bool   `json:"enabled"`
	LastRunTs int64  `json:"lastrunts"`
}

type OSAutomationSaveRequest struct {
	SpaceId     string        `json:"spaceid"`
	Automations []OSAutomation `json:"automations"`
}

type OSAutomationRunRequest struct {
	SpaceId      string `json:"spaceid"`
	AutomationId string `json:"automationid"`
}
