import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
    ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, Bookmark, CheckCircle2, ChevronLeft, ChevronRight,
    Circle, FileText, FolderOpen, Globe2, History, Home, LayoutPanelLeft, Menu, Minus, PanelLeft,
    PanelRight, Play, Plus, RefreshCw, Search, Settings, Square, X,
} from "lucide-react";
import { makeTask, presets, sites, siteEntries, stages, taskReport } from "./samples";
import { Library, libraryPages, librarySeed } from "./library";
import { activeStatuses, advanceTask, createAgentTask, recoverTask, terminalStatuses, timelineStatuses, walkthroughs } from "./agent-runtime";
import { AgentPlan } from "./agent-plan";
import { planSteps } from "./agent-plan-data";
import { AgentTaskStatus, AgentTodos } from "./agent-todos";
import { AgentSkills } from "./agent-skills";
import { LiveSurface } from "./live-surface";
import { CompareTabs } from "./compare-tabs";
import { ResearchChat } from "./research-chat";
import "./style.css";

const storageKey = "flowithos-demo-v1";
const home = { kind: "home", title: "New Tab", address: "" };
const initial = {
    tasks: [
        makeTask("Summarize the latest stories on Hacker News", stages.length),
        makeTask("Find papers on generative AI in education", stages.length),
    ],
    ...librarySeed,
    favorites: [],
    enabledSkills: [],
    canvasCards: {},
    theme: "Mist",
    model: "Pro",
};

function readState() {
    try {
        const stored = { ...initial, ...JSON.parse(localStorage.getItem(storageKey)) };
        return { ...stored, tasks: stored.tasks.map(recoverTask) };
    } catch {
        return initial;
    }
}

function IconButton({ label, icon: Icon, ...props }) {
    return <button type="button" className="icon-button" aria-label={label} title={label} {...props}><Icon size={16} /></button>;
}

function Orb({ small = false }) {
    return <span aria-hidden="true" className={small ? "orb small" : "orb"} />;
}

function SiteMark({ site }) {
    return <span aria-hidden="true" className="site-mark" style={{ color: site.color }}>{site.mark}</span>;
}

function App() {
    const [state, setState] = useState(readState);
    const [tabs, setTabs] = useState([{ id: "home", pages: [home], index: 0 }]);
    const [active, setActive] = useState("home");
    const [sidebar, setSidebar] = useState(true);
    const [tabMenu, setTabMenu] = useState(null);
    const [liveMode, setLiveMode] = useState(false);
    const [browserStates, setBrowserStates] = useState({});
    const [agent, showAgent] = useState(false);
    const [comparePanel, setComparePanel] = useState(false);
    const [chatDock, setChatDock] = useState(null);
    const [taskId, selectTask] = useState(null);
    const [agentView, setAgentView] = useState("Chat");
    const [taskAction, setTaskAction] = useState(null);
    const [prompt, setPrompt] = useState("");
    const [followup, setFollowup] = useState("");
    const [modal, setModal] = useState(null);
    const [presetPage, setPresetPage] = useState(0);
    const [address, setAddress] = useState("");
    const [zoom, setZoom] = useState(100);
    const addressRef = useRef(null);
    const promptRef = useRef(null);
    const dialogRef = useRef(null);
    const tab = tabs.find((entry) => entry.id === active) ?? tabs[0];
    const tabPage = tab.pages[tab.index];
    const page = tabPage.kind === "canvas" ? state.flows.find((flow) => flow.address === tabPage.address) ?? tabPage : tabPage;
    const browsing = browserStates[page.liveId] ?? {};
    const isLive = page.kind === "live";
    const task = state.tasks.find((entry) => entry.id === taskId);
    const bookmarked = state.bookmarks.some((entry) => entry.address === page.address);
    const taskSteps = task ? planSteps(task) : [];
    const running = state.tasks.some((entry) => timelineStatuses.includes(entry.status));

    useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(state)); }, [state]);
    useEffect(() => { setAddress(page.address); }, [page]);
    useEffect(() => {
        if (!running) return;
        const timer = setInterval(() => {
            const now = Date.now();
            setState((current) => {
                const tasks = current.tasks.map((entry) => advanceTask(entry, now));
                return tasks.some((entry, index) => entry !== current.tasks[index]) ? { ...current, tasks } : current;
            });
        }, 250);
        return () => clearInterval(timer);
    }, [running]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (modal && !dialog.open) dialog.showModal();
        if (!modal && dialog.open) dialog.close();
    }, [modal]);

    const browserEvents = useRef(null);
    browserEvents.current = (event) => {
        if (event.type === "research-sources") {
            setTabs((current) => {
                const openAddresses = new Set(current.map((entry) => entry.pages[entry.index].address));
                const added = event.sources.filter((source) => !openAddresses.has(source.address)).map((source) => ({
                    id: crypto.randomUUID(), pages: [{ ...source, liveId: crypto.randomUUID() }], index: 0,
                }));
                return [...current, ...added];
            });
            return;
        }
        const known = tabs.some((entry) => entry.pages.some((item) => item.liveId === event.id));
        if (!known) return;
        if (event.type === "new-tab") {
            openPage({ kind: "live", title: event.address, address: event.address }, true);
            return;
        }
        if (event.type === "source" && page.liveId === event.id) {
            askCanvas(event.title || event.address, { kind: "live", address: event.address, title: event.title, summary: event.summary });
            return;
        }
        setBrowserStates((current) => ({
            ...current,
            [event.id]: {
                ...current[event.id],
                ...(event.type === "state" ? { canBack: event.canBack, canForward: event.canForward, loading: event.loading }
                    : { error: event.type === "error" ? event.description : null }),
            },
        }));
        if (event.type === "state" && event.address && !event.loading) {
            const record = { kind: "live", address: event.address, title: event.title || event.address, when: "Today" };
            setState((current) => current.visits[0]?.address === record.address && current.visits[0]?.title === record.title ? current : ({
                ...current, visits: [record, ...current.visits.filter((item) => item.address !== record.address)].slice(0, 40),
            }));
            setTabs((current) => current.map((entry) => ({
                ...entry, pages: entry.pages.map((item) => item.liveId === event.id && (item.address !== event.address || item.title !== (event.title || event.address))
                    ? { ...item, address: event.address, title: event.title || event.address } : item),
            })));
        }
    };
    useEffect(() => window.liveBrowser?.subscribe((event) => browserEvents.current(event)), []);

    const previousLiveIds = useRef(new Set());
    useEffect(() => {
        const ids = new Set(tabs.flatMap((entry) => entry.pages.map((item) => item.liveId).filter(Boolean)));
        const removed = [...previousLiveIds.current].filter((id) => !ids.has(id));
        previousLiveIds.current = ids;
        for (const id of removed) void window.liveBrowser?.command("close", { id });
        if (removed.length) setBrowserStates((current) => Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))));
    }, [tabs]);

    function liveCommand(command, input = {}) {
        if (page.liveId) return window.liveBrowser?.command(command, { id: page.liveId, ...input });
    }

    async function navigateHistory(offset) {
        if (isLive && await liveCommand(offset < 0 ? "back" : "forward")) return;
        stepHistory(offset);
    }

    function reloadLive() {
        setBrowserStates((current) => ({ ...current, [page.liveId]: { ...current[page.liveId], error: null } }));
        void liveCommand("reload");
    }

    function update(key, value) {
        setState((current) => ({ ...current, [key]: value }));
    }

    function openPage(next, newTab = false) {
        if (next.kind === "live") next = { ...next, liveId: crypto.randomUUID() };
        if (newTab) {
            const id = crypto.randomUUID();
            setTabs((current) => [...current, { id, pages: [next], index: 0 }]);
            setActive(id);
        } else {
            setTabs((current) => current.map((entry) => entry.id === tab.id
                ? { ...entry, pages: [...entry.pages.slice(0, entry.index + 1), next], index: entry.index + 1 }
                : entry));
        }
        if (next.kind === "site" || next.kind === "article") {
            setState((current) => ({ ...current, visits: [next, ...current.visits.filter((item) => item.address !== next.address)].slice(0, 40) }));
        }
    }

    function closeTab(id) {
        if (tabs.length === 1) {
            setTabs([{ id: "home", pages: [home], index: 0 }]);
            setActive("home");
            return;
        }
        const index = tabs.findIndex((entry) => entry.id === id);
        const remaining = tabs.filter((entry) => entry.id !== id);
        setTabs(remaining);
        if (active === id) setActive(remaining[Math.max(0, index - 1)].id);
    }

    function stepHistory(offset) {
        setTabs((current) => current.map((entry) => entry.id === tab.id
            ? { ...entry, index: Math.min(entry.pages.length - 1, Math.max(0, entry.index + offset)) }
            : entry));
    }

    function visit(index, query = "", newTab = false) {
        const site = sites[index];
        openPage({
            kind: "site", site: index, query, title: query || site.title,
            address: "https://" + site.host + (query ? "/search?q=" + encodeURIComponent(query) : ""),
        }, newTab);
    }

    function navigate(value) {
        const input = value.trim();
        if (!input) return;
        if (liveMode || isLive) {
            let destination;
            try {
                destination = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input
                    : /^[^\s/]+\.[^\s]+$/.test(input) || /^(localhost|127\.0\.0\.1):\d+\b/.test(input) ? "https://" + input
                    : "https://www.google.com/search?q=" + encodeURIComponent(input));
            } catch {
                return;
            }
            if (!["http:", "https:"].includes(destination.protocol) || destination.username || destination.password) return;
            if (isLive) {
                void liveCommand("navigate", { address: destination.href });
                setAddress(destination.href);
            } else openPage({ kind: "live", title: destination.hostname, address: destination.href });
            return;
        }
        const match = sites.findIndex((site) => {
            const candidate = input.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
            const host = site.host.replace(/^www\./, "");
            return candidate === site.title.toLowerCase() || candidate === host || candidate.startsWith(host + "/");
        });
        visit(match < 0 ? 0 : match, match < 0 ? input : "");
    }

    function openTask(entry, navigateToSource = true) {
        setComparePanel(false);
        selectTask(entry.id);
        setAgentView(["planning", "needs-review"].includes(entry.status) ? "Plan" : "Steps");
        setFollowup("");
        setTaskAction(null);
        showAgent(true);
        if (navigateToSource) visit(entry.source);
    }

    function addTask(next, navigateToSource = false) {
        setState((current) => ({ ...current, tasks: [next, ...current.tasks] }));
        setPrompt("");
        openTask(next, navigateToSource);
    }

    function runTask(value) {
        if (!value.trim()) return;
        addTask(createAgentTask(value.trim(), { model: state.model, matchedSkills: state.model === "Pro" ? state.enabledSkills.length : 0 }));
    }

    function selectWalkthrough(example) {
        const { title, status, progress } = example;
        const next = createAgentTask(title, {
            status, progress, model: state.model,
            planState: example.planState ?? (status === "needs-review" ? "pending" : status === "cancelled" ? "cancelled" : "confirmed"),
            error: status === "failed" ? "The sample source stopped responding." : undefined,
        });
        addTask(next, activeStatuses.includes(status) && status !== "needs-review");
        if (example.planState === "expired") setAgentView("Plan");
    }

    function changeTask(changes) {
        setState((current) => ({
            ...current,
            tasks: current.tasks.map((entry) => entry.id === task.id
                ? { ...entry, ...(typeof changes === "function" ? changes(entry) : changes), updatedAt: Date.now() } : entry),
        }));
    }

    function approvePlan() {
        changeTask({ status: "running", progress: 0, planState: "confirmed", todoOverrides: {} });
        visit(task.source);
        setAgentView("Steps");
    }

    function restartTask(note) {
        changeTask((entry) => ({
            status: "planning", progress: 0, planState: "pending", todoOverrides: {}, error: undefined,
            planRevision: note ? undefined : entry.planRevision,
            notes: note ? [...entry.notes, note] : entry.notes,
        }));
        setAgentView("Plan");
        setTaskAction(null);
    }

    function openAgentHome(view = "Chat") {
        setComparePanel(false);
        selectTask(null);
        setAgentView(view);
        showAgent(true);
    }

    function askCanvas(value, source) {
        const title = value.trim() || "Research notes";
        const flow = { kind: "canvas", title, address: "flowith://canvas/" + crypto.randomUUID(), source };
        setState((current) => ({ ...current, flows: [flow, ...current.flows] }));
        openPage(flow);
        setPrompt("");
    }

    function saveResearchFlow(brief, sources) {
        const flow = { kind: "canvas", title: brief.title, address: "flowith://canvas/" + crypto.randomUUID(), brief, sources };
        setState((current) => ({ ...current, flows: [flow, ...current.flows] }));
        return flow;
    }

    function saveComparedFlow(brief, sources) {
        openPage(saveResearchFlow(brief, sources), true);
        setComparePanel(false);
        showAgent(false);
    }

    function openCanvasSource(source) {
        if (!source) return;
        const same = tabs.find((entry) => {
            const activePage = entry.pages[entry.index];
            return activePage.kind === source.kind && activePage.address === source.address && (!source.liveId || activePage.liveId === source.liveId);
        });
        if (same) setActive(same.id);
        else openPage(source, true);
    }

    function openResearchChat() {
        setComparePanel(false);
        setAgentView("Chat");
        showAgent(true);
    }

    function openSettings() {
        openPage({ kind: "settings", title: "Settings", address: "flowith://settings" });
        setModal(null);
    }

    function openLibrary(name) {
        if (page.library !== name) openPage({ kind: "library", title: libraryPages[name].title, library: name, address: "flowith://library/" + libraryPages[name].key });
        setModal(null);
    }

    function previewReport(entry) {
        openPage({ kind: "report", title: "research-brief.md", address: "flowith://files/" + entry.id, taskId: entry.id });
    }

    function saveMarkdown(title, body) {
        const url = URL.createObjectURL(new Blob([body], { type: "text/markdown" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = title;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function downloadReport(entry) {
        const item = { id: entry.id, title: "research-brief.md", status: "Completed", body: taskReport(entry) };
        saveMarkdown(item.title, item.body);
        setState((current) => ({ ...current, downloads: [item, ...current.downloads.filter((record) => record.id !== item.id)] }));
    }

    function toggleBookmark() {
        if (!page.address) return;
        update("bookmarks", bookmarked ? state.bookmarks.filter((entry) => entry.address !== page.address) : [...state.bookmarks, page]);
    }

    function choosePreset(preset) {
        if (page.kind !== "home") openPage(home);
        setPrompt(preset[1]);
        setModal(null);
        requestAnimationFrame(() => promptRef.current?.focus());
    }

    function shortcuts(event) {
        if (!(event.metaKey || event.ctrlKey)) return;
        const key = event.key.toLowerCase();
        if (!["l", "t", "w", "k", "enter"].includes(key)) return;
        event.preventDefault();
        if (key === "l") addressRef.current?.select();
        if (key === "t") openPage(home, true);
        if (key === "w") closeTab(tab.id);
        if (key === "k") setModal("Command Palette");
        if (key === "enter" && page.kind === "home") runTask(prompt);
    }

    return (
        <div className="app" onKeyDown={(event) => { if (event.key === "Escape") setTabMenu(null); shortcuts(event); }} onClick={() => setTabMenu(null)}>
            <header className="toolbar">
                <div className="traffic-space" />
                <IconButton label="Toggle sidebar" icon={PanelLeft} onClick={() => setSidebar(!sidebar)} />
                <div className="navigation">
                    <IconButton label="Back" icon={ArrowLeft} disabled={!tab.index && !browsing.canBack} onClick={() => navigateHistory(-1)} />
                    <IconButton label="Forward" icon={ArrowRight} disabled={tab.index === tab.pages.length - 1 && !browsing.canForward} onClick={() => navigateHistory(1)} />
                    <IconButton label={isLive ? "Reload page" : "Reset address"} icon={RefreshCw} onClick={() => isLive ? reloadLive() : setAddress(page.address)} />
                    <IconButton label="Home" icon={Home} onClick={() => openPage(home)} />
                </div>
                <form className="omnibox" onSubmit={(event) => { event.preventDefault(); navigate(address); addressRef.current.blur(); }}>
                    {page.kind === "home" ? <Search size={15} /> : <Globe2 size={15} />}
                    <input ref={addressRef} aria-label="Search or enter an address" value={address} placeholder="Search or enter an address" onChange={(event) => setAddress(event.target.value)} />
                    <IconButton label={bookmarked ? "Remove bookmark" : "Bookmark page"} icon={Bookmark} aria-pressed={bookmarked} disabled={!page.address} onClick={toggleBookmark} />
                </form>
                {window.liveBrowser && <button className="browser-mode" aria-pressed={liveMode || isLive} onClick={() => {
                    if (isLive) { setLiveMode(false); openPage(home); }
                    else { setLiveMode(!liveMode); addressRef.current?.focus(); }
                }}>{liveMode || isLive ? "Live web" : "Sample web"}</button>}
                <button className="browser-mode" aria-pressed={agent && comparePanel} onClick={() => {
                    setComparePanel(!agent || !comparePanel);
                    showAgent(!agent || !comparePanel);
                }}>Compare tabs</button>
                <IconButton label="Toggle agent panel" icon={PanelRight} aria-pressed={agent} onClick={() => showAgent(!agent)} />
                <IconButton label="Browser menu" icon={Menu} onClick={() => setModal("Menu")} />
            </header>
            <div className="workspace">
                {sidebar && (
                    <aside className="sidebar">
                        <div className="wordmark"><Orb small /> flowithOS</div>
                        <div className="sidebar-actions">
                            <button onClick={() => openPage(home, true)}><Plus size={16} /> New Tab <kbd>⌘ T</kbd></button>
                            <button onClick={() => setModal("Task History")}><History size={15} /> Task History</button>
                            <button onClick={() => openLibrary("Bookmarks")}><Bookmark size={15} /> Bookmarks</button>
                            <button onClick={() => openLibrary("Flows")}><LayoutPanelLeft size={15} /> Flows</button>
                            <button onClick={() => openLibrary("Browsing History")}><History size={15} /> History</button>
                            <button onClick={() => openLibrary("Downloads")}><FolderOpen size={15} /> Downloads</button>
                        </div>
                        <div className="tab-list">
                            {tabs.map((entry) => (
                                <div className="tab" key={entry.id} data-active={entry.id === tab.id} onContextMenu={(event) => { event.preventDefault(); setTabMenu({ x: event.clientX, y: event.clientY, entry }); }}>
                                    <button onClick={() => setActive(entry.id)} aria-current={entry.id === tab.id ? "page" : undefined}>
                                        {entry.pages[entry.index].kind === "home" ? <Home size={14} /> : <Globe2 size={14} />}
                                        <span>{entry.pages[entry.index].title}</span>
                                    </button>
                                    <IconButton label={"Close tab " + entry.pages[entry.index].title} icon={X} onClick={() => closeTab(entry.id)} />
                                </div>
                            ))}
                        </div>
                        <div className="sidebar-bottom">
                            <IconButton label="Settings" icon={Settings} onClick={openSettings} />
                            <button className="profile" onClick={() => setModal("Local Workspace")}><span>G</span> Local Workspace</button>
                        </div>
                    </aside>
                )}
                <main className={"surface " + (page.kind === "home" ? "home " + state.theme.toLowerCase() : page.kind)} data-chat-dock={!agent}>
                    {page.kind === "home" && (
                        <div className="home-inner">
                            <div className="greeting"><h1><Orb /> OS is awake</h1></div>
                            <p className="subtitle">With an active memory that evolves with every action to understand you better.</p>
                            <div className="prompt">
                                <textarea ref={promptRef} aria-label="Task or search prompt" placeholder="Navigate, search, or let Neo take over..." value={prompt} onChange={(event) => setPrompt(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
                                            event.preventDefault();
                                            navigate(prompt);
                                        }
                                    }} />
                                <IconButton label="Search for prompt" icon={ArrowUp} disabled={!prompt.trim()} onClick={() => navigate(prompt)} />
                            </div>
                            {prompt.trim() && <div className="prompt-menu">
                                <button onClick={() => navigate(prompt)}><Search size={15} /> <strong>Search on Google</strong><span>{prompt}</span></button>
                                <div className="run-row"><button onClick={() => runTask(prompt)}><Orb small /> <strong>Run task</strong><kbd>⌘ ↵</kbd></button>
                                    <select aria-label="Agent model" value={state.model} onChange={(event) => update("model", event.target.value)}><option>Pro</option><option>Fast</option></select>
                                </div>
                                <button onClick={() => askCanvas(prompt)}><LayoutPanelLeft size={15} /> <strong>Ask in Canvas</strong><span>{prompt}</span></button>
                            </div>}
                            <section className="home-section">
                                <div className="section-head"><h2>Recent Task</h2><IconButton label="Open task history" icon={History} onClick={() => setModal("Task History")} /></div>
                                <div className="recent-grid">
                                    {state.tasks.slice(0, 2).map((entry) => <button key={entry.id} onClick={() => openTask(entry)}>
                                        {entry.status === "done" ? <CheckCircle2 className="complete" size={17} /> : <Circle size={17} />}<span>{entry.title}</span>
                                    </button>)}
                                </div>
                            </section>
                            <section className="home-section">
                                <div className="section-head spread"><h2>Task Preset</h2><div>
                                    <IconButton label="Previous presets" icon={ChevronLeft} disabled={!presetPage} onClick={() => setPresetPage(0)} />
                                    <IconButton label="Next presets" icon={ChevronRight} disabled={!!presetPage} onClick={() => setPresetPage(1)} />
                                </div></div>
                                <div className="presets">{presets.slice(presetPage * 4, presetPage * 4 + 4).map((preset) => <button key={preset[0]} onClick={() => choosePreset(preset)}><strong>{preset[0]}</strong><span>{preset[1]}</span></button>)}</div>
                            </section>
                            <section className="home-section">
                                <div className="section-head"><h2>Frequent Visit</h2></div>
                                <div className="sites">{sites.map((site, index) => <button key={site.host} aria-label={site.title} onClick={() => visit(index)}><SiteMark site={site} />{site.title}</button>)}</div>
                            </section>
                        </div>
                    )}
                    {page.kind === "settings" && <BrowserSettings state={state} update={update} openLibrary={openLibrary} />}
                    {page.kind === "library" && <Library key={page.library} name={page.library} state={state} update={update} openPage={openPage} newFlow={() => askCanvas("")} download={(item) => saveMarkdown(item.title, item.body ?? "# Research brief\n\nLocal sample download.")} />}
                    {isLive && <LiveSurface page={page} hidden={!!modal || !!tabMenu} error={browsing.error} reload={reloadLive} />}
                    {page.kind === "site" && <SitePage page={page} visit={visit} openPage={openPage} />}
                    {page.kind === "article" && <article className="document"><p className="sample-label">Sample article · {sites[page.site].title}</p><h1>{page.title}</h1><p>{page.summary}</p><p>This fictional entry is available offline for the walkthrough.</p><div className="article-actions"><button className="soft" onClick={() => stepHistory(-1)}>Back to results</button><button className="soft" onClick={() => askCanvas(page.title, page)}>Send to Canvas</button></div></article>}
                    {page.kind === "report" && (() => {
                        const entry = state.tasks.find((item) => item.id === page.taskId);
                        return <article className="document"><div className="section-head spread"><span className="sample-label">Markdown preview</span><IconButton label="Download Markdown" icon={ArrowDownToLine} onClick={() => downloadReport(entry)} /></div>
                            {taskReport(entry).split("\n\n").map((part, index) => part.startsWith("## ") ? <h2 key={index}>{part.slice(3)}</h2> : part.startsWith("# ") ? <h1 key={index}>{part.slice(2)}</h1> : <p key={index}>{part}</p>)}</article>;
                    })()}
                    {page.kind === "canvas" && <Canvas key={page.address} page={page} openSource={openCanvasSource} saveMarkdown={saveMarkdown} cards={state.canvasCards[page.address] ?? []} setCards={(cards) => update("canvasCards", { ...state.canvasCards, [page.address]: cards })} zoom={zoom} setZoom={setZoom} />}
                    {page.kind === "home" && <div className="color-picker" aria-label="Home colors">{["Mist", "Ocean", "Dusk"].map((theme) => <button key={theme} title={theme} aria-label={theme} aria-pressed={state.theme === theme} className={theme.toLowerCase()} onClick={() => update("theme", theme)} />)}</div>}
                    {!agent && <div className="research-dock" ref={setChatDock} />}
                </main>
                {agent && comparePanel && <aside className="agent">
                    <div className="agent-header"><span className="working"><Orb small /> Pi · Live web</span><IconButton label="Close comparison" icon={X} onClick={() => { setComparePanel(false); showAgent(false); }} /></div>
                    <div className="agent-content"><CompareTabs tabs={tabs} onShowTab={setActive} onSave={saveComparedFlow} /></div>
                </aside>}
                <aside className="agent" hidden={!agent || comparePanel}>
                    <div className="agent-header">
                        {task ? <AgentTaskStatus status={task.status} /> : <span className="working"><Orb small /> OS Agent</span>}
                        <div><IconButton label="New task" icon={Plus} onClick={() => openAgentHome()} /><IconButton label="Task history" icon={History} onClick={() => setModal("Task History")} /><IconButton label="Close agent panel" icon={X} onClick={() => showAgent(false)} /></div>
                    </div>
                    {task && <div className="agent-title">{task.title}<span className="agent-mode-tag">{task.model ?? "Pro"}</span></div>}
                    <div className="agent-tabs">{(task ? ["Chat", "Steps", "Plan", "To-dos", "Files", "Skills"] : ["Chat", "Presets", "Skills", "Examples"]).map((name) => <button key={name} aria-pressed={agentView === name} onClick={() => { setAgentView(name); setTaskAction(null); }}>{name}{task && name === "Steps" ? " (" + task.progress + ")" : ""}</button>)}</div>
                    <div className="agent-content" data-chat={agentView === "Chat"}>
                        <div className="research-view" hidden={agentView !== "Chat"}><ResearchChat tabs={tabs}
                            onShowTab={setActive} onSave={saveResearchFlow} onOpenFlow={(flow) => openPage(flow, true)}
                            onRestore={(address) => openPage({ kind: "live", title: address, address }, true)}
                            collapsed={!agent} dock={chatDock} onExpand={openResearchChat} /></div>
                        {agentView === "Skills" && <AgentSkills enabled={state.enabledSkills} onToggle={(id) => setState((current) => ({
                            ...current, enabledSkills: current.enabledSkills.includes(id) ? current.enabledSkills.filter((skill) => skill !== id) : [...current.enabledSkills, id],
                        }))} onUse={runTask} />}
                        {!task && agentView === "Presets" && <><h2>Task presets</h2>{presets.map((preset) => <div className="preset-row" key={preset[0]}><button onClick={() => runTask(preset[1])}>{preset[0]}</button><IconButton label={"Favorite " + preset[0]} icon={Bookmark} aria-pressed={state.favorites.includes(preset[0])} onClick={() => update("favorites", state.favorites.includes(preset[0]) ? state.favorites.filter((name) => name !== preset[0]) : [...state.favorites, preset[0]])} /></div>)}</>}
                        {!task && agentView === "Examples" && <>
                            <h2>Sample task states</h2><p className="muted">Open an example at a specific point in the task.</p>
                            {walkthroughs.map((example) => <button className="agent-example" key={example.id} onClick={() => selectWalkthrough(example)}><span><strong>{example.label}</strong><small>{example.title}</small></span><ChevronRight size={15} /></button>)}
                        </>}
                        {task && agentView === "Plan" && (task.status === "planning"
                            ? <p className="agent-notice" role="status">{task.matchedSkills ? "Checking " + task.matchedSkills + " selected skills. " : ""}Preparing a sample plan.</p>
                            : <AgentPlan key={task.id} task={{ ...task, planState: task.planState ?? (task.status === "needs-review" ? "pending" : "confirmed") }}
                                onApprove={approvePlan} onReject={() => { changeTask({ status: "cancelled", planState: "cancelled" }); setTaskAction(null); }}
                                onRevise={(planRevision) => changeTask({ planRevision })} />)}
                        {task?.planState === "expired" && agentView === "Plan" && <button className="soft" onClick={() => restartTask()}>Request a new plan</button>}
                        {task && agentView === "To-dos" && <AgentTodos key={task.id} task={task} onToggle={(index) => changeTask((entry) => ({
                            todoOverrides: { ...entry.todoOverrides, [index]: !(entry.todoOverrides?.[index] ?? index < entry.progress) },
                        }))} />}
                        {task && agentView === "Steps" && <>
                            {task.status === "planning" && <p className="agent-notice">Neo is thinking…</p>}
                            {task.status === "needs-review" && <div className="agent-notice"><p>Waiting for plan confirmation.</p><button className="soft" onClick={() => setAgentView("Plan")}>Review plan</button></div>}
                            {task.status === "failed" && <div className="agent-notice" data-tone="error"><p>{task.error ?? "The sample task could not finish."}</p><button className="soft" onClick={() => restartTask()}>Retry task</button></div>}
                            {task.status === "cancelled" && <div className="agent-notice"><p>This task was cancelled. Its activity is still available.</p><button className="soft" onClick={() => restartTask()}>Rerun task</button></div>}
                            {task.status === "archived" && <div className="agent-notice"><p>This task is archived.</p><button className="soft" onClick={() => changeTask({ status: "paused" })}>Restore task</button></div>}
                            {task.status === "wrapping" && <p className="agent-notice">Neo is wrapping up. The sample file will appear in Files.</p>}
                            <ol className="steps">{taskSteps.map(([title, description], index) => (index < task.progress || (index === task.progress && activeStatuses.includes(task.status) && task.status !== "needs-review")) && <li key={index} data-current={index === task.progress}>
                                <strong>{title}</strong><p>{description}</p>
                                {index === 1 && <button className="soft" onClick={() => visit(task.source)}><Globe2 size={13} />{sites[task.source].host}</button>}
                                {index === taskSteps.length - 1 && task.status === "done" && <button className="soft" onClick={() => previewReport(task)}><FileText size={13} /> research-brief.md</button>}
                            </li>)}</ol>
                            {task.notes.map((note, index) => <p className="note" key={index}>You: {note}</p>)}
                            {task.status === "done" && <div className="agent-result"><strong>Research brief ready</strong><p>Review the sample findings and export the Markdown file.</p><button className="soft" onClick={() => previewReport(task)}>Open result <ArrowRight size={13} /></button></div>}
                        </>}
                        {task && agentView === "Files" && (task.status === "done"
                            ? <div className="preset-row"><button onClick={() => previewReport(task)}><FileText size={15} /> research-brief.md</button><IconButton label="Download report" icon={ArrowDownToLine} onClick={() => downloadReport(task)} /></div>
                            : <p className="muted">No files yet.</p>)}
                    </div>
                    {task && !["Skills", "Chat"].includes(agentView) && <div className="agent-footer">
                        {taskAction === "cancel" ? <div className="agent-notice"><p>Cancel this sample task?</p><button className="soft" onClick={() => setTaskAction(null)}>Keep task</button><button className="soft" onClick={() => {
                            changeTask({ status: "cancelled", planState: ["planning", "needs-review"].includes(task.status) ? "cancelled" : task.planState });
                            setTaskAction(null);
                            setAgentView("Steps");
                        }}>Cancel task</button></div> : <div className="agent-run-controls">
                            {task.status === "running" && <button className="soft" onClick={() => changeTask({ status: "paused", resumeStatus: "running" })}><Square size={13} /> Pause task</button>}
                            {task.status === "paused" && <><button className="soft" onClick={() => { changeTask({ status: task.resumeStatus ?? "running" }); setAgentView("Steps"); }}><Play size={13} /> Resume task</button><button className="soft" onClick={() => changeTask({ status: "archived" })}>Pause &amp; Archive</button></>}
                            {activeStatuses.includes(task.status) && task.status !== "wrapping" && <button className="soft" onClick={() => setTaskAction("cancel")}>Cancel…</button>}
                        </div>}
                        {agentView === "Steps" && (task.status === "done" || task.status === "paused" || task.status === "running") && <form className="followup" onSubmit={(event) => { event.preventDefault(); if (!followup.trim()) return; restartTask(followup.trim()); setFollowup(""); }}>
                            <textarea aria-label="Follow-up message" placeholder="Send a new message to adjust Neo’s task..." value={followup} onChange={(event) => setFollowup(event.target.value)} />
                            <div><button className="icon-button" aria-label="Send follow-up" disabled={!followup.trim()}><ArrowUp size={16} /></button></div>
                        </form>}
                    </div>}
                </aside>
            </div>
            {tabMenu && <div className="tab-menu" style={{ left: Math.min(tabMenu.x, window.innerWidth - 210), top: Math.min(tabMenu.y, window.innerHeight - 124) }}>
                <button onClick={() => openPage(tabMenu.entry.pages[tabMenu.entry.index], true)}>Duplicate tab</button>
                <button onClick={() => closeTab(tabMenu.entry.id)}>Close tab</button>
                <button onClick={() => {
                    const retained = tabs.filter((entry) => entry.id === tabMenu.entry.id || (running && entry.pages[entry.index].site === task?.source));
                    setTabs(retained);
                    setActive(tabMenu.entry.id);
                }}>Close other tabs</button>
            </div>}
            <dialog ref={dialogRef} onClose={() => setModal(null)} onClick={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
                {modal && <div className="dialog-content">
                    <div className="section-head spread"><h2>{modal}</h2><IconButton label="Close dialog" icon={X} onClick={() => setModal(null)} /></div>
                    {modal === "Menu" && ["Task History", "Browsing History", "Downloads", "Bookmarks", "Flows", "Command Palette", "Settings", "Local Workspace"].map((name) => <button key={name} className="dialog-row" onClick={() => libraryPages[name] ? openLibrary(name) : name === "Settings" ? openSettings() : setModal(name)}>{name}<ChevronRight size={15} /></button>)}
                    {modal === "Task History" && <TaskHistory tasks={state.tasks} onOpen={(entry) => { openTask(entry); setModal(null); }} onExamples={() => { openAgentHome("Examples"); setModal(null); }} />}
                    {modal === "Command Palette" && <CommandPalette actions={[
                        ["New tab", () => openPage(home, true)], ["New flow", () => askCanvas("")],
                        ["Toggle agent panel", () => showAgent(!agent)],
                        ...Object.keys(libraryPages).map((name) => [name, () => openLibrary(name)]),
                    ]} close={() => setModal(null)} />}
                    {modal === "Local Workspace" && <><p className="muted">This independent demo runs offline. Browsing and agent tasks use simulated data.</p><h3>Saved presets</h3>{state.favorites.length ? presets.filter(([name]) => state.favorites.includes(name)).map((preset) => <button key={preset[0]} className="dialog-row" onClick={() => choosePreset(preset)}>{preset[0]}<ChevronRight size={15} /></button>) : <p className="muted">Save presets from the OS Agent panel.</p>}</>}
                </div>}
            </dialog>
        </div>
    );
}

function TaskHistory({ tasks, onOpen, onExamples }) {
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("All tasks");
    const matches = tasks.filter((entry) => entry.title.toLowerCase().includes(query.trim().toLowerCase()) &&
        (filter === "Archived" ? entry.status === "archived" : entry.status !== "archived" &&
            (filter === "All tasks" || (filter === "Active" ? activeStatuses.includes(entry.status) : terminalStatuses.includes(entry.status)))));
    return <>
        <div className="agent-history-controls">
            <input className="palette-input" aria-label="Search tasks" placeholder="Search tasks…" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select aria-label="Task history filter" value={filter} onChange={(event) => setFilter(event.target.value)}>{["All tasks", "Active", "Finished", "Archived"].map((name) => <option key={name}>{name}</option>)}</select>
        </div>
        {!matches.length && <p className="muted">No matching tasks.</p>}
        {matches.map((entry) => <button key={entry.id} className="dialog-row" onClick={() => onOpen(entry)}>{entry.title}<AgentTaskStatus status={entry.status} /></button>)}
        <button className="soft" onClick={onExamples}>Browse sample task states</button>
    </>;
}

function BrowserSettings({ state, update, openLibrary }) {
    const [section, setSection] = useState("General");
    const sections = ["General", "History", "Downloads", "Intelligent Settings", "Language", "Permissions", "Software Update"];
    return <section className="library browser-settings">
        <header className="library-head"><Settings size={25} /><div><h1>Settings</h1><p>Manage this local browser workspace</p></div></header>
        <div className="settings-layout">
            <nav aria-label="Settings sections">{sections.map((item) => <button key={item} aria-current={section === item ? "page" : undefined} onClick={() => setSection(item)}>{item}</button>)}</nav>
            <div className="settings-detail">
                <h2>{section}</h2>
                {section === "General" && <label className="dialog-row">Home appearance<select value={state.theme} onChange={(event) => update("theme", event.target.value)}>{["Mist", "Ocean", "Dusk"].map((theme) => <option key={theme}>{theme}</option>)}</select></label>}
                {section === "Intelligent Settings" && <label className="dialog-row">Agent mode<select value={state.model} onChange={(event) => update("model", event.target.value)}><option>Pro</option><option>Fast</option></select></label>}
                {section === "History" && <button className="soft" onClick={() => openLibrary("Browsing History")}>Manage browsing history <ArrowRight size={14} /></button>}
                {section === "Downloads" && <button className="soft" onClick={() => openLibrary("Downloads")}>Manage downloads <ArrowRight size={14} /></button>}
                {section === "Language" && <p className="muted">The local sample interface is available in English.</p>}
                {section === "Permissions" && <p className="muted">The app interface blocks network requests. Live web pages run in a separate profile with device permissions disabled.</p>}
                {section === "Software Update" && <p className="muted">Local demo 1.0.0. Vendor updates are unavailable in this build.</p>}
            </div>
        </div>
    </section>;
}

function CommandPalette({ actions, close }) {
    const [query, setQuery] = useState("");
    const matches = actions.filter(([name]) => name.toLowerCase().includes(query.toLowerCase()));
    return <form onSubmit={(event) => { event.preventDefault(); if (matches.length) { close(); matches[0][1](); } }}>
        <input className="palette-input" aria-label="Search commands" placeholder="Search commands…" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
        {!matches.length && <p className="muted">No matching commands</p>}
        {matches.map(([name, action]) => <button type="button" className="dialog-row" key={name} onClick={() => { close(); action(); }}>{name}</button>)}
    </form>;
}

function SitePage({ page, visit, openPage }) {
    const site = sites[page.site];
    const words = page.query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
    const entries = siteEntries[page.site].map(([title, summary], index) => ({ title, summary, index }));
    const matches = words.length ? entries.filter(({ title, summary }) => words.some((word) => (title + " " + summary).toLowerCase().includes(word))) : entries;
    const [query, setQuery] = useState(page.query);
    useEffect(() => setQuery(page.query), [page]);
    return (
        <div className={"sample-site site-" + page.site}>
            <div className="site-banner"><SiteMark site={site} /><strong>{site.title}</strong><span>Offline preview</span></div>
            <article className="document">
                <h1>{page.query ? "Results for " + page.query : page.site === 1 ? "Top stories" : site.title}</h1>
                <form className="site-search" onSubmit={(event) => { event.preventDefault(); visit(page.site, query.trim()); }}>
                    <input aria-label="Search sample pages" placeholder="Search sample pages" value={query} onChange={(event) => setQuery(event.target.value)} /><button className="soft">Search</button>
                </form>
                <p className="sample-label">Illustrative results from the local library</p>
                {!matches.length && <p className="muted">No sample results. Try another search.</p>}
                <ol className="stories">{matches.map(({ title, summary, index }) => <li key={title}><button onClick={() => openPage({ kind: "article", site: page.site, title, summary, address: "https://" + site.host + "/sample/" + (index + 1) })}>{title}</button><p>{summary}</p></li>)}</ol>
            </article>
        </div>
    );
}

function Canvas({ page, cards, setCards, zoom, setZoom, openSource, saveMarkdown }) {
    const [inspected, setInspected] = useState(null);
    const [draft, setDraft] = useState("");
    const [flowMode, setFlowMode] = useState(true);
    const notes = cards.map((card, index) => typeof card === "string" ? { id: "old-" + index, kind: "Note", text: card } : card);
    const baseNodes = [
        { id: "prompt", kind: "Prompt", text: page.title },
        { id: "sources", kind: "Online Search", text: page.sources ? page.sources.length + " sources supplied the evidence for this research." : page.source?.summary ?? "Example sources collected for this workflow." },
        { id: "brief", kind: "Gen Document", text: page.brief ? page.brief.findings.map((finding) => finding.text + " " + finding.sources.map((id) => "[" + id + "]").join(" ")).join("\n\n") : "Collect sources, group related ideas, and draft a brief. Add a branch to pursue a different angle." },
    ];
    const nodes = [...baseNodes, ...notes];
    const current = nodes.find((node) => node.id === inspected);
    const sampleSources = page.sources ?? (page.source ? [page.source] : [
        { title: "arXiv", address: "https://arxiv.org" },
        { title: "Hacker News", address: "https://news.ycombinator.com" },
    ]);

    function addBranch(text = "") {
        const entry = { id: crypto.randomUUID(), kind: "Note", text, parent: current?.id ?? "brief" };
        setCards([...notes, entry]);
        setInspected(entry.id);
    }

    return <div className="canvas-shell">
        <header className="flow-header"><LayoutPanelLeft size={16} /><strong>{page.title}</strong><span>Local flow</span>
            <button className="soft" onClick={() => saveMarkdown("flow-notes.md", nodes.map((node) => "## " + node.kind + "\n\n" + node.text).join("\n\n") + (page.sources ? "\n\n## Sources\n" + page.sources.map((source, index) => "[" + (index + 1) + "] " + source.address).join("\n") : ""))}><ArrowDownToLine size={14} /> Export</button>
        </header>
        <div className="canvas-body">
            <div className="canvas-main">
                <div className="canvas-toolbar"><IconButton label="Add canvas note" icon={Plus} onClick={() => addBranch()} />
                    <IconButton label="Zoom out" icon={Minus} disabled={zoom <= 60} onClick={() => setZoom(zoom - 10)} />
                    <button className="zoom-reset" onClick={() => setZoom(100)} aria-label="Reset canvas zoom">{zoom}%</button>
                    <IconButton label="Zoom in" icon={Plus} disabled={zoom >= 140} onClick={() => setZoom(zoom + 10)} />
                    <button className="mode-toggle" aria-pressed={flowMode} onClick={() => setFlowMode(!flowMode)}>{flowMode ? "Flo mode" : "Outline"}</button>
                </div>
                <div className="canvas-scroll"><div className={flowMode ? "flow-nodes" : "flow-nodes outline"} style={{ zoom: zoom + "%" }}>
                    {baseNodes.map((node, index) => <React.Fragment key={node.id}>
                        {index > 0 && <div className="connector" />}
                        <button className={"node flow-node" + (node.id === "prompt" ? " primary-node" : "")} aria-pressed={inspected === node.id} onClick={() => setInspected(node.id)}>
                            <span className="node-kind">{node.id === "prompt" ? <Orb small /> : node.id === "sources" ? <Search size={14} /> : <FileText size={14} />}{node.kind}</span>
                            <span>{node.text}</span>
                        </button>
                    </React.Fragment>)}
                    {notes.length > 0 && <div className="connector" />}
                    <div className="note-grid">{notes.map((note, index) => <button className="node flow-node" key={note.id} aria-pressed={inspected === note.id} onClick={() => setInspected(note.id)}>
                        <span className="node-kind"><FileText size={14} /> Note {index + 1}</span><span>{note.text || "Untitled note"}</span>
                        <small>From {nodes.find((node) => node.id === note.parent)?.kind ?? "Gen Document"}</small>
                    </button>)}</div>
                </div></div>
                <form className="canvas-composer" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) { addBranch(draft.trim()); setDraft(""); } }}>
                    <input aria-label="Canvas branch prompt" placeholder="Continue this flow…" value={draft} onChange={(event) => setDraft(event.target.value)} />
                    <button className="icon-button" aria-label="Create branch" disabled={!draft.trim()}><ArrowUp size={16} /></button>
                </form>
            </div>
            {current && <aside className="canvas-inspector">
                <div className="section-head spread"><h2>{current.kind}</h2><IconButton label="Close node details" icon={X} onClick={() => setInspected(null)} /></div>
                {current.kind === "Note" ? <textarea aria-label="Canvas note" value={current.text} onChange={(event) => setCards(notes.map((node) => node.id === current.id ? { ...node, text: event.target.value } : node))} />
                    : current.id === "brief" && page.brief ? <ol className="cited-findings">{page.brief.findings.map((finding, index) => <li key={index}>
                        {finding.text} {finding.sources.map((id) => <button key={id} className="citation" aria-label={"Open source " + id + ": " + page.sources[id - 1].title} onClick={() => openSource(page.sources[id - 1])}>[{id}]</button>)}
                    </li>)}</ol> : <p>{current.text}</p>}
                {current.kind === "Online Search" && <div className="canvas-sources"><h3>Sources</h3>{sampleSources.map((source, index) => <div key={index}><strong>{page.sources ? "[" + (index + 1) + "] " : ""}{source.title}</strong><small>{source.address}</small>
                    {(page.sources || page.source) && <button className="soft" onClick={() => openSource(source)}>{page.sources ? "Open source " + (index + 1) : "Open source tab"} <ArrowRight size={14} /></button>}</div>)}</div>}
                <button className="soft" onClick={() => addBranch()}><Plus size={14} /> Add branch</button>
                {current.kind === "Note" && <button className="soft" onClick={() => {
                    setCards(notes.filter((node) => node.id !== current.id).map((node) => node.parent === current.id ? { ...node, parent: current.parent } : node));
                    setInspected(null);
                }}>Delete note</button>}
            </aside>}
        </div>
    </div>;
}

createRoot(document.getElementById("root")).render(<App />);
