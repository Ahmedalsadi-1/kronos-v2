// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package wshremote

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/wavetermdev/waveterm/pkg/wshrpc"
)

func TestListEntriesWithoutOptions(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "visible.txt"), []byte("content"), 0600); err != nil {
		t.Fatal(err)
	}
	server := &ServerImpl{}
	var names []string
	for response := range server.RemoteListEntriesCommand(context.Background(), wshrpc.CommandRemoteListEntriesData{Path: dir}) {
		if response.Error != nil {
			t.Fatal(response.Error)
		}
		for _, info := range response.Response.FileInfo {
			names = append(names, info.Name)
		}
	}
	if len(names) != 1 || names[0] != "visible.txt" {
		t.Fatalf("expected visible.txt, got %v", names)
	}
	for response := range server.RemoteListEntriesCommand(context.Background(), wshrpc.CommandRemoteListEntriesData{Path: filepath.Join(dir, "missing")}) {
		if response.Error != nil {
			return
		}
	}
	t.Fatal("missing directory was reported as an empty listing")
}
