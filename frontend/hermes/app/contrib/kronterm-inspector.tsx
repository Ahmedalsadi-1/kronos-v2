import { RightSidebarPane } from "@hermes/app/right-sidebar";
import { ReviewPane } from "@hermes/app/right-sidebar/review";
import { FileDiffPanel } from "@hermes/components/chat/diff-lines";
import { Codicon } from "@hermes/components/ui/codicon";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@hermes/components/ui/dropdown-menu";
import { attachPathToComposer } from "@hermes/lib/composer-file-context";
import { desktopFsProfile } from "@hermes/lib/desktop-fs";
import {
    $krontermInspectorCompact,
    $krontermInspectorExpanded,
    $krontermInspectorHasFiles,
    $krontermInspectorOpen,
    $krontermInspectorSection,
    $krontermInspectorWidth,
    KRONTERM_INSPECTOR_MAX_WIDTH,
    KRONTERM_INSPECTOR_MIN_WIDTH,
    KRONTERM_INSPECTOR_RESIZE_STEP,
    KrontermInspectorChatEvent,
    KrontermInspectorChatTargetId,
    KrontermInspectorFileEvent,
    openKrontermFile,
    type KrontermInspectorSection,
} from "@hermes/lib/kronterm-sidebar";
import { cn } from "@hermes/lib/utils";
import {
    $reviewDiff,
    $reviewDiffLoading,
    $reviewOpen,
    $reviewScopeCwd,
    $reviewSelectedPath,
    refreshReview,
    refreshShipInfo,
} from "@hermes/store/review";
import { $currentCwd } from "@hermes/store/session";
import { useStore } from "@nanostores/react";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
} from "react";
import { KrontermFilePreview } from "./kronterm-file-preview";
import "./kronterm-inspector.css";

const Sections = {
    files: { label: "Files", icon: "files", shortcut: "⌘P" },
    changes: { label: "Changes", icon: "diff-added", shortcut: "⌃⇧G" },
    chat: { label: "Side chat", icon: "comment-discussion", shortcut: "⌥⌘S" },
    diff: { label: "File diff", icon: "diff" },
};

export function KrontermInspector() {
    const open = useStore($krontermInspectorOpen);
    const view = useStore($krontermInspectorSection);
    const expanded = useStore($krontermInspectorExpanded);
    const compact = useStore($krontermInspectorCompact);
    const width = useStore($krontermInspectorWidth);
    const cwd = useStore($currentCwd);
    const diff = useStore($reviewDiff);
    const loading = useStore($reviewDiffLoading);
    const path = useStore($reviewSelectedPath);
    const [dirtyFiles, setDirtyFiles] = useState<Record<string, boolean>>({});
    const [pendingClose, setPendingClose] = useState<KrontermInspectorSection>(null);
    const [tabs, setTabs] = useState<KrontermInspectorSection[]>(["files"]);
    const [defaultCwd, setDefaultCwd] = useState("");
    const [workspaceError, setWorkspaceError] = useState("");
    const [unchangedPath, setUnchangedPath] = useState("");
    const effectiveCwd = cwd.trim() || defaultCwd;
    const previousPath = useRef(path);
    const rootRef = useRef<HTMLElement>(null);

    const clampWidth = useCallback((value: number) => {
        const ceiling = Math.max(KRONTERM_INSPECTOR_MIN_WIDTH, window.innerWidth - 120);
        return Math.min(Math.max(value, KRONTERM_INSPECTOR_MIN_WIDTH), Math.min(ceiling, KRONTERM_INSPECTOR_MAX_WIDTH));
    }, []);

    // The OS side panel is mounted outside this tree, so the grip measures the live
    // panel width and reports the request back to the layout.
    const startResize = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (compact) return;
            const panel = rootRef.current;
            if (!panel) return;
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = panel.getBoundingClientRect().width;
            const grip = event.currentTarget;
            grip.setPointerCapture?.(event.pointerId);

            const onMove = (moveEvent: PointerEvent) => {
                $krontermInspectorWidth.set(Math.round(clampWidth(startWidth + (startX - moveEvent.clientX))));
            };
            const onEnd = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onEnd);
                window.removeEventListener("pointercancel", onEnd);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onEnd);
            window.addEventListener("pointercancel", onEnd);
        },
        [clampWidth, compact]
    );

    const resizeWithKeyboard = useCallback(
        (event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            const panel = rootRef.current;
            if (!panel) return;
            event.preventDefault();
            const current = panel.getBoundingClientRect().width;
            const delta = event.key === "ArrowLeft" ? KRONTERM_INSPECTOR_RESIZE_STEP : -KRONTERM_INSPECTOR_RESIZE_STEP;
            $krontermInspectorWidth.set(Math.round(clampWidth(current + delta)));
        },
        [clampWidth]
    );

    useEffect(() => {
        $krontermInspectorHasFiles.set(tabs.some((section) => section.startsWith("file:")));
    }, [tabs]);
    useEffect(() => () => $krontermInspectorHasFiles.set(false), []);

    const selectSection = (section: KrontermInspectorSection) => {
        $krontermInspectorCompact.set(false);
        setTabs((current) => (current.includes(section) ? current : [...current, section]));
        $krontermInspectorSection.set(section);
        $krontermInspectorOpen.set(true);
        if (section === "changes") setUnchangedPath("");
    };
    const close = () => {
        $krontermInspectorOpen.set(false);
        document.querySelector<HTMLButtonElement>('[aria-controls="kronterm-right-inspector"]')?.focus();
    };
    const closeTab = (section: KrontermInspectorSection, discard = false) => {
        if (dirtyFiles[section] && !discard) {
            setPendingClose(section);
            return;
        }
        setPendingClose(null);
        setDirtyFiles((current) => ({ ...current, [section]: false }));
        const remaining = tabs.filter((tab) => tab !== section);
        if (!remaining.length) {
            setTabs(["files"]);
            $krontermInspectorSection.set("files");
            close();
            return;
        }
        setTabs(remaining);
        if (view === section) $krontermInspectorSection.set(remaining[Math.max(0, tabs.indexOf(section) - 1)]);
    };

    useEffect(() => {
        const openFile = (event: Event) => {
            const path = (event as CustomEvent<{ path: string }>).detail?.path;
            if (path) selectSection(`file:${path}`);
        };
        window.addEventListener(KrontermInspectorFileEvent, openFile);
        return () => window.removeEventListener(KrontermInspectorFileEvent, openFile);
    }, []);

    useEffect(() => {
        if (!open) return;
        setTabs((current) => (current.includes(view) ? current : [...current, view]));
        if (view === "chat") window.dispatchEvent(new Event(KrontermInspectorChatEvent));
    }, [open, view]);

    useEffect(() => {
        const shortcut = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return;
            const key = event.key.toLowerCase();
            const section =
                event.ctrlKey && event.shiftKey && !event.metaKey && key === "g"
                    ? "changes"
                    : event.metaKey && !event.altKey && !event.shiftKey && key === "p"
                      ? "files"
                      : event.metaKey && event.altKey && !event.shiftKey && key === "s"
                        ? "chat"
                        : null;
            if (!section) return;
            event.preventDefault();
            event.stopPropagation();
            selectSection(section);
        };
        window.addEventListener("keydown", shortcut, true);
        return () => window.removeEventListener("keydown", shortcut, true);
    }, []);

    useEffect(() => {
        if (!open || cwd.trim()) return;
        let active = true;
        window.hermesDesktop
            .api<{ cwd: string }>({ path: "/api/fs/default-cwd", profile: desktopFsProfile() })
            .then((result) => {
                if (active) {
                    setDefaultCwd(result.cwd || "");
                    setWorkspaceError("");
                }
            })
            .catch((error) => {
                if (active) setWorkspaceError(String(error));
            });
        return () => {
            active = false;
        };
    }, [open, cwd]);

    useEffect(() => {
        if (!open) return;
        $reviewScopeCwd.set(effectiveCwd || null);
        setUnchangedPath("");
        $reviewOpen.set(true);
        void refreshReview();
        void refreshShipInfo();
    }, [open, effectiveCwd]);

    useEffect(() => {
        if (path && path !== previousPath.current && view === "changes") selectSection("diff");
        previousPath.current = path;
    }, [path]);

    const activateFile = (absolutePath: string) => openKrontermFile(absolutePath);

    return (
        <section
            ref={rootRef}
            aria-label="Files and changes"
            className={cn("kronterm-inspector", compact && "is-compact")}
            onKeyDown={(event) => {
                if (event.key === "Escape" && !event.defaultPrevented) {
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                }
            }}
        >
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize side panel"
                aria-valuenow={width ?? undefined}
                aria-valuemin={KRONTERM_INSPECTOR_MIN_WIDTH}
                aria-valuemax={KRONTERM_INSPECTOR_MAX_WIDTH}
                tabIndex={compact ? -1 : 0}
                className="kronterm-inspector-resize"
                onPointerDown={startResize}
                onKeyDown={resizeWithKeyboard}
            />
            <div className="kronterm-inspector-tabbar">
                <div
                    role="tablist"
                    aria-label="Inspector sections"
                    className="kronterm-inspector-tabs"
                    onKeyDown={(event) => {
                        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                        event.preventDefault();
                        const index = tabs.indexOf(view);
                        const next =
                            event.key === "Home"
                                ? tabs[0]
                                : event.key === "End"
                                  ? tabs[tabs.length - 1]
                                  : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
                        selectSection(next);
                        document.getElementById(`inspector-tab-${next}`)?.focus();
                    }}
                >
                    {tabs.map((section) => {
                        const label = section.startsWith("file:")
                            ? section.slice(5).split(/[\\/]/).pop()
                            : section === "diff"
                              ? (unchangedPath || path)?.split(/[\\/]/).pop() || "File diff"
                              : Sections[section].label;
                        return (
                            <div
                                key={section}
                                className="kronterm-inspector-tab"
                                data-active={view === section || undefined}
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    id={`inspector-tab-${section}`}
                                    aria-selected={view === section}
                                    tabIndex={view === section ? 0 : -1}
                                    aria-controls={`inspector-pane-${section}`}
                                    onClick={() => selectSection(section)}
                                    title={section.startsWith("file:") ? section.slice(5) : label}
                                >
                                    <Codicon
                                        name={section.startsWith("file:") ? "file-code" : Sections[section].icon}
                                    />
                                    <span>
                                        {label}
                                        {dirtyFiles[section] ? " •" : ""}
                                    </span>
                                </button>
                                <button type="button" aria-label={`Close ${label}`} onClick={() => closeTab(section)}>
                                    <Codicon name="close" />
                                </button>
                            </div>
                        );
                    })}
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button type="button" aria-label="Add panel" className="kronterm-inspector-tool">
                            <Codicon name="add" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={7} className="kronterm-inspector-menu">
                        {(["changes", "files", "chat"] as const).map((section) => (
                            <DropdownMenuItem
                                key={section}
                                className="kronterm-inspector-menu-item"
                                onSelect={() => selectSection(section)}
                            >
                                <Codicon name={Sections[section].icon} />
                                <span>{Sections[section].label}</span>
                                <span className="kronterm-inspector-shortcut">{Sections[section].shortcut}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <button
                    type="button"
                    className="kronterm-inspector-tool"
                    aria-label={expanded ? "Restore panel width" : "Expand panel"}
                    onClick={() => $krontermInspectorExpanded.set(!expanded)}
                >
                    <Codicon name={expanded ? "screen-normal" : "screen-full"} />
                </button>
                <button
                    type="button"
                    className="kronterm-inspector-tool"
                    aria-label={compact ? "Expand side panel" : "Compact side panel"}
                    aria-pressed={compact}
                    onClick={() => $krontermInspectorCompact.set(!compact)}
                >
                    <Codicon name={compact ? "chevron-left" : "chevron-right"} />
                </button>
                <button type="button" className="kronterm-inspector-tool" aria-label="Close side panel" onClick={close}>
                    <Codicon name="layout-sidebar-right" />
                </button>
            </div>
            {pendingClose && (
                <div role="alertdialog" aria-label="Unsaved file" className="border-b border-border p-3 text-xs">
                    <p>Discard unsaved edits to {pendingClose.slice(5).split(/[\\/]/).pop()}?</p>
                    <div className="mt-2 flex gap-3">
                        <button type="button" onClick={() => setPendingClose(null)}>
                            Keep editing
                        </button>
                        <button type="button" onClick={() => closeTab(pendingClose, true)}>
                            Discard edits
                        </button>
                    </div>
                </div>
            )}
            {tabs
                .filter((section) => section.startsWith("file:"))
                .map((section) => (
                    <div
                        key={section}
                        id={`inspector-pane-${section}`}
                        role="tabpanel"
                        aria-labelledby={`inspector-tab-${section}`}
                        hidden={view !== section}
                        className="kronterm-inspector-pane"
                    >
                        <KrontermFilePreview
                            path={section.slice(5)}
                            onDirtyChange={(dirty) =>
                                setDirtyFiles((current) =>
                                    current[section] === dirty ? current : { ...current, [section]: dirty }
                                )
                            }
                        />
                    </div>
                ))}
            <div
                id="inspector-pane-files"
                role="tabpanel"
                aria-labelledby="inspector-tab-files"
                hidden={view !== "files"}
                className="kronterm-inspector-pane [&>aside]:pt-0"
            >
                {workspaceError && !effectiveCwd ? (
                    <p role="alert" className="p-4 text-xs">
                        Unable to load the workspace: {workspaceError}
                    </p>
                ) : (
                    <RightSidebarPane
                        cwd={effectiveCwd}
                        onActivateFile={(path) => attachPathToComposer(path, effectiveCwd)}
                        onOpenFile={activateFile}
                        onActivateFolder={(path) => attachPathToComposer(path, effectiveCwd, true)}
                    />
                )}
            </div>
            <div
                id="inspector-pane-changes"
                role="tabpanel"
                aria-labelledby="inspector-tab-changes"
                hidden={view !== "changes"}
                className="kronterm-inspector-pane"
            >
                <ReviewPane standalone />
            </div>
            <div
                id="inspector-pane-diff"
                role="tabpanel"
                aria-labelledby="inspector-tab-diff"
                hidden={view !== "diff"}
                className="kronterm-inspector-pane"
            >
                {loading ? (
                    <p role="status" className="p-4 text-xs">
                        Loading diff…
                    </p>
                ) : unchangedPath || (path && diff === "") ? (
                    <p className="p-4 text-xs text-muted-foreground">No changes for {unchangedPath || path}.</p>
                ) : path && diff ? (
                    <FileDiffPanel className="h-full min-h-0 overflow-auto" diff={diff} path={path} showLineNumbers />
                ) : (
                    <p className="p-4 text-xs text-muted-foreground">Select a changed file to inspect its diff.</p>
                )}
            </div>
            <div
                id="inspector-pane-chat"
                role="tabpanel"
                aria-labelledby="inspector-tab-chat"
                hidden={view !== "chat"}
                className="kronterm-inspector-pane hermes-workspace-panel"
            >
                <div id={KrontermInspectorChatTargetId} className="h-full min-h-0" />
            </div>
        </section>
    );
}
