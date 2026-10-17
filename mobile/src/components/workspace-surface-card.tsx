import { AppWindow, ArrowUpRight, FileCode2, Globe2, Monitor, Smartphone, TerminalSquare } from "lucide-react";
import type { Surface } from "../types";

export function SurfaceIcon({ surface }: { surface: Surface }) {
    const Icon =
        surface.localWidget === "browser"
            ? Globe2
            : surface.localLinux && surface.kind === "terminal"
              ? TerminalSquare
              : surface.localLinux
                ? Monitor
                : surface.phoneControl
                  ? Smartphone
                  : surface.sandboxId
                    ? Monitor
                    : {
                          browser: Globe2,
                          terminal: TerminalSquare,
                          file: FileCode2,
                          app: AppWindow,
                          run: AppWindow,
                          preview: Monitor,
                      }[surface.kind];
    return <Icon aria-hidden="true" />;
}

export function WorkspaceSurfaceCard({ surface, onOpen }: { surface: Surface; onOpen: (surface: Surface) => void }) {
    return (
        <button
            className={`workspace-surface-card kind-${surface.kind}`}
            type="button"
            onClick={() => onOpen(surface)}
            aria-label={`Open ${surface.title} on ${surface.hostLabel}`}
            title={`${surface.title} · ${surface.hostLabel}`}
        >
            {surface.previewUrl ? (
                <img src={surface.previewUrl} alt="" loading="lazy" />
            ) : (
                <span className="workspace-surface-empty">
                    <SurfaceIcon surface={surface} />
                    <span>{surface.title}</span>
                    <small>{surface.status === "suspended" ? "Session suspended" : "Open to view"}</small>
                </span>
            )}
            <span className="workspace-corner-icon">
                <SurfaceIcon surface={surface} />
            </span>
            <span className="workspace-corner-open">
                <ArrowUpRight aria-hidden="true" />
            </span>
            <span className={`workspace-surface-status status-${surface.status}`} role="status">
                <i /> <span className="sr-only">{surface.status}</span>
                {surface.attention !== "none" && <span>{surface.attention}</span>}
            </span>
            {surface.phoneControl && <span className="workspace-labs">Labs</span>}
        </button>
    );
}
