import { resolveBlockView } from "@/app/block/retired-chat-view";
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { AppIcon } from "@/app/components/app-icon";
import { SystemButton, SystemSidebar } from "@/app/components/system-ui";
import {
    quickLookOSResource,
    revealOSResource,
    searchOSResources,
    writeOSResourceDragPayload,
    type OSResourceReference,
} from "@/app/store/os-resource-service";
import { getSettingsKeyAtom } from "@/store/global";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import {
    ArchiveRestore,
    Bot,
    Box,
    Eye,
    FileText,
    Folder,
    FolderSearch2,
    GitBranch,
    LoaderCircle,
    PackagePlus,
    Pin,
    Search,
} from "@/app/components/system-ui/os-icons";
import { memo, useEffect, useMemo, useState } from "react";

import { OSAppDragMimeType, readOSAppDragPayload } from "./os-app-stream";

export type OSWidgetsFileBlock = {
    blockId: string;
    view: string;
    title: string;
    icon?: string;
    collapsed?: boolean;
};

const WidgetCategories: Array<{ id: string; label: string; views: string[] }> = [
    { id: "system", label: "System", views: ["sysinfo", "term", "sandbox"] },
    {
        id: "productivity",
        label: "Productivity",
        views: [
            "preview",
            "web",
            "kronoscanvas",
            "gamestudio",
            "personal",
            "imagestudio",
            "blenderproject",
            "datastudio",
            "videostudio",
            "audiostudio",
            "documentstudio",
        ],
    },
    { id: "agents", label: "Agents", views: ["hermes", "warpagent"] },
    { id: "applications", label: "Applications", views: ["appstream", "installedapps"] },
];

export function groupWidgetsByCategory(
    blocks: OSWidgetsFileBlock[]
): Array<{ id: string; label: string; blocks: OSWidgetsFileBlock[] }> {
    const groups = WidgetCategories.map((category) => ({
        id: category.id,
        label: category.label,
        blocks: blocks.filter((block) => category.views.includes(resolveBlockView(block.view))),
    })).filter((group) => group.blocks.length > 0);
    const categorized = new Set(groups.flatMap((group) => group.blocks.map((block) => block.blockId)));
    const other = blocks.filter((block) => !categorized.has(block.blockId));
    if (other.length > 0) groups.push({ id: "other", label: "Other", blocks: other });
    return groups;
}

const OSWidgetsFileView = memo(function OSWidgetsFileView({
    blocks,
    hidden,
    activeBlockId,
    workspaceName,
    onOpenBlock,
    onToggleFiled,
    onOpenResource,
    onPinResource,
    onSaveResource,
    onAttachResource,
}: {
    blocks: OSWidgetsFileBlock[];
    hidden?: boolean;
    activeBlockId: string | undefined;
    workspaceName: string;
    onOpenBlock: (blockId: string) => void;
    onToggleFiled: (blockId: string, filed: boolean) => void;
    onOpenResource: (resource: OSResourceReference) => void;
    onPinResource: (resource: OSResourceReference) => void;
    onSaveResource: (resource: OSResourceReference) => void;
    onAttachResource: (resource: OSResourceReference) => void;
}) {
    const [query, setQuery] = useState("");
    const [scope, setScope] = useState<"all" | "canvas" | "filed">("all");
    const [resources, setResources] = useState<OSResourceReference[]>([]);
    const [resourceSearchState, setResourceSearchState] = useState<"idle" | "searching" | "ready" | "failed">("idle");
    const ambientOSEnabled = useAtomValue(getSettingsKeyAtom("feature:ambientos")) ?? false;
    const visibleBlocks = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return blocks.filter((block) => {
            if (scope === "canvas" && block.collapsed) return false;
            if (scope === "filed" && !block.collapsed) return false;
            return !needle || `${block.title} ${block.view}`.toLowerCase().includes(needle);
        });
    }, [blocks, query, scope]);
    const groups = groupWidgetsByCategory(visibleBlocks);
    const placedCount = blocks.filter((block) => !block.collapsed).length;

    useEffect(() => {
        const normalizedQuery = query.trim();
        if (normalizedQuery.length < 2) {
            setResources([]);
            setResourceSearchState("idle");
            return;
        }
        let cancelled = false;
        setResourceSearchState("searching");
        const timer = window.setTimeout(() => {
            void searchOSResources(normalizedQuery)
                .then((items) => {
                    if (cancelled) return;
                    setResources(items);
                    setResourceSearchState("ready");
                })
                .catch(() => {
                    if (cancelled) return;
                    setResources([]);
                    setResourceSearchState("failed");
                });
        }, 180);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [query]);

    return (
        <main
            className="os-widgets-file"
            hidden={hidden}
            aria-label="Current workspace sessions"
            onDragOver={(event) => {
                if (event.dataTransfer.types.includes(OSAppDragMimeType)) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                }
            }}
            onDrop={(event) => {
                const payload = readOSAppDragPayload(event.dataTransfer);
                if (payload == null) return;
                event.preventDefault();
                event.stopPropagation();
                if (payload.blockId != null) onToggleFiled(payload.blockId, true);
            }}
        >
            <SystemSidebar className="os-file-sidebar" aria-label="Session sources">
                <div className="os-file-sidebar-title">
                    <span>KronOS</span>
                    <strong>{workspaceName}</strong>
                </div>
                <nav aria-label="Session filters">
                    <SystemButton
                        type="button"
                        selected={scope === "all"}
                        className="os-file-sidebar-item"
                        onClick={() => setScope("all")}
                    >
                        <Folder aria-hidden="true" />
                        <span>All Sessions</span>
                        <small>{blocks.length}</small>
                    </SystemButton>
                    <SystemButton
                        type="button"
                        selected={scope === "canvas"}
                        className="os-file-sidebar-item"
                        onClick={() => setScope("canvas")}
                    >
                        <Eye aria-hidden="true" />
                        <span>On Canvas</span>
                        <small>{placedCount}</small>
                    </SystemButton>
                    <SystemButton
                        type="button"
                        selected={scope === "filed"}
                        className="os-file-sidebar-item"
                        onClick={() => setScope("filed")}
                    >
                        <Box aria-hidden="true" />
                        <span>Filed</span>
                        <small>{blocks.length - placedCount}</small>
                    </SystemButton>
                </nav>
                <div className="os-file-sidebar-foot">
                    <Pin aria-hidden="true" />
                    Drag a session or resource onto Canvas to keep it in this space.
                </div>
            </SystemSidebar>
            <section className="os-file-content">
                <header className="os-file-header">
                    <div>
                        <span className="os-file-eyebrow">{workspaceName}</span>
                        <h1>Sessions</h1>
                        <p>The same live apps, widgets, files, and Kronos conversations shown on Canvas.</p>
                    </div>
                    <div className="os-file-summary" aria-label={`${blocks.length} sessions, ${placedCount} on canvas`}>
                        <span>
                            <strong>{blocks.length}</strong>
                            sessions
                        </span>
                        <span>
                            <strong>{placedCount}</strong>
                            on canvas
                        </span>
                    </div>
                </header>
                <label className="os-file-search">
                    <Search aria-hidden="true" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Find a session in this workspace"
                        aria-label="Find a session in this workspace"
                    />
                    {resourceSearchState === "searching" ? (
                        <LoaderCircle className="is-spinning" aria-label="Searching this computer" />
                    ) : (
                        <kbd>⌘ K</kbd>
                    )}
                </label>
                <div className="os-file-groups">
                    {groups.map((group) => (
                        <section key={group.id}>
                            <header>
                                <h2>{group.label}</h2>
                                <span>{group.blocks.length}</span>
                            </header>
                            <div className="os-file-rows">
                                {group.blocks.map((block) => (
                                    <article
                                        key={block.blockId}
                                        className={cn(
                                            "os-widgets-file-row",
                                            block.collapsed && "is-filed",
                                            block.blockId === activeBlockId && "is-active"
                                        )}
                                        draggable
                                        onDragStart={(event) => {
                                            event.dataTransfer.setData(
                                                OSAppDragMimeType,
                                                JSON.stringify({ blockId: block.blockId })
                                            );
                                            event.dataTransfer.effectAllowed = "copyMove";
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="os-file-open"
                                            onClick={() => onOpenBlock(block.blockId)}
                                            title={`Open ${block.title} on Canvas`}
                                        >
                                            <span className="os-file-app-icon">
                                                <AppIcon icon={block.icon} />
                                            </span>
                                            <span className="os-widgets-file-copy">
                                                <strong>{block.title}</strong>
                                                <small>{block.view}</small>
                                            </span>
                                            <span className="os-file-state">
                                                <i aria-hidden="true" />
                                                {block.collapsed ? "Filed" : "Live on Canvas"}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            className="os-file-toggle"
                                            onClick={() => onToggleFiled(block.blockId, !block.collapsed)}
                                            aria-label={
                                                block.collapsed
                                                    ? `Place ${block.title} on Canvas`
                                                    : `File ${block.title}`
                                            }
                                            title={block.collapsed ? "Place on Canvas" : "File session"}
                                        >
                                            {block.collapsed ? <ArchiveRestore /> : <Box />}
                                        </button>
                                    </article>
                                ))}
                            </div>
                        </section>
                    ))}
                    {query.trim().length >= 2 && (
                        <section className="os-resource-results">
                            <header>
                                <h2>Files &amp; resources</h2>
                                <span>{resources.length}</span>
                            </header>
                            <div className="os-resource-rows">
                                {resources.map((resource) => {
                                    const ResourceIcon =
                                        resource.kind === "repository"
                                            ? GitBranch
                                            : resource.kind === "folder"
                                              ? Folder
                                              : FileText;
                                    return (
                                        <article
                                            key={resource.id}
                                            className="os-resource-row"
                                            draggable
                                            onDragStart={(event) =>
                                                writeOSResourceDragPayload(event.nativeEvent, resource)
                                            }
                                        >
                                            <button
                                                type="button"
                                                className="os-resource-open"
                                                onClick={() => onOpenResource(resource)}
                                                title={`Open ${resource.name} in KronOS`}
                                            >
                                                <span className="os-resource-icon">
                                                    <ResourceIcon aria-hidden="true" />
                                                </span>
                                                <span>
                                                    <strong>{resource.name}</strong>
                                                    <small>{resource.detail ?? resource.resource}</small>
                                                </span>
                                            </button>
                                            <div
                                                className="os-resource-actions"
                                                role="group"
                                                aria-label={resource.name}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => quickLookOSResource(resource)}
                                                    title="Quick Look"
                                                    aria-label={`Quick Look ${resource.name}`}
                                                >
                                                    <Eye aria-hidden="true" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => revealOSResource(resource)}
                                                    title="Reveal in Finder"
                                                    aria-label={`Reveal ${resource.name} in Finder`}
                                                >
                                                    <FolderSearch2 aria-hidden="true" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onPinResource(resource)}
                                                    title="Pin to space"
                                                    aria-label={`Pin ${resource.name} to this space`}
                                                >
                                                    <Pin aria-hidden="true" />
                                                </button>
                                                {ambientOSEnabled && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onSaveResource(resource)}
                                                        title="Save to Artifact Shelf"
                                                        aria-label={`Save ${resource.name} to the Artifact Shelf`}
                                                    >
                                                        <PackagePlus aria-hidden="true" />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => onAttachResource(resource)}
                                                    title="Attach to Kronos"
                                                    aria-label={`Attach ${resource.name} to Kronos`}
                                                >
                                                    <Bot aria-hidden="true" />
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                                {resourceSearchState === "ready" && resources.length === 0 && (
                                    <div className="os-resource-empty">
                                        No local files or repositories match this search.
                                    </div>
                                )}
                                {resourceSearchState === "failed" && (
                                    <div className="os-resource-empty">Local resource search is unavailable.</div>
                                )}
                            </div>
                        </section>
                    )}
                    {visibleBlocks.length === 0 && resources.length === 0 && resourceSearchState !== "searching" && (
                        <div className="os-file-empty">
                            <Search aria-hidden="true" />
                            <strong>No matching sessions</strong>
                            <span>Try a different app name or view type.</span>
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
});
OSWidgetsFileView.displayName = "OSWidgetsFileView";

export { OSWidgetsFileView };
