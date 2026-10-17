import { KeychainAccess, SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Capacitor } from "@capacitor/core";
import { ArrowUp, LayoutGrid, Plus, Server, Settings2, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { runLocalAgentTurn, type LocalAgentMessage, type LocalModelConfig } from "../lib/local-agent-adapter";
import { registerLocalAgentControl } from "../lib/local-agent-control";
import type { Surface } from "../types";
import { AgentAvatar } from "./agent-avatar";
import { ComposerWidgetDock } from "./composer-widget-dock";
import { MobileSettings } from "./mobile-settings";

const ConfigKey = "kronterm.mobile.model.v1";
export function LocalAgent({
    open = true,
    surfaces = [],
    lastUsedSurfaceId,
    onOpenSurface,
    onWorkspace,
    onHosts,
    onLaunchWidget,
    resumeRequest,
}: {
    open?: boolean;
    surfaces?: Surface[];
    lastUsedSurfaceId?: string;
    onOpenSurface?: (surface: Surface) => void;
    onWorkspace?: () => void;
    onHosts?: () => void;
    onLaunchWidget?: (widget: "browser" | "desktop" | "terminal") => void;
    resumeRequest?: { id: string; text: string };
}) {
    const [config, setConfig] = useState<LocalModelConfig>({ endpoint: "", model: "", apiKey: "" });
    const [messages, setMessages] = useState<LocalAgentMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const [activity, setActivity] = useState("");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [widgetsOpen, setWidgetsOpen] = useState(false);
    const abort = useRef<AbortController | undefined>(undefined);
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        void (async () => {
            try {
                if (Capacitor.isNativePlatform()) await SecureStorage.setKeyPrefix("kronterm_");
                const value = Capacitor.isNativePlatform()
                    ? await SecureStorage.get(ConfigKey, false, false)
                    : JSON.parse(sessionStorage.getItem(ConfigKey) ?? "null");
                if (
                    alive.current &&
                    value &&
                    typeof value.endpoint === "string" &&
                    typeof value.model === "string" &&
                    typeof value.apiKey === "string"
                )
                    setConfig(value);
            } catch {
                /* A missing model configuration is a normal first launch. */
            }
        })();
        return () => {
            alive.current = false;
            abort.current?.abort();
        };
    }, []);
    const send = async (override?: string) => {
        const input = override ?? draft;
        if (abort.current || !input.trim()) return;
        if (!config.endpoint || !config.model || !config.apiKey) {
            setDraft(input);
            setSettingsOpen(true);
            setError("Configure a model connection to continue.");
            return;
        }
        const controller = new AbortController();
        let finish!: () => void;
        const finished = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const unregister = registerLocalAgentControl(controller, finished);
        abort.current = controller;
        const history: LocalAgentMessage[] = [...messages, { role: "user", content: input }];
        setMessages(history);
        setDraft("");
        setError("");
        setActivity("Calling model…");
        try {
            const text = await runLocalAgentTurn(config, history, controller.signal, (name) => {
                if (alive.current) setActivity(`Running ${name} on this device…`);
            });
            if (alive.current) setMessages([...history, { role: "assistant", content: text }]);
        } catch (reason) {
            if (alive.current) setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            unregister();
            finish();
            abort.current = undefined;
            if (alive.current) setActivity("");
        }
    };
    const lastResume = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (!resumeRequest || lastResume.current === resumeRequest.id) return;
        lastResume.current = resumeRequest.id;
        void send(resumeRequest.text);
    }, [resumeRequest?.id]);
    const save = async () => {
        try {
            const url = new URL(config.endpoint);
            if (url.protocol !== "https:") throw new Error("Use HTTPS");
            if (Capacitor.isNativePlatform()) {
                await SecureStorage.setKeyPrefix("kronterm_");
                await SecureStorage.set(
                    ConfigKey,
                    { ...config },
                    false,
                    false,
                    KeychainAccess.whenUnlockedThisDeviceOnly
                );
            } else sessionStorage.setItem(ConfigKey, JSON.stringify(config));
            setError("");
            setSettingsOpen(false);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    };
    return (
        <section className={`agent-chat local-agent-shell ${open ? "is-open" : ""}`} aria-hidden={!open} inert={!open}>
            <header className="agent-chat-shell-bar">
                <div className="agent-chat-shell-identity">
                    <AgentAvatar small />
                    <span>
                        <strong>KronosCode</strong>
                        <small>This iPhone · Labs</small>
                    </span>
                </div>
                <div className="agent-chat-shell-actions">
                    <button type="button" aria-label="Model settings" onClick={() => setSettingsOpen(!settingsOpen)}>
                        <Settings2 />
                    </button>
                    {onHosts && (
                        <button type="button" aria-label="Connect Mac" onClick={onHosts}>
                            <Server />
                        </button>
                    )}
                    {onWorkspace && (
                        <button type="button" aria-label="Open workspace" onClick={onWorkspace}>
                            <LayoutGrid />
                        </button>
                    )}
                </div>
            </header>
            {settingsOpen && (
                <MobileSettings
                    config={config}
                    onChange={setConfig}
                    onSave={save}
                    error={error}
                    onClose={() => setSettingsOpen(false)}
                    onHosts={onHosts}
                />
            )}
            <div className="agent-chat-mobile-body">
                <div className="agent-chat-transcript" role="log" aria-label="Local agent conversation">
                    {!messages.length && (
                        <div className="local-agent-intro">
                            <AgentAvatar />
                            <h1>What shall we work on?</h1>
                            <p>Your workspace runs on this iPhone.</p>
                            {!config.model && (
                                <button type="button" onClick={() => setSettingsOpen(true)}>
                                    Connect a model
                                </button>
                            )}
                        </div>
                    )}
                    {messages.map((message, i) => (
                        <div className={`local-agent-message ${message.role}`} key={i}>
                            {message.role === "assistant" && <AgentAvatar small />}
                            <p>{message.content}</p>
                        </div>
                    ))}
                    {activity && <p role="status">{activity}</p>}
                    {error && (
                        <p role="alert" className="local-error">
                            {error}
                        </p>
                    )}
                </div>
                {onOpenSurface && (
                    <ComposerWidgetDock
                        surfaces={surfaces}
                        lastUsedId={lastUsedSurfaceId}
                        agentSurfaceId={
                            activity.startsWith("Running vm_")
                                ? surfaces.find((surface) => surface.localLinux && !surface.localWidget)?.id
                                : undefined
                        }
                        onOpen={onOpenSurface}
                    />
                )}
                {widgetsOpen && (
                    <div className="composer-widget-menu" role="group" aria-label="Open local widget">
                        {(["browser", "terminal", "desktop"] as const).map((widget) => (
                            <button
                                type="button"
                                key={widget}
                                onClick={() => {
                                    setWidgetsOpen(false);
                                    onLaunchWidget?.(widget);
                                }}
                            >
                                {widget}
                            </button>
                        ))}
                    </div>
                )}
                <form
                    className="agent-chat-composer"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void send();
                    }}
                >
                    <textarea
                        aria-label="Local agent message"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        disabled={!!activity}
                        placeholder="Message KronosCode"
                    />
                    <div className="composer-bottom-actions">
                        <button type="button" aria-label="Open widget" onClick={() => setWidgetsOpen(!widgetsOpen)}>
                            <Plus />
                        </button>
                        <span />
                        <button
                            type="submit"
                            aria-label="Send local agent message"
                            disabled={!!activity || !draft.trim()}
                        >
                            <ArrowUp />
                        </button>
                        {activity && (
                            <button type="button" aria-label="Stop local agent" onClick={() => abort.current?.abort()}>
                                <Square />
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </section>
    );
}
