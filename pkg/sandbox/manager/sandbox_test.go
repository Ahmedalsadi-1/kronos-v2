// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
package manager

import (
	"context"
	"strings"
	"testing"
)

func TestLegacySandboxCannotLaunch(t *testing.T) {
	sm := GetSandboxManager()
	for _, runtime := range []string{"", "auto", "qemu", "docker", "kronterm-desktop"} {
		session, err := sm.Start(context.Background(), StartOpts{Runtime: runtime})
		if session != nil || err == nil || !strings.Contains(err.Error(), "removed") {
			t.Fatalf("runtime %q unexpectedly available: %v %v", runtime, session, err)
		}
	}
	if len(sm.ListSessions()) != 0 {
		t.Fatal("legacy sessions must not exist")
	}
}
