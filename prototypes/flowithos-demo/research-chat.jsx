import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Circle, ExternalLink, History, LayoutPanelLeft, Link2, LoaderCircle, Search, PanelRightOpen } from "lucide-react";

import { createPortal } from "react-dom";

const chatKey = "flowithos-research-chat-v1";

function readChat() {
    try {
        const stored = JSON.parse(localStorage.getItem(chatKey));
        return {
            turns: (stored?.turns ?? []).map((turn) => turn.pending ? { ...turn, pending: false, error: "This request was interrupted. Retry it to continue." } : turn),
            selection: stored?.selection ?? [], draft: stored?.draft ?? "",
        };
    } catch {
        return { turns: [], selection: [], draft: "" };
    }
}

const pinnedSteps = ["Read selected tabs", "Draft brief and check citations", "Save brief to Canvas"];
const searchSteps = ["Search the public web", "Read sources and open tabs", "Draft brief and check citations", "Save brief to Canvas"];

export function ResearchChat({ tabs, onShowTab, onSave, onOpenFlow, onRestore, collapsed, dock, onExpand }) {
    const [initial] = useState(readChat);
    const [selection, setSelection] = useState(initial.selection);
    const [draft, setDraft] = useState(initial.draft);
    const [turns, setTurns] = useState(initial.turns);
    const [researchNext, setResearchNext] = useState(false);
    const [progress, setProgress] = useState(null);
    const eligible = tabs.flatMap((tab) => {
        const page = tab.pages[tab.index];
        return page.kind === "live" ? [{ ...page, tabId: tab.id }] : [];
    });
    const selected = selection.map((source) => eligible.find((tab) => tab.liveId === source.id) ??
        eligible.find((tab) => tab.address === source.address)).filter((entry, index, list) => entry && list.indexOf(entry) === index);
    const unavailable = selection.filter((source) => !selected.some((tab) => tab.liveId === source.id || tab.address === source.address));
    const scroll = useRef(null);
    const [sourcesOpen, setSourcesOpen] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);
    const busy = progress !== null;

    useEffect(() => window.liveBrowser?.subscribe((event) => {
        if (event.type !== "research-progress") return;
        setProgress((current) => current?.id === event.runId ? { ...current, step: event.step } : current);
    }), []);

    useEffect(() => {
        try { localStorage.setItem(chatKey, JSON.stringify({ turns, selection, draft })); } catch {}
    }, [turns, selection, draft]);

    useEffect(() => {
        if (scroll.current && !collapsed) scroll.current.scrollTop = scroll.current.scrollHeight;
    }, [turns.length, progress?.step, collapsed]);

    async function send(question, research = researchNext) {
        if (busy || !question.trim()) return;
        const id = crypto.randomUUID();
        const chatOnly = !research;
        const automatic = !chatOnly && selected.length !== 2;
        const sources = automatic || chatOnly ? [] : selected.map((tab) => ({ id: tab.liveId, address: tab.address }));
        const matches = (turn) => chatOnly ? !!(turn.reply || turn.flow) : turn.flow && ((automatic && turn.automatic) || (!automatic && !turn.automatic && turn.sources.length === sources.length &&
            turn.sources.every((source, index) => source.address === sources[index].address)));
        const history = turns.filter(matches).slice(-8).map((turn) => ({
            question: turn.question,
            summary: (turn.reply ?? turn.brief.findings.map((finding) => finding.text).join(" ")).slice(0, 1200),
        }));
        if (!automatic && !chatOnly) setSelection(sources);
        setDraft("");
        setResearchNext(false);
        setTurns((current) => [...current, { id, question, sources, automatic, chatOnly, pending: true }]);
        setProgress({ id, step: 0, automatic, chatOnly });
        try {
            const request = { question: question.trim(), history, runId: id };
            const result = await (chatOnly ? window.liveBrowser.command("chat", request)
                : window.liveBrowser.command("compare", { ...request, selected: sources, search: automatic }));
            if (result?.reply) {
                setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, pending: false, reply: result.reply } : turn));
                return;
            }
            if (!result?.brief) {
                setTurns((current) => current.map((turn) => turn.id === id ? {
                    ...turn, pending: false, error: result?.error ?? "Pi couldn’t complete this request.", tabId: result?.tabId,
                } : turn));
                return;
            }
            setProgress({ id, step: automatic ? 3 : 2, automatic });
            const flow = onSave(result.brief, result.sources);
            setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, pending: false, brief: result.brief, flow } : turn));
        } catch {
            setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, pending: false, error: "The request stopped. Try again." } : turn));
        } finally {
            setProgress(null);
        }
    }

    function expandSources() {
        setSourcesOpen((open) => collapsed || !open);
        if (collapsed) onExpand();
    }

    const composer = <form className="pen-composer" aria-label={collapsed ? "Docked chat composer" : "Chat composer"} onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
        <textarea aria-label="Message Pi" placeholder={busy ? "Pi is working…" : researchNext ? "What should Pi research?" : turns.length ? "Ask a follow-up…" : "Message Pi…"} maxLength={1800} value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send(draft);
                }
            }} />
        <div className="pen-composer-controls">
            <button type="button" className="composer-sources" aria-pressed={researchNext} disabled={busy} onClick={() => setResearchNext(!researchNext)}><Search size={15} /> Research</button>
            {researchNext && <button type="button" className="composer-sources" aria-pressed={sourcesOpen && !collapsed} onClick={expandSources}><Link2 size={15} /> {selected.length === 2 ? "2 pinned" : "Web"}</button>}
            <span className="composer-model">Pi</span>
            <span className="composer-spacer" />
            {busy && <span className="composer-status" role="status"><LoaderCircle className="task-state-spinner" size={13} /> {progress.chatOnly ? "Pi is replying…" : (progress.automatic ? searchSteps : pinnedSteps)[progress.step]}</span>}
            {collapsed && <button type="button" className="icon-button" aria-label="Open research conversation" title="Open research conversation" onClick={onExpand}><PanelRightOpen size={16} /></button>}
            <button className="composer-send" aria-label="Send message" title="Send message" disabled={busy || !draft.trim()}><ArrowUp size={17} /></button>
        </div>
    </form>;

    return <div className="research-chat">
        {collapsed && dock && createPortal(composer, dock)}
        <div className="chat-heading">
            <span><History size={15} /> Pi conversation</span>
            <button className="soft" disabled={busy || !turns.length} onClick={() => setConfirmReset(!confirmReset)}>New chat</button>
        </div>
        {confirmReset && <div className="agent-notice"><p>Start a new conversation? Saved Canvas briefs will stay in Flows.</p>
            <button className="soft" onClick={() => { setTurns([]); setDraft(""); setConfirmReset(false); }}>Start new chat</button>
            <button className="soft" onClick={() => setConfirmReset(false)}>Cancel</button>
        </div>}
        <details className="chat-sources" open={sourcesOpen} onToggle={(event) => {
            if (event.currentTarget.open !== sourcesOpen) setSourcesOpen(event.currentTarget.open);
        }}>
            <summary>Research sources · {selected.length}/2 pinned</summary>
            {unavailable.map((source) => <div className="compare-tab" key={source.id}>
                <small>{source.address}</small><button className="soft" onClick={() => onRestore(source.address)}>Reopen source</button>
            </div>)}
            {eligible.length < 2 && <p className="muted">Pi can find public sources automatically. Open two live pages if you want to choose the sources yourself.</p>}
            {eligible.map((tab) => {
                const checked = selected.some((source) => source.liveId === tab.liveId);
                return <div className="compare-tab" key={tab.liveId}>
                    <label><input type="checkbox" checked={checked} disabled={busy || (!checked && selected.length === 2)}
                        onChange={() => setSelection((checked ? selected.filter((source) => source.liveId !== tab.liveId) : [...selected, tab])
                            .map((source) => ({ id: source.liveId, address: source.address })))} />
                        <span><strong>{tab.title}</strong><small>{tab.address}</small></span>
                    </label>
                    <button type="button" className="icon-button" aria-label={"Show " + tab.title} onClick={() => onShowTab(tab.tabId)}><ExternalLink size={14} /></button>
                </div>;
            })}
        </details>
        <div className="chat-turns" ref={scroll} aria-live="polite" aria-relevant="additions">
            {!turns.length && <p className="muted">Message Pi directly, or turn on Research to find sources and save a cited Canvas brief.</p>}
            {turns.map((turn) => {
                const checking = eligible.find((tab) => tab.liveId === turn.tabId);
                const steps = turn.chatOnly ? ["Answer message"] : turn.automatic ? searchSteps : pinnedSteps;
                const step = progress?.id === turn.id ? progress.step : 0;
                return <article className="chat-turn" key={turn.id}>
                    <p className="chat-user">{turn.question}</p>
                    {turn.pending && !turn.chatOnly && <ol className="chat-progress" aria-label="Research steps">
                        {steps.map((label, index) => <li key={label} data-active={index === step}>
                            {index < step ? <Check size={14} /> : index === step ? <LoaderCircle className="task-state-spinner" size={14} /> : <Circle size={14} />}{label}
                        </li>)}
                    </ol>}
                    {turn.error && <div className="agent-notice" role="alert"><p>{turn.error}</p>
                        {checking && <button className="soft" onClick={() => onShowTab(checking.tabId)}>Open tab to check</button>}
                        <button className="soft" disabled={busy} onClick={() => void send(turn.question, !turn.chatOnly)}>Retry</button>
                    </div>}
                    {turn.reply && <p className="chat-answer">{turn.reply}</p>}
                    {turn.flow && <div className="agent-result">
                        <strong>{turn.brief.title}</strong><p>Saved to Canvas · {turn.flow.sources.length} sources</p>
                        <details><summary>Completed steps</summary><ol className="chat-progress">{steps.map((label) => <li key={label}><Check size={14} />{label}</li>)}</ol></details>
                        <ul className="cited-findings">{turn.brief.findings.map((finding, index) => <li key={index}>{finding.text} {finding.sources.map((source) => "[" + source + "]").join(" ")}</li>)}</ul>
                        <button className="soft" onClick={() => onOpenFlow(turn.flow)}><LayoutPanelLeft size={14} /> Open cited Canvas</button>
                    </div>}
                </article>;
            })}
        </div>
        {!collapsed && composer}
    </div>;
}
