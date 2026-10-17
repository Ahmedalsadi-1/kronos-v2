// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package manager

import (
	"context"
	"fmt"
	"net"
	"os"
)

const (
	SandboxStatusStopped   = "stopped"
	SandboxStatusStarting  = "starting"
	SandboxStatusRunning   = "running"
	SandboxStatusError     = "error"
	SandboxModeDesktop     = "desktop"
	SandboxModeBackground  = "background"
	SandboxRuntimeQEMU     = "qemu"
	SandboxDefaultPassword = ""
	RetiredSandboxMessage  = "The legacy sandbox has been removed. Open Sandbox in the launcher and use linux_desktop_* tools for the managed desktop."
)

type QEMUConfig struct {
	Machine     string
	CPU         string
	CPUCores    int
	MemoryMB    int
	VNCPort     int
	SSHPort     int
	DiskImage   string
	SeedImage   string
	DisplayType string
}

type Session struct {
	SessionID  string
	Status     string
	Mode       string
	BrowserURL string
	Runtime    string
	Config     *QEMUConfig
	Process    *os.Process
	Container  string
	DesktopURL string
	MCPURL     string
	LastError  string
}

type StartOpts struct {
	SessionID  string
	Mode       string
	BrowserURL string
	Runtime    string
	Image      string
}

// These signatures preserve older RPC clients without starting a second runtime.
type SandboxManager struct{}

var compatibilityManager = &SandboxManager{}

func GetSandboxManager() *SandboxManager     { return compatibilityManager }
func MakeVNCWsURL(sessionID string) string   { return "" }
func MakeDesktopURL(session *Session) string { return "" }
func (sm *SandboxManager) Start(ctx context.Context, opts StartOpts) (*Session, error) {
	return nil, fmt.Errorf("%s", RetiredSandboxMessage)
}
func (sm *SandboxManager) Stop(sessionID string) error {
	return fmt.Errorf("%s", RetiredSandboxMessage)
}
func (sm *SandboxManager) GetStatus(sessionID string) (*Session, error) {
	return nil, fmt.Errorf("%s", RetiredSandboxMessage)
}
func (sm *SandboxManager) ListSessions() []string { return nil }
func (sm *SandboxManager) DialVNC(sessionID string) (net.Conn, *Session, error) {
	return nil, nil, fmt.Errorf("%s", RetiredSandboxMessage)
}
