import { Capacitor } from "@capacitor/core";
import { ArrowLeft, Cpu, KeyRound, Laptop, Shield } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { LocalModelConfig } from "../lib/local-agent-adapter";
import { localLinux } from "../lib/local-linux";
import { handleWidgetDialogKey } from "../lib/widget-dialog-keys";
import "./mobile-settings.css";

export function MobileSettings({
    config,
    onChange,
    onSave,
    onClose,
    onHosts,
    error,
}: {
    config: LocalModelConfig;
    onChange: (config: LocalModelConfig) => void;
    onSave: () => Promise<void>;
    onClose: () => void;
    onHosts?: () => void;
    error?: string;
}) {
    const [page, setPage] = useState("model");
    const [saving, setSaving] = useState(false);
    const state = useSyncExternalStore(localLinux.subscribe, localLinux.getSnapshot);
    return (
        <section
            className="mobile-settings"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onKeyDown={(event) => handleWidgetDialogKey(event, onClose)}
        >
            <header>
                <button type="button" autoFocus onClick={onClose} aria-label="Close settings">
                    <ArrowLeft />
                </button>
                <h1>Settings</h1>
            </header>
            <nav aria-label="Settings pages">
                {[
                    { id: "model", label: "Model", icon: KeyRound },
                    { id: "runtime", label: "Runtime", icon: Cpu },
                    { id: "connections", label: "Connections", icon: Laptop },
                    { id: "privacy", label: "Privacy", icon: Shield },
                ].map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" aria-pressed={page === id} onClick={() => setPage(id)}>
                        <Icon />
                        {label}
                    </button>
                ))}
            </nav>
            <div className="mobile-settings-content">
                {page === "model" && (
                    <form
                        onSubmit={async (event) => {
                            event.preventDefault();
                            if (saving) return;
                            setSaving(true);
                            try {
                                await onSave();
                            } finally {
                                setSaving(false);
                            }
                        }}
                    >
                        <h2>Model connection</h2>
                        <p>Connect an OpenAI-compatible model. The agent and its tools run on this device.</p>
                        <div className="mobile-settings-group">
                            <label>
                                Chat completions endpoint
                                <input
                                    aria-label="Local agent model endpoint"
                                    inputMode="url"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    value={config.endpoint}
                                    onChange={(event) => onChange({ ...config, endpoint: event.target.value })}
                                    placeholder="https://…/v1/chat/completions"
                                    required
                                />
                            </label>
                            <label>
                                Model
                                <input
                                    aria-label="Local agent model"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    value={config.model}
                                    onChange={(event) => onChange({ ...config, model: event.target.value })}
                                    required
                                />
                            </label>
                            <label>
                                API key
                                <input
                                    aria-label="Local agent API key"
                                    type="password"
                                    autoComplete="off"
                                    value={config.apiKey}
                                    onChange={(event) => onChange({ ...config, apiKey: event.target.value })}
                                    required
                                />
                            </label>
                        </div>
                        {error && <p role="alert">{error}</p>}
                        <button className="mobile-settings-save" type="submit" disabled={saving}>
                            {saving ? "Saving…" : "Save model connection"}
                        </button>
                    </form>
                )}
                {page === "runtime" && (
                    <>
                        <h2>Local workspace</h2>
                        <dl className="mobile-settings-group">
                            <div>
                                <dt>Console VM</dt>
                                <dd>{state.phase}</dd>
                            </div>
                            <div>
                                <dt>Memory</dt>
                                <dd>64 MB</dd>
                            </div>
                            <div>
                                <dt>Guest network</dt>
                                <dd>Off</dd>
                            </div>
                            <div>
                                <dt>Checkpoint</dt>
                                <dd>{state.savedAt ? new Date(state.savedAt).toLocaleString() : "Not saved yet"}</dd>
                            </div>
                        </dl>
                        <p>
                            Agent commands and file tools use the saved console VM. The graphical desktop is a separate
                            temporary guest.
                        </p>
                    </>
                )}
                {page === "connections" && (
                    <>
                        <h2>Computers</h2>
                        <p>This iPhone runs independently. Connect a Mac when you want to open its widgets.</p>
                        <button
                            className="mobile-settings-save"
                            type="button"
                            onClick={() => {
                                onClose();
                                onHosts?.();
                            }}
                            disabled={!onHosts}
                        >
                            Pair or manage computers
                        </button>
                    </>
                )}
                {page === "privacy" && (
                    <>
                        <h2>Storage and model access</h2>
                        <div className="mobile-settings-group">
                            <p>
                                {Capacitor.isNativePlatform()
                                    ? "Model credentials are stored in this iPhone’s Keychain."
                                    : "In this browser preview, model credentials remain in session storage."}
                            </p>
                            <p>
                                Prompts and tool results are sent to the model endpoint you configure. Credentials are
                                not sent into Linux.
                            </p>
                            <p>
                                Console checkpoints stay on this device. The graphical desktop does not survive an app
                                reload.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
