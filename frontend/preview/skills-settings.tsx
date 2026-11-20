import { SettingsNavigation } from "@hermes/app/settings/settings-navigation";
import { Package, Zap } from "@hermes/lib/icons";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../app/tab/os-hermes-settings-theme.css";
import "./settings-preview.css";
function SkillsSettingsPreview() {
    const [section, setSection] = useState("plugins");
    const [installed, setInstalled] = useState(false);
    const [enabled, setEnabled] = useState(true);
    return (
        <section
            className="os-hermes-settings-dialog"
            data-color-scheme="dark"
            style={{
                position: "fixed",
                inset: 24,
                maxWidth: 1280,
                maxHeight: 900,
                margin: "auto",
                display: "flex",
                flexDirection: "column",
            }}
        >
            <header
                className="os-hermes-settings-titlebar"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
                <strong>KronOS Settings</strong>
                <span style={{ fontSize: 12 }}>Interactive preview · sample data</span>
            </header>
            <div
                data-overlay-split=""
                style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(160px, 208px) minmax(0,1fr)",
                    flex: 1,
                    minHeight: 0,
                }}
            >
                <SettingsNavigation
                    groups={[
                        { id: "plugins", label: "Plugins", icon: Package },
                        { id: "skills", label: "Skills installer", icon: Zap },
                    ].map((item) => ({ ...item, active: section === item.id, onSelect: () => setSection(item.id) }))}
                />
                <main style={{ padding: 32, overflow: "auto" }}>
                    <h1 style={{ fontSize: 22, marginBottom: 8 }}>
                        {section === "plugins" ? "Plugins" : "Skills installer"}
                    </h1>
                    <p className="text-muted-foreground" style={{ marginBottom: 28 }}>
                        {section === "plugins"
                            ? "Your existing Hermes desktop and agent plugins."
                            : "Install from Skills Hub. Successful installs refresh the agent’s skills and slash commands."}
                    </p>
                    <div
                        style={{
                            padding: 20,
                            border: "1px solid #3d3d41",
                            borderRadius: 10,
                            background: "#262628",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 20,
                        }}
                    >
                        <div>
                            <strong>{section === "plugins" ? "Workspace tools" : "Writing assistant"}</strong>
                            <p className="text-muted-foreground" style={{ marginTop: 6, fontSize: 13 }}>
                                {section === "plugins"
                                    ? "Sample plugin · Installed"
                                    : installed
                                      ? "Installed · Skills reloaded · Ready to use"
                                      : "Sample skill · Browse and install through the existing Hermes hub"}
                            </p>
                        </div>
                        <button
                            style={{
                                padding: "8px 14px",
                                border: "1px solid #48484c",
                                borderRadius: 7,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                            }}
                            onClick={() => (section === "plugins" ? setEnabled(!enabled) : setInstalled(!installed))}
                        >
                            {section === "plugins"
                                ? enabled
                                    ? "Enabled"
                                    : "Disabled"
                                : installed
                                  ? "Remove sample"
                                  : "Install sample"}
                        </button>
                    </div>
                    <p className="text-muted-foreground" style={{ marginTop: 24, fontSize: 12 }}>
                        Preview controls change sample state only. The app uses the existing Hermes installer and
                        gateway.
                    </p>
                </main>
            </div>
        </section>
    );
}
createRoot(document.getElementById("root")!).render(<SkillsSettingsPreview />);
