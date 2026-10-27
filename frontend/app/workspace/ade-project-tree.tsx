// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import type { NotchExplorerEntry } from "@/types/native-notch";
import { FileActionDialogs } from "@hermes/app/right-sidebar/file-actions";
import { ProjectTree } from "@hermes/app/right-sidebar/files/tree";
import type { TreeNode } from "@hermes/app/right-sidebar/files/use-project-tree";
import { $workspaceChangeTick } from "@hermes/store/workspace-events";
import { useEffect, useMemo, useRef } from "react";

export function adeTreeNodes(entries: NotchExplorerEntry[], filter: string): TreeNode[] {
    const roots: TreeNode[] = [];
    const parents: TreeNode[] = [];
    for (const entry of entries) {
        const node: TreeNode = {
            id: entry.path,
            name: entry.name,
            isDirectory: entry.directory,
            children: entry.directory && entry.expanded ? [] : undefined,
        };
        parents.length = entry.depth;
        const parent = parents[entry.depth - 1];
        if (parent) (parent.children ??= []).push(node);
        else roots.push(node);
        parents[entry.depth] = node;
    }
    const query = filter.trim().toLowerCase();
    if (!query) return roots;
    const prune = (nodes: TreeNode[]): TreeNode[] =>
        nodes.flatMap((node) => {
            const children = node.children ? prune(node.children) : undefined;
            if (node.id.toLowerCase().includes(query) || children?.length) return [{ ...node, children }];
            return [];
        });
    return prune(roots);
}

export function AdeProjectTree({
    entries,
    root,
    selectedPath,
    filter,
    focused,
    onOpen,
    onAttach,
    onLoad,
    onToggle,
    onRefresh,
    isDirty,
}: {
    entries: NotchExplorerEntry[];
    root: string;
    selectedPath: string;
    filter: string;
    focused: boolean;
    onOpen: (path: string) => void;
    onAttach: (path: string) => void;
    onLoad: (path: string) => Promise<void>;
    onToggle: (path: string, open: boolean) => void;
    onRefresh: () => void;
    isDirty: (path: string) => boolean;
}) {
    const data = useMemo(() => adeTreeNodes(entries, filter), [entries, filter]);
    const openState = useMemo(
        () =>
            Object.fromEntries(entries.filter((entry) => entry.directory).map((entry) => [entry.path, entry.expanded])),
        [entries]
    );
    const refresh = useRef(onRefresh);
    refresh.current = onRefresh;
    useEffect(() => $workspaceChangeTick.listen(() => refresh.current()), []);
    return (
        <div className="ade-hermes-tree h-full min-h-0" data-hermes-app="">
            <ProjectTree
                collapseNonce={0}
                cwd={root}
                data={data}
                selectedPath={selectedPath}
                isDirty={isDirty}
                openState={openState}
                onActivateFile={onAttach}
                onActivateFolder={onAttach}
                onPreviewFile={onOpen}
                onLoadChildren={onLoad}
                onNodeOpenChange={onToggle}
            />
            {focused && <FileActionDialogs />}
        </div>
    );
}
