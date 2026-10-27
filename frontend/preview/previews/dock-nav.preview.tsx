import { AppIcon } from "@/app/components/app-icon";
import { DockNav } from "@/app/components/dock-nav";
import "@/app/components/system-ui/system-ui.css";
import { useState } from "react";

export function DockNavPreview() {
    const [dark, setDark] = useState(false);
    const [opened, setOpened] = useState("");
    return (
        <main
            className="kt-system-ui"
            data-color-scheme={dark ? "dark" : "light"}
            style={{ position: "fixed", inset: 40, background: "var(--kt-content)", color: "var(--kt-label)" }}
        >
            <button type="button" onClick={() => setDark(!dark)} style={{ cursor: "pointer" }}>
                Toggle appearance
            </button>
            <p role="status">{opened}</p>
            <div
                style={{
                    position: "absolute",
                    bottom: 12,
                    left: 16,
                    right: 16,
                    display: "flex",
                    justifyContent: "center",
                }}
            >
                <DockNav
                    aria-label="Applications"
                    items={["term", "web", "preview", "codeeditor", "sysinfo"].map((view) => ({
                        id: view,
                        label: view === "preview" ? "File Explorer" : view === "codeeditor" ? "ADE" : view,
                        icon: <AppIcon icon={`view:${view === "codeeditor" ? "term" : view}`} />,
                        onClick: () => setOpened(view),
                        running: view === "term",
                        active: view === opened,
                    }))}
                />
            </div>
        </main>
    );
}
