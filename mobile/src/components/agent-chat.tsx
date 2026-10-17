import { ArrowUp, LayoutGrid, LoaderCircle, RefreshCw, Server, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { KronosHostClient, messageText } from "../lib/kronos-client";
import type { HostProfile, KronosMessage, KronosSession, Surface } from "../types";
import { AgentAvatar } from "./agent-avatar";
import { ComposerWidgetDock } from "./composer-widget-dock";

interface AgentChatProps {
    open: boolean;
    hostsLoaded: boolean;
    host?: HostProfile;
    session?: KronosSession;
    client: KronosHostClient | null;
    onEnsureSession: () => Promise<KronosSession>;
    onOpenHosts: () => void;
    onOpenWorkspace: () => void;
    surfaces?: Surface[];
    onOpenSurface?: (surface: Surface) => void;
    connectionError?: string;
    lastUsedSurfaceId?: string;
    agentSurfaceId?: string;
}

export function AgentChat({
    open,
    hostsLoaded,
    host,
    session,
    client,
    onEnsureSession,
    onOpenHosts,
    onOpenWorkspace,
    surfaces = [],
    onOpenSurface,
    connectionError,
    lastUsedSurfaceId,
    agentSurfaceId,
}: AgentChatProps) {
    const [messages, setMessages] = useState<KronosMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const submission = useRef(false);
    const drafts = useRef(new Map<string, string>());
    const scope = `${host?.id ?? ""}:${session?.id ?? ""}`;
    const activeScope = useRef(scope);
    activeScope.current = scope;
    const previousScope = useRef(scope);
    const draftRef = useRef(draft);
    draftRef.current = draft;

    useEffect(() => {
        drafts.current.set(previousScope.current, draftRef.current);
        previousScope.current = scope;
        setDraft(drafts.current.get(scope) ?? "");
        setSubmitting(submission.current);
        setMessages([]);
        setError("");
        setBusy(false);
    }, [scope]);

    useEffect(() => {
        if (!open || !client || !session?.id) return;
        let disposed = false;
        let refreshing = false;
        setLoading(true);
        const refresh = async () => {
            if (disposed || refreshing) return;
            refreshing = true;
            try {
                const [transcript, statuses] = await Promise.all([
                    client.listMessages(session.id),
                    client.getSessionStatuses(),
                ]);
                if (disposed) return;
                setMessages(transcript);
                setBusy(["busy", "retry"].includes(statuses[session.id]?.type));
                setError("");
            } catch (reason) {
                if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
            } finally {
                refreshing = false;
                if (!disposed) setLoading(false);
            }
        };
        void refresh();
        const unsubscribe = client.onEvent(() => void refresh());
        const timer = window.setInterval(() => void refresh(), 2_000);
        return () => {
            disposed = true;
            unsubscribe();
            window.clearInterval(timer);
        };
    }, [client, open, refreshKey, session?.id]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const text = draft.trim();
        if (!text || !host || !client || submission.current || busy) return;
        const submittedScope = scope;
        let targetScope = scope;
        submission.current = true;
        setSubmitting(true);
        setError("");
        const isCurrent = () => [submittedScope, targetScope].includes(activeScope.current);
        try {
            const target = session ?? (await onEnsureSession());
            targetScope = `${host.id}:${target.id}`;
            drafts.current.set(targetScope, text);
            await client.sendMessage(target.id, text, target.directory);
            drafts.current.set(submittedScope, "");
            drafts.current.set(targetScope, "");
            if (isCurrent()) {
                if (draftRef.current === text) setDraft("");
                setBusy(true);
                setRefreshKey((value) => value + 1);
            }
        } catch (reason) {
            if (isCurrent()) setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            submission.current = false;
            setSubmitting(false);
        }
    };

    const stop = async () => {
        if (!client || !session) return;
        const stoppedScope = scope;
        try {
            const stopped = await client.abortSession(session.id, session.directory);
            if (!stopped) throw new Error("The runtime did not confirm cancellation. Retry or check the host.");
            if (activeScope.current !== stoppedScope) return;
            setBusy(false);
            setRefreshKey((value) => value + 1);
        } catch (reason) {
            if (activeScope.current === stoppedScope) {
                setError(reason instanceof Error ? reason.message : String(reason));
            }
        }
    };

    return (
        <section className={`agent-chat ${open ? "is-open" : ""}`} aria-hidden={!open} inert={!open}>
            <header className="agent-chat-shell-bar">
                <div className="agent-chat-shell-identity">
                    <AgentAvatar small />
                    <span>
                        <strong>KronosCode</strong>
                        <small>{host?.label ?? "KronTerm"} · Labs</small>
                    </span>
                </div>
                <div className="agent-chat-shell-actions">
                    <button type="button" aria-label="Choose agent host" onClick={onOpenHosts}>
                        <Server />
                    </button>
                    <button type="button" aria-label="Open workspace" onClick={onOpenWorkspace}>
                        <LayoutGrid />
                    </button>
                </div>
            </header>
            {!hostsLoaded || !host ? (
                <div className="agent-chat-mobile-state">
                    {hostsLoaded ? <AgentAvatar /> : <LoaderCircle className="spin" />}
                    <strong>{hostsLoaded ? "Connect your agent" : "Loading your hosts"}</strong>
                    <p>Choose a compatible KronosCode host to start or resume a conversation.</p>
                    {hostsLoaded && (
                        <button type="button" onClick={onOpenHosts}>
                            <Server />
                            Connect host
                        </button>
                    )}
                </div>
            ) : (
                <div className="agent-chat-mobile-body">
                    {connectionError && (
                        <div className="agent-connection-note" role="status">
                            <span>Host offline. Your draft stays here.</span>
                            <button type="button" onClick={onOpenHosts}>
                                Reconnect
                            </button>
                        </div>
                    )}
                    <div className="agent-chat-transcript" role="log" aria-label="Agent conversation">
                        {loading && !messages.length && <p role="status">Loading conversation…</p>}
                        {!loading && !messages.length && <p>Ask a question or give the agent a task.</p>}
                        {messages.map((message) => {
                            const text = messageText(message.parts);
                            return text ? (
                                <article key={message.info.id} className={`agent-chat-message is-${message.info.role}`}>
                                    {message.info.role !== "user" && <AgentAvatar small />}
                                    <p>{text}</p>
                                </article>
                            ) : null;
                        })}
                        {busy && <p role="status">Agent is working…</p>}
                    </div>
                    {error && (
                        <div className="agent-chat-error" role="alert">
                            <p>{error}</p>
                            <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
                                <RefreshCw />
                                Refresh
                            </button>
                        </div>
                    )}
                    {onOpenSurface && (
                        <ComposerWidgetDock
                            surfaces={surfaces}
                            lastUsedId={lastUsedSurfaceId}
                            agentSurfaceId={agentSurfaceId}
                            onOpen={onOpenSurface}
                        />
                    )}
                    <form className="agent-chat-composer" onSubmit={(event) => void submit(event)}>
                        <textarea
                            aria-label="Message the agent"
                            placeholder="Message KronosCode"
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                        />
                        {busy ? (
                            <button type="button" aria-label="Stop agent" onClick={() => void stop()}>
                                <Square />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                aria-label="Send message"
                                disabled={submitting || !draft.trim() || !!connectionError}
                            >
                                {submitting ? <LoaderCircle className="spin" /> : <ArrowUp />}
                            </button>
                        )}
                    </form>
                </div>
            )}
        </section>
    );
}
