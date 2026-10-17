import {
    ArrowLeft,
    Bell,
    Boxes,
    FileCode2,
    Globe2,
    LayoutGrid,
    LoaderCircle,
    MessageCircle,
    Plus,
    RefreshCw,
    Server,
    Smartphone,
    TerminalSquare,
    X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ClosedSurface, HostRuntimeState, Surface } from "../types";
import { AgentAvatar } from "./agent-avatar";
import type { SurfaceWidget } from "./surface-browser";
import { WorkspaceSurfaceCard } from "./workspace-surface-card";

interface MobileWorkspaceProps {
    blocked?: boolean;
    surfaces: Surface[];
    hosts: HostRuntimeState[];
    closedSurfaces: ClosedSurface[];
    refreshing: boolean;
    onOpenSurface: (surface: Surface) => void;
    onOpenChat: () => void;
    onOpenHosts: () => void;
    onRefresh: () => Promise<void>;
    onOpenWidget: (widget: SurfaceWidget) => Promise<void>;
    onLocalTools: () => void;
    onRestoreSurface: (surface: ClosedSurface) => void;
    onNotifications?: () => Promise<void>;
}

const Filters = [
    { id: "all", label: "All surfaces", icon: LayoutGrid },
    { id: "browser", label: "Browsers", icon: Globe2 },
    { id: "sandbox", label: "Sandboxes", icon: Boxes },
    { id: "device", label: "Devices (Labs)", icon: Smartphone },
    { id: "terminal", label: "Terminals", icon: TerminalSquare },
    { id: "file", label: "Files", icon: FileCode2 },
] as const;

export function MobileWorkspace(props: MobileWorkspaceProps) {
    const [filter, setFilter] = useState<string>("all");
    const [createOpen, setCreateOpen] = useState(false);
    const [error, setError] = useState("");
    const [creating, setCreating] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!createOpen) return;
        const previous = document.activeElement as HTMLElement;
        sheetRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
        return () => previous?.focus();
    }, [createOpen]);
    const surfaces = props.surfaces
        .filter((surface) => surface.kind !== "run")
        .filter((surface) => {
            if (filter === "all") return true;
            if (filter === "sandbox")
                return (Boolean(surface.sandboxId) && surface.kind === "app") || surface.localLinux;
            if (filter === "device") return Boolean(surface.phoneControl);
            return surface.kind === filter;
        });
    const create = async (widget: SurfaceWidget) => {
        setCreating(true);
        setError("");
        try {
            if (widget === "app") {
                const device = props.surfaces.find((surface) => surface.phoneControl);
                if (!device)
                    throw new Error("No device is connected. Pair a Labs phone bridge from your KronTerm host first.");
                props.onOpenSurface(device);
                setCreateOpen(false);
                return;
            }
            if (widget === "file") {
                setCreateOpen(false);
                props.onLocalTools();
                return;
            }
            await props.onOpenWidget(widget);
            setCreateOpen(false);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setCreating(false);
        }
    };
    return (
        <section className="mobile-workspace" aria-label="Workspace" inert={props.blocked}>
            <div className="mobile-workspace-main" inert={createOpen}>
                <header className="mobile-workspace-header">
                    <button type="button" aria-label="Back to chat" onClick={props.onOpenChat}>
                        <ArrowLeft />
                    </button>
                    <strong>
                        Workspace <small>Labs</small>
                    </strong>
                    <button type="button" aria-label="Choose hosts" onClick={props.onOpenHosts}>
                        <Server />
                    </button>
                    <button
                        type="button"
                        aria-label="Refresh workspace"
                        disabled={props.refreshing}
                        onClick={() => void props.onRefresh()}
                    >
                        <RefreshCw className={props.refreshing ? "spin" : ""} />
                    </button>
                </header>
                <nav className="workspace-filters" aria-label="Filter surfaces">
                    {Filters.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            aria-label={label}
                            title={label}
                            aria-pressed={filter === id}
                            onClick={() => setFilter(id)}
                        >
                            <Icon />
                        </button>
                    ))}
                </nav>
                <div className="mobile-workspace-content">
                    {surfaces.map((surface) => (
                        <WorkspaceSurfaceCard key={surface.id} surface={surface} onOpen={props.onOpenSurface} />
                    ))}
                    {!surfaces.length && (
                        <div className="workspace-empty" role="status">
                            <AgentAvatar />
                            <strong>{props.refreshing ? "Loading your workspace" : "No surfaces here yet"}</strong>
                            <p>
                                {props.hosts.length
                                    ? "Open a browser or sandbox, or ask your agent to start work."
                                    : "Connect a KronTerm host to see your live widgets."}
                            </p>
                            <button
                                type="button"
                                onClick={props.hosts.length ? () => setCreateOpen(true) : props.onOpenHosts}
                            >
                                {props.hosts.length ? "Add a surface" : "Connect host"}
                            </button>
                        </div>
                    )}
                    {props.hosts.some((host) => host.connection === "offline") && (
                        <p className="workspace-connection-note" role="status">
                            A host is offline. Reconnect in Hosts to update its surfaces.
                        </p>
                    )}
                    {!!props.closedSurfaces.length && (
                        <details className="workspace-closed">
                            <summary>Recently closed</summary>
                            {props.closedSurfaces.map((closed) => (
                                <button
                                    key={closed.surface.id}
                                    type="button"
                                    onClick={() => props.onRestoreSurface(closed)}
                                >
                                    Restore {closed.surface.title}
                                </button>
                            ))}
                        </details>
                    )}
                    <button type="button" className="workspace-local-link" onClick={props.onLocalTools}>
                        Local files, editor, and shell
                    </button>
                </div>
                <nav className="mobile-bottom-nav" aria-label="Main navigation">
                    <button type="button" onClick={props.onOpenChat}>
                        <MessageCircle />
                        <span>Chat</span>
                    </button>
                    <button
                        type="button"
                        className="workspace-add"
                        aria-label="Add surface"
                        aria-expanded={createOpen}
                        onClick={() => setCreateOpen(!createOpen)}
                    >
                        <Plus />
                    </button>
                    <button type="button" aria-current="page" onClick={() => setFilter("all")}>
                        <LayoutGrid />
                        <span>Workspace</span>
                    </button>
                </nav>
            </div>
            {createOpen && (
                <button
                    type="button"
                    className="workspace-sheet-backdrop"
                    aria-label="Dismiss add surface"
                    onClick={() => setCreateOpen(false)}
                />
            )}
            {createOpen && (
                <div
                    ref={sheetRef}
                    className="workspace-create-sheet"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Add surface"
                    onKeyDown={(event) => {
                        if (event.key === "Escape") setCreateOpen(false);
                        if (event.key !== "Tab") return;
                        const buttons = Array.from(
                            sheetRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []
                        );
                        const first = buttons[0];
                        const last = buttons.at(-1);
                        if (event.shiftKey && document.activeElement === first) {
                            event.preventDefault();
                            last?.focus();
                        }
                        if (!event.shiftKey && document.activeElement === last) {
                            event.preventDefault();
                            first?.focus();
                        }
                    }}
                >
                    <header>
                        <strong>Add a surface</strong>
                        <button type="button" aria-label="Close add surface" onClick={() => setCreateOpen(false)}>
                            <X />
                        </button>
                    </header>
                    {(
                        [
                            ["browser", "Browser", Globe2],
                            ["sandbox", "Kron Sandbox", Boxes],
                            ["terminal", "Terminal", TerminalSquare],
                            ["file", "Files", FileCode2],
                            ["app", "Devices (Labs)", Smartphone],
                        ] as const
                    ).map(([widget, label, Icon]) => (
                        <button key={widget} type="button" disabled={creating} onClick={() => void create(widget)}>
                            <Icon />
                            <span>{label}</span>
                            {creating && <LoaderCircle className="spin" />}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => {
                            setCreateOpen(false);
                            props.onLocalTools();
                        }}
                    >
                        <FileCode2 />
                        <span>On this iPhone</span>
                    </button>
                    {props.onNotifications && (
                        <button
                            type="button"
                            onClick={() =>
                                void props
                                    .onNotifications?.()
                                    .catch((reason) =>
                                        setError(reason instanceof Error ? reason.message : String(reason))
                                    )
                            }
                        >
                            <Bell />
                            <span>Enable task notifications</span>
                        </button>
                    )}
                    {error && <p role="alert">{error}</p>}
                </div>
            )}
        </section>
    );
}
