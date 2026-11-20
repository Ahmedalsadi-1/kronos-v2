import React, { useState } from "react";
import { Columns2, ExternalLink, LayoutPanelLeft } from "lucide-react";

export function CompareTabs({ tabs, onShowTab, onSave }) {
    const [selected, setSelected] = useState([]);
    const [question, setQuestion] = useState("Compare the key claims, agreements, differences, and gaps in these pages.");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [saved, setSaved] = useState(false);
    const eligible = tabs.flatMap((tab) => {
        const page = tab.pages[tab.index];
        return page.kind === "live" ? [{ tabId: tab.id, ...page }] : [];
    });
    const sources = selected.map((id) => eligible.find((entry) => entry.liveId === id)).filter(Boolean);

    async function compare(event) {
        event.preventDefault();
        if (busy || sources.length !== 2 || !question.trim()) return;
        setBusy(true);
        setResult(null);
        setSaved(false);
        try {
            setResult(await window.liveBrowser.command("compare", {
                selected: sources.map((entry) => ({ id: entry.liveId, address: entry.address })), question,
            }));
        } catch {
            setResult({ error: "The comparison could not start. Check the two tabs and try again." });
        } finally {
            setBusy(false);
        }
    }

    return <section className="compare-panel">
        <h2><Columns2 size={16} /> Compare two tabs</h2>
        <form onSubmit={compare}>
            <fieldset disabled={busy}>
                <legend>Live tabs · {sources.length}/2 selected</legend>
                {eligible.map((entry) => {
                    const checked = sources.some((source) => source.liveId === entry.liveId);
                    return <div className="compare-tab" key={entry.liveId}>
                        <label>
                            <input type="checkbox" checked={checked} disabled={!checked && sources.length === 2} onChange={() => {
                                setSelected(checked ? sources.filter((source) => source.liveId !== entry.liveId).map((source) => source.liveId)
                                    : [...sources.map((source) => source.liveId), entry.liveId]);
                                setResult(null);
                            }} />
                            <span><strong>{entry.title}</strong><small>{entry.address}</small></span>
                        </label>
                        <button type="button" className="icon-button" title="Show tab" aria-label={"Show " + entry.title} onClick={() => onShowTab(entry.tabId)}><ExternalLink size={14} /></button>
                    </div>;
                })}
                {eligible.length < 2 && <p className="muted">Open two pages in Live web mode to compare them.</p>}
                <label className="compare-question">Question<textarea value={question} maxLength={2000} onChange={(event) => setQuestion(event.target.value)} /></label>
                <p className="muted">Pi sends readable text from the two selected pages to your configured model provider. On this Mac it can use the KronOS Codex profile.</p>
                <button className="soft" disabled={busy || sources.length !== 2 || !question.trim()}>{busy ? "Comparing…" : "Ask Pi to compare"}</button>
            </fieldset>
        </form>
        {busy && <p className="agent-notice" role="status">Reading the selected pages and drafting a cited brief…</p>}
        {result?.error && <div className="agent-notice" role="alert">
            <p>{result.error}</p>
            {eligible.some((entry) => entry.liveId === result.tabId) && <button className="soft" onClick={() => onShowTab(eligible.find((entry) => entry.liveId === result.tabId).tabId)}>Open tab to check</button>}
        </div>}
        {result?.brief && <div className="agent-result">
            <strong>{result.brief.title}</strong>
            <ol>{result.brief.findings.map((finding, index) => <li key={index}>{finding.text} {finding.sources.map((id) => "[" + id + "]").join(" ")}</li>)}</ol>
            <button className="soft" disabled={saved} onClick={() => { onSave(result.brief, result.sources); setSaved(true); }}><LayoutPanelLeft size={14} /> {saved ? "Saved to Canvas" : "Save cited brief to Canvas"}</button>
        </div>}
    </section>;
}
