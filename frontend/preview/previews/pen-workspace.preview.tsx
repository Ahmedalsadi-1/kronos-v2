// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import {
    ArrowDownToLine,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    Bot,
    Check,
    ChevronDown,
    Clock,
    Code2,
    Eye,
    EyeOff,
    FileText,
    GitPullRequest,
    Globe,
    GripHorizontal,
    LayoutGrid,
    Maximize2,
    MessageCircle,
    MessageSquare,
    Mic,
    MoreHorizontal,
    PanelLeft,
    PanelRight,
    Paperclip,
    Plus,
    Puzzle,
    RefreshCw,
    Search,
    Settings,
    SlidersHorizontal,
    Sparkles,
    Terminal,
    Workflow,
    X,
} from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { PenNativeIsland } from "./pen-native-island.preview";
import "./pen-workspace.preview.css";

const Sections = [
    { label: "Capabilities", icon: Sparkles, items: ["Workspace tools", "Installed skills", "Connected apps"] },
    { label: "Messaging", icon: MessageCircle, items: ["Telegram", "Connected channels"] },
    { label: "Artifacts", icon: FileText, items: ["Workspace notes.md", "Dashboard.html", "Research brief"] },
    { label: "Workflows", icon: Workflow, items: ["Research and summarize", "Review workspace changes"] },
    { label: "Scheduled jobs", icon: Clock, items: ["Morning briefing", "Weekly project review"] },
    { label: "Bot mode", icon: Bot, items: ["Hermes", "KronOS Side Agent"] },
    { label: "Project rooms", icon: LayoutGrid, items: ["KronOS", "Launch research", "Personal"] },
];
const Prompts = [
    "Design a control panel for a humanoid robotics factory floor",
    "Design a retro-futuristic landing page for a private space tourism company",
    "Plan a trip along the Pacific Coast Highway in California",
    "Design a soft neumorphic meditation app inspired by Nordic winters",
    "Design an elegant reservation app for a Michelin-star sushi omakase",
    "Design a cozy mobile app for tracking houseplants and watering schedules",
];
const Models = ["Hermes", "KronOS Side Agent (Pi)"];
type WorkspaceTab = { id: number; title: string; kind: "browser" | "terminal" };
type Message = { role: "user" | "assistant"; text: string };
type Popup = { title: string; x: number; y: number };

export function PenWorkspacePreview() {
    const [sidebar, setSidebar] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(272);
    const [mode, setMode] = useState<"regular" | "floating" | "split">("regular");
    const [chatVisible, setChatVisible] = useState(true);
    const [threadVisible, setThreadVisible] = useState(true);
    const [islandPosition, setIslandPosition] = useState<{ x: number; y: number }>();
    const mainRef = useRef<HTMLElement>(null);
    const islandRef = useRef<HTMLElement>(null);
    const [chatWidth, setChatWidth] = useState(440);
    const [threadHeight, setThreadHeight] = useState(180);
    const [tabs, setTabs] = useState<WorkspaceTab[]>([
        { id: 1, title: "Coffee — Wikipedia", kind: "browser" },
        { id: 2, title: "Terminal", kind: "terminal" },
    ]);
    const [active, setActive] = useState(1);
    const [address, setAddress] = useState("en.wikipedia.org/wiki/Coffee");
    const [query, setQuery] = useState("");
    const [history, setHistory] = useState(["A calmer workspace", "Launch research", "Design a dashboard"]);
    const [selectedChat, setSelectedChat] = useState("A calmer workspace");
    const [messages, setMessages] = useState<Message[]>([]);
    const [draft, setDraft] = useState("");
    const [model, setModel] = useState("Hermes");
    const [popup, setPopup] = useState<Popup>();
    const [panel, setPanel] = useState<string>();
    const [attachments, setAttachments] = useState<string[]>([]);
    const [command, setCommand] = useState("");
    const [terminalLines, setTerminalLines] = useState([
        "KronOS preview terminal",
        "Type help to see sample commands.",
    ]);
    const fileInput = useRef<HTMLInputElement>(null);
    const nextTab = useRef(3);
    const drag = useRef<{
        kind: "sidebar" | "chat" | "move";
        x: number;
        y: number;
        width: number;
        height: number;
        left?: number;
        top?: number;
    }>(undefined);
    const current = tabs.find((tab) => tab.id === active);
    const inlineIslandControls = mode === "floating" && !sidebar && current?.kind === "browser";
    const section = Sections.find(({ label }) => label === panel);
    const addTab = (kind: WorkspaceTab["kind"]) => {
        const id = nextTab.current++;
        setTabs((items) => [...items, { id, kind, title: kind === "terminal" ? "Terminal" : "New browser tab" }]);
        setActive(id);
        if (mode === "regular") setMode("split");
        setPopup(undefined);
    };
    const closeTab = (id: number) => {
        const remaining = tabs.filter((tab) => tab.id !== id);
        setTabs(remaining);
        if (active === id) setActive(remaining[0]?.id);
    };
    const newChat = () => {
        setMessages([]);
        setSelectedChat("New chat");
        setChatVisible(true);
        setDraft("");
    };
    const openPopup = (event: React.MouseEvent<HTMLButtonElement>, title: string) => {
        const box = event.currentTarget.getBoundingClientRect();
        setPopup(
            popup?.title === title
                ? undefined
                : {
                      title,
                      x: Math.max(12, Math.min(window.innerWidth - 260, box.right - 240)),
                      y: Math.max(60, Math.min(window.innerHeight - 260, box.bottom + 8)),
                  }
        );
    };
    const toggleThread = () => {
        if (mode === "floating")
            setIslandPosition(
                (position) =>
                    position && {
                        ...position,
                        y: position.y + (threadVisible ? 1 : -1) * (threadHeight + 24),
                    }
            );
        setThreadVisible(!threadVisible);
    };
    useLayoutEffect(() => {
        if (mode !== "floating" || !mainRef.current || !islandRef.current) return;
        const clamp = () => {
            const main = mainRef.current.getBoundingClientRect();
            const island = islandRef.current.getBoundingClientRect();
            setIslandPosition((position) => {
                if (!position) return position;
                const x = Math.max(8, Math.min(main.width - island.width - 8, position.x));
                const y = Math.max(8, Math.min(main.height - island.height - 8, position.y));
                return x === position.x && y === position.y ? position : { x, y };
            });
        };
        clamp();
        const observer = new ResizeObserver(clamp);
        observer.observe(mainRef.current);
        observer.observe(islandRef.current);
        return () => observer.disconnect();
    }, [mode, chatWidth, threadHeight, threadVisible, sidebar, sidebarWidth]);
    const moveIsland = (x: number, y: number) => {
        const main = mainRef.current?.getBoundingClientRect();
        const island = islandRef.current?.getBoundingClientRect();
        if (!main || !island) return;
        setIslandPosition({
            x: Math.max(8, Math.min(main.width - island.width - 8, x)),
            y: Math.max(8, Math.min(main.height - island.height - 8, y)),
        });
    };
    const moveNativeIsland = (dx: number, dy: number) => {
        const main = mainRef.current?.getBoundingClientRect();
        const island = islandRef.current?.getBoundingClientRect();
        if (main && island) moveIsland(island.x - main.x + dx, island.y - main.y + dy);
    };
    const startResize = (event: PointerEvent<HTMLButtonElement>, kind: "sidebar" | "chat" | "move") => {
        event.preventDefault();
        const island = islandRef.current?.getBoundingClientRect();
        const main = mainRef.current?.getBoundingClientRect();
        drag.current = {
            left: island && main ? island.x - main.x : 0,
            top: island && main ? island.y - main.y : 0,
            kind,
            x: event.screenX,
            y: event.screenY,
            width: kind === "sidebar" ? sidebarWidth : chatWidth,
            height: threadHeight,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const moveResize = (event: PointerEvent<HTMLButtonElement>) => {
        const start = drag.current;
        if (!start) return;
        if (start.kind === "move") {
            moveIsland(start.left + event.screenX - start.x, start.top + event.screenY - start.y);
            return;
        }
        if (start.kind === "sidebar") {
            setSidebarWidth(Math.max(220, Math.min(380, start.width + event.screenX - start.x)));
            return;
        }
        const available = window.innerWidth - (sidebar ? sidebarWidth : 0) - 40;
        setChatWidth(
            Math.max(
                Math.min(280, available),
                Math.min(700, available, start.width + (event.screenX - start.x) * (mode === "floating" ? 2 : 1))
            )
        );
        setThreadHeight(Math.max(120, Math.min(window.innerHeight - 290, start.height + start.y - event.screenY)));
    };
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!draft.trim()) return;
        const text = draft.trim();
        setMessages((items) => [
            ...items,
            { role: "user", text },
            { role: "assistant", text: "Preview response. This conversation demonstrates the layout and scrolling." },
        ]);
        if (selectedChat === "New chat") {
            setHistory((items) => [text.slice(0, 36), ...items]);
            setSelectedChat(text.slice(0, 36));
        }
        setDraft("");
    };
    const navigate = (event: FormEvent) => {
        event.preventDefault();
        setTabs((items) =>
            items.map((tab) =>
                tab.id === active
                    ? { ...tab, title: address.replace(/^https?:\/\//, "").split("/")[0] || "New browser tab" }
                    : tab
            )
        );
    };
    const runCommand = (event: FormEvent) => {
        event.preventDefault();
        const outputs: Record<string, string> = {
            help: "Sample commands: pwd, ls, git status, clear",
            pwd: "/workspace/kronos",
            ls: "frontend/  emain/  integrations/  package.json",
            "git status": "On branch preview\nWorking tree clean (sample)",
        };
        setTerminalLines((items) =>
            command === "clear"
                ? []
                : [...items, "$ " + command, outputs[command] ?? "This preview supports sample commands. Type help."]
        );
        setCommand("");
    };
    const tabStrip = (media = false) => (
        <nav className="pw-top-tabs" aria-label={media ? "Media tabs" : "Workspace tabs"}>
            {tabs.map((tab) => (
                <div key={tab.id} data-active={active === tab.id}>
                    <button
                        onClick={() => {
                            setActive(tab.id);
                            if (mode === "regular") setMode("split");
                        }}
                        aria-pressed={active === tab.id}
                    >
                        {tab.kind === "browser" ? <Globe size={14} /> : <Terminal size={14} />}
                        <span>{tab.title}</span>
                    </button>
                    <button aria-label={"Close " + tab.title} onClick={() => closeTab(tab.id)}>
                        <X size={12} />
                    </button>
                </div>
            ))}
        </nav>
    );
    const browserControls = (
        <form className="pw-browser-bar" aria-label="Browser navigation" onSubmit={navigate}>
            <button type="button" aria-label="Back" onClick={() => setAddress("en.wikipedia.org")}>
                <ArrowLeft size={16} />
            </button>
            <button type="button" aria-label="Forward" onClick={() => setAddress("en.wikipedia.org/wiki/Coffee")}>
                <ArrowRight size={16} />
            </button>
            <button
                type="button"
                aria-label="Reload preview page"
                onClick={() => setAddress("en.wikipedia.org/wiki/Coffee")}
            >
                <RefreshCw size={15} />
            </button>
            <label>
                <Globe size={13} />
                <input
                    aria-label="Browser address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                />
            </label>
            <button type="button" aria-label="Extensions" onClick={(event) => openPopup(event, "Extensions")}>
                <Puzzle size={16} />
            </button>
            <button type="button" aria-label="Browser menu" onClick={(event) => openPopup(event, "Browser menu")}>
                <MoreHorizontal size={18} />
            </button>
        </form>
    );
    const resizeProps = {
        onPointerMove: moveResize,
        onPointerUp: () => {
            drag.current = undefined;
        },
        onLostPointerCapture: () => {
            drag.current = undefined;
        },
    };
    const islandControls = (
        <div className="pw-island-controls">
            <button
                aria-label="Move chat island"
                title="Drag to move the island"
                onPointerDown={(event) => startResize(event, "move")}
                {...resizeProps}
                onKeyDown={(event) => {
                    const delta = {
                        ArrowLeft: [-16, 0],
                        ArrowRight: [16, 0],
                        ArrowUp: [0, -16],
                        ArrowDown: [0, 16],
                    }[event.key];
                    if (!delta) return;
                    event.preventDefault();
                    moveNativeIsland(delta[0], delta[1]);
                }}
            >
                <GripHorizontal size={17} />
            </button>
            <button
                aria-label={threadVisible ? "Hide message thread" : "Show message thread"}
                aria-pressed={threadVisible}
                onPointerDown={(event) => event.preventDefault()}
                onClick={toggleThread}
            >
                {threadVisible ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button
                aria-label="Dock chat island"
                title="Return island to bottom center"
                onClick={() => setIslandPosition(undefined)}
            >
                <ArrowDownToLine size={14} />
            </button>
        </div>
    );
    return (
        <div
            className="pw-preview"
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    setPopup(undefined);
                    setPanel(undefined);
                }
            }}
            style={
                {
                    "--pw-sidebar": sidebar ? sidebarWidth + "px" : "0px",
                    "--pw-chat": chatWidth + "px",
                    "--pw-thread": threadHeight + "px",
                } as CSSProperties
            }
        >
            <div className="pw-preview-bar">
                <span>
                    <span className="pw-preview-dot" /> Workspace preview
                </span>
                <div role="group" aria-label="Chat layout">
                    <button
                        aria-pressed={mode === "regular"}
                        onClick={() => {
                            setMode("regular");
                            setChatVisible(true);
                        }}
                    >
                        Regular chat
                    </button>
                    <button
                        aria-pressed={mode === "floating"}
                        onClick={() => {
                            setMode("floating");
                            setChatVisible(true);
                        }}
                    >
                        Floating chat
                    </button>
                    <button
                        aria-pressed={mode === "split"}
                        onClick={() => {
                            setMode("split");
                            setChatVisible(true);
                        }}
                    >
                        Chat + media panel
                    </button>
                </div>
                <span className="pw-sample-note">Sample content · local interactions</span>
            </div>
            <div className="pw-workspace" data-sidebar={sidebar} data-mode={mode} data-chat={chatVisible}>
                <header className="pw-titlebar">
                    <div className="pw-document">
                        <LayoutGrid size={15} />
                        <span>untitled.pen</span>
                        <button
                            aria-label={sidebar ? "Close sidebar" : "Open sidebar"}
                            aria-expanded={sidebar}
                            onClick={() => setSidebar(!sidebar)}
                        >
                            <PanelLeft size={16} />
                        </button>
                    </div>
                    {!sidebar && mode !== "split" && tabStrip()}
                    <div className="pw-title-actions">
                        <button aria-label="New tab" onClick={(event) => openPopup(event, "New tab")}>
                            <Plus size={17} />
                        </button>
                        <button aria-label="Reviews" onClick={(event) => openPopup(event, "Reviews")}>
                            <GitPullRequest size={16} />
                        </button>
                        <button
                            aria-label="Expand active tab"
                            onClick={() => {
                                setSidebar(false);
                                setMode("floating");
                            }}
                        >
                            <Maximize2 size={16} />
                        </button>
                        <button
                            aria-label="Toggle media panel"
                            aria-pressed={mode === "split"}
                            onClick={() => {
                                setMode(mode === "split" ? "regular" : "split");
                                setChatVisible(true);
                            }}
                        >
                            <PanelRight size={16} />
                        </button>
                    </div>
                </header>
                {sidebar && (
                    <aside className="pw-sidebar" aria-label="Workspace sidebar">
                        <div className="pw-sidebar-browser">{browserControls}</div>
                        <nav className="pw-pinned-sites" aria-label="Pinned shortcuts">
                            <button
                                aria-label="Messaging shortcut"
                                title="Messaging"
                                onClick={() => setPanel("Messaging")}
                            >
                                <MessageSquare size={19} />
                            </button>
                            <button
                                aria-label="GitHub shortcut"
                                title="Project rooms"
                                onClick={() => setPanel("Project rooms")}
                            >
                                <Code2 size={20} />
                            </button>
                            <button aria-label="Notes shortcut" title="Artifacts" onClick={() => setPanel("Artifacts")}>
                                <FileText size={19} />
                            </button>
                        </nav>
                        <div className="pw-sidebar-tabs">
                            <div className="pw-sidebar-heading">
                                <span>Workspace</span>
                                <button aria-label="Add workspace tab" onClick={(event) => openPopup(event, "New tab")}>
                                    <Plus size={15} />
                                </button>
                            </div>
                            {tabs.map((tab) => (
                                <div className="pw-sidebar-tab" key={tab.id} data-active={active === tab.id}>
                                    <button onClick={() => setActive(tab.id)} aria-pressed={active === tab.id}>
                                        {tab.kind === "browser" ? <Globe size={15} /> : <Terminal size={15} />}
                                        <span>{tab.title}</span>
                                    </button>
                                    <button aria-label={"Close " + tab.title} onClick={() => closeTab(tab.id)}>
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="pw-sidebar-scroll">
                            <div className="pw-sidebar-heading">
                                <span>Chat history</span>
                                <button onClick={newChat}>
                                    <Plus size={13} /> New
                                </button>
                            </div>
                            <nav className="pw-sections" aria-label="Workspace sections">
                                {Sections.map(({ label, icon: Icon }) => (
                                    <button key={label} onClick={() => setPanel(label)}>
                                        <Icon size={15} />
                                        <span>{label}</span>
                                    </button>
                                ))}
                            </nav>
                            <label className="pw-search">
                                <Search size={13} />
                                <input
                                    aria-label="Search chats"
                                    placeholder="Search chats…"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                />
                            </label>
                            <p className="pw-history-label">Today</p>
                            {history
                                .filter((item) => item.toLowerCase().includes(query.toLowerCase()))
                                .map((item) => (
                                    <button
                                        className="pw-history"
                                        key={item}
                                        aria-pressed={selectedChat === item}
                                        onClick={() => {
                                            setSelectedChat(item);
                                            setChatVisible(true);
                                        }}
                                    >
                                        {item}
                                    </button>
                                ))}
                        </div>
                        <div className="pw-profile">
                            <span>Profile</span>
                            <button onClick={(event) => openPopup(event, "Model")}>
                                {model}
                                <ChevronDown size={12} />
                            </button>
                        </div>
                        <footer>
                            <button aria-label="Settings" onClick={() => setPanel("Settings")}>
                                <Settings size={16} />
                            </button>
                            <button aria-label="Attach files" onClick={() => fileInput.current?.click()}>
                                <Paperclip size={16} />
                            </button>
                            <button aria-label="New conversation" onClick={newChat}>
                                <MessageCircle size={16} />
                            </button>
                            <button aria-label="Downloads" onClick={(event) => openPopup(event, "Downloads")}>
                                <ArrowDownToLine size={16} />
                            </button>
                        </footer>
                        <button
                            className="pw-sidebar-resize"
                            aria-label="Resize sidebar"
                            onPointerDown={(event) => startResize(event, "sidebar")}
                            {...resizeProps}
                            onKeyDown={(event) => {
                                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                                    event.preventDefault();
                                    setSidebarWidth((width) =>
                                        Math.max(220, Math.min(380, width + (event.key === "ArrowRight" ? 12 : -12)))
                                    );
                                }
                            }}
                        />
                    </aside>
                )}
                <main ref={mainRef} className="pw-main">
                    <div className="pw-surface" hidden={mode === "regular"} role="region" aria-label="Media side panel">
                        {mode === "split" && (
                            <div className="pw-media-header">
                                {tabStrip(true)}
                                <button aria-label="Add media tab" onClick={(event) => openPopup(event, "New tab")}>
                                    <Plus size={16} />
                                </button>
                                <button aria-label="Close media panel" onClick={() => setMode("regular")}>
                                    <PanelRight size={16} />
                                </button>
                            </div>
                        )}
                        {current?.kind === "browser" ? (
                            <>
                                {!sidebar && browserControls}

                                <article className="pw-browser-page">
                                    <div className="pw-wiki-header">
                                        <strong>Wikipedia</strong>
                                        <span>The Free Encyclopedia</span>
                                    </div>
                                    <div className="pw-article-body">
                                        <aside>
                                            <strong>Contents</strong>
                                            <a href="#coffee">Coffee</a>
                                            <a href="#origins">Origins</a>
                                            <a href="#preparation">Preparation</a>
                                        </aside>
                                        <div>
                                            <div className="pw-article-heading">
                                                <h1 id="coffee">Coffee</h1>
                                                <span>Article&nbsp;&nbsp; Talk</span>
                                            </div>
                                            <p className="pw-source">
                                                From Wikipedia, the free encyclopedia · sample page
                                            </p>
                                            <p>
                                                <b>Coffee</b> is a beverage brewed from roasted coffee beans. Darkly
                                                colored, bitter, and slightly acidic, coffee has a stimulating effect on
                                                humans, primarily due to its caffeine content.
                                            </p>
                                            <p>
                                                Seeds from the coffee plant are separated from the fruit, processed, and
                                                dried. The beans are then roasted and ground before being brewed with
                                                hot water.
                                            </p>
                                            <h2 id="origins">Origins</h2>
                                            <p>
                                                Coffee culture has developed across centuries of trade, conversation,
                                                and everyday rituals. Coffeehouses became places to read, exchange
                                                ideas, and spend time together.
                                            </p>
                                            <h2 id="preparation">Preparation</h2>
                                            <p>
                                                Different brewing methods produce different flavors and textures. Filter
                                                coffee, espresso, and immersion brewing each offer a distinct way to
                                                prepare a cup.
                                            </p>
                                            <p>
                                                Keep this page visible as you switch between the terminal and your
                                                conversation. The floating chat can be resized from its upper-right
                                                grip.
                                            </p>
                                        </div>
                                    </div>
                                </article>
                            </>
                        ) : current?.kind === "terminal" ? (
                            <section className="pw-terminal" aria-label="Terminal preview">
                                <header>
                                    <Terminal size={14} /> kronos — zsh<span>Preview</span>
                                </header>
                                <div className="pw-terminal-output">
                                    {terminalLines.map((line, index) => (
                                        <pre key={index}>{line}</pre>
                                    ))}
                                    <form onSubmit={runCommand}>
                                        <span>~/kronos $</span>
                                        <input
                                            aria-label="Terminal command"
                                            value={command}
                                            onChange={(event) => setCommand(event.target.value)}
                                            autoComplete="off"
                                            spellCheck={false}
                                        />
                                    </form>
                                </div>
                            </section>
                        ) : (
                            <div className="pw-empty">
                                <p>Open a workspace tab</p>
                                <button onClick={() => addTab("browser")}>
                                    <Globe size={18} /> Browser
                                </button>
                                <button onClick={() => addTab("terminal")}>
                                    <Terminal size={18} /> Terminal
                                </button>
                            </div>
                        )}
                    </div>
                    {chatVisible && (
                        <section
                            ref={islandRef}
                            className="pw-chat"
                            aria-label="Chat preview"
                            data-thread={threadVisible}
                            style={
                                mode === "floating" && islandPosition
                                    ? {
                                          left: islandPosition.x,
                                          top: islandPosition.y,
                                          bottom: "auto",
                                          transform: "none",
                                      }
                                    : undefined
                            }
                        >
                            {mode === "floating" && !inlineIslandControls && islandControls}
                            <PenNativeIsland
                                active={mode === "floating"}
                                controls={inlineIslandControls ? islandControls : undefined}
                                messages={messages}
                                threadVisible={threadVisible}
                                threadHeight={threadHeight}
                                onMove={moveNativeIsland}
                                onFullChat={() => setMode("regular")}
                                onSend={(prompt, response) =>
                                    setMessages((items) => [
                                        ...items,
                                        { role: "user", text: prompt },
                                        { role: "assistant", text: response },
                                    ])
                                }
                            />
                            {mode !== "floating" && (
                                <div className="pw-chat-toolbar">
                                    <button onClick={() => setSidebar(!sidebar)} aria-expanded={sidebar}>
                                        <MessageCircle size={14} /> Show chats
                                    </button>
                                    <button
                                        onClick={() => {
                                            setMode("floating");
                                            setChatVisible(true);
                                        }}
                                    >
                                        <ArrowLeft size={13} /> Open canvas
                                    </button>
                                    <button
                                        aria-label={threadVisible ? "Hide message thread" : "Show message thread"}
                                        aria-pressed={threadVisible}
                                        onClick={toggleThread}
                                    >
                                        {threadVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            )}
                            <div
                                className="pw-thread"
                                hidden={mode === "floating" || !threadVisible}
                                style={{ height: mode === "floating" ? threadHeight : undefined }}
                            >
                                {messages.length > 0 && (
                                    <header>
                                        <span>
                                            <span className="pw-agent-dot" />
                                            {selectedChat}
                                        </span>
                                        <button aria-label="New chat" onClick={newChat}>
                                            <Plus size={14} />
                                        </button>
                                    </header>
                                )}
                                <div className="pw-messages">
                                    {messages.length ? (
                                        messages.map((message, index) => (
                                            <div key={index} data-role={message.role}>
                                                {message.role === "assistant" && <strong>Hermes</strong>}
                                                <p>{message.text}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="pw-chat-welcome">
                                            <h2>Ask me to design anything</h2>
                                            <div className="pw-prompts">
                                                {Prompts.map((prompt) => (
                                                    <button key={prompt} onClick={() => setDraft(prompt)}>
                                                        {prompt}
                                                    </button>
                                                ))}
                                            </div>
                                            <h3>Generate code</h3>
                                            <p>Ask the agent to generate code you can copy into your project.</p>
                                            <p>
                                                For an HTML file, select a frame and click “Export HTML” in the
                                                properties panel.
                                            </p>
                                            <h3>Attach context files</h3>
                                            <p>Drop a PNG/JPG, DESIGN.md or any text file here or attach via +</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <form className="pw-composer" hidden={mode === "floating"} onSubmit={submit}>
                                <textarea
                                    aria-label="Message"
                                    placeholder="Create, plan or research…"
                                    value={draft}
                                    rows={2}
                                    onChange={(event) => setDraft(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey) {
                                            event.preventDefault();
                                            submit(event);
                                        }
                                    }}
                                />
                                {attachments.length > 0 && (
                                    <div className="pw-attachments">
                                        {attachments.map((name) => (
                                            <button
                                                key={name}
                                                type="button"
                                                onClick={() =>
                                                    setAttachments((items) => items.filter((item) => item !== name))
                                                }
                                            >
                                                {name}
                                                <X size={11} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="pw-composer-controls">
                                    <button
                                        type="button"
                                        aria-label="Attach to message"
                                        onClick={() => fileInput.current?.click()}
                                    >
                                        <Plus size={17} />
                                    </button>
                                    <span />
                                    <button type="button" onClick={(event) => openPopup(event, "Model")}>
                                        {model}
                                        <ChevronDown size={11} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Run settings"
                                        onClick={(event) => openPopup(event, "Run settings")}
                                    >
                                        <SlidersHorizontal size={15} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Voice settings"
                                        onClick={(event) => openPopup(event, "Voice")}
                                    >
                                        <Mic size={15} />
                                    </button>
                                    <button
                                        className="pw-send"
                                        type="submit"
                                        aria-label="Send message"
                                        disabled={!draft.trim()}
                                    >
                                        <ArrowUp size={16} />
                                    </button>
                                </div>
                            </form>
                            {mode !== "regular" && (
                                <button
                                    className="pw-chat-resize"
                                    aria-label="Resize chat"
                                    title="Drag to resize chat. Use arrow keys for fine adjustments."
                                    onPointerDown={(event) => startResize(event, "chat")}
                                    {...resizeProps}
                                    onKeyDown={(event) => {
                                        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                                            event.preventDefault();
                                            setChatWidth((width) =>
                                                Math.max(
                                                    280,
                                                    Math.min(700, width + (event.key === "ArrowRight" ? 16 : -16))
                                                )
                                            );
                                        }
                                        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                                            event.preventDefault();
                                            setThreadHeight((height) =>
                                                Math.max(
                                                    120,
                                                    Math.min(
                                                        window.innerHeight - 290,
                                                        height + (event.key === "ArrowUp" ? 16 : -16)
                                                    )
                                                )
                                            );
                                        }
                                    }}
                                />
                            )}
                        </section>
                    )}
                </main>
            </div>
            <input
                hidden
                ref={fileInput}
                type="file"
                multiple
                onChange={(event) => {
                    setAttachments((items) => [
                        ...new Set([...items, ...Array.from(event.target.files ?? [], (file) => file.name)]),
                    ]);
                    event.target.value = "";
                }}
            />
            {popup &&
                createPortal(
                    <>
                        <button
                            className="pw-popup-dismiss"
                            aria-label="Close menu"
                            onClick={() => setPopup(undefined)}
                        />
                        <div
                            className="pw-popup"
                            role="dialog"
                            aria-label={popup.title}
                            style={{ left: popup.x, top: popup.y }}
                        >
                            <header>
                                {popup.title}
                                <button aria-label="Close popup" onClick={() => setPopup(undefined)}>
                                    <X size={13} />
                                </button>
                            </header>
                            {popup.title === "New tab" ? (
                                <>
                                    <button onClick={() => addTab("browser")}>
                                        <Globe size={15} /> Browser
                                    </button>
                                    <button onClick={() => addTab("terminal")}>
                                        <Terminal size={15} /> Terminal
                                    </button>
                                </>
                            ) : popup.title === "Model" ? (
                                Models.map((name) => (
                                    <button
                                        key={name}
                                        onClick={() => {
                                            setModel(name);
                                            setPopup(undefined);
                                        }}
                                    >
                                        {name}
                                        {model === name && <Check size={14} />}
                                    </button>
                                ))
                            ) : popup.title === "Reviews" ? (
                                <>
                                    <p>Workspace changes</p>
                                    <div className="pw-review-row">
                                        <Code2 size={14} /> workspace.tsx <span>+24 −8</span>
                                    </div>
                                    <p>Sample review for checking popup placement.</p>
                                </>
                            ) : popup.title === "Extensions" ? (
                                <>
                                    <p>Installed extensions</p>
                                    <button
                                        onClick={() => {
                                            setPopup(undefined);
                                            setPanel("Extensions");
                                        }}
                                    >
                                        <Puzzle size={15} /> Manage extensions
                                    </button>
                                </>
                            ) : popup.title === "Browser menu" ? (
                                <>
                                    <button
                                        onClick={() => {
                                            setSidebar(!sidebar);
                                            setPopup(undefined);
                                        }}
                                    >
                                        <PanelLeft size={15} /> Toggle sidebar
                                    </button>
                                    <button
                                        onClick={() => {
                                            setMode(mode === "split" ? "floating" : "split");
                                            setPopup(undefined);
                                        }}
                                    >
                                        Switch chat layout
                                    </button>
                                </>
                            ) : (
                                <p>
                                    {popup.title === "Downloads"
                                        ? "No downloads in this preview."
                                        : "Preview controls. Live services are disconnected."}
                                </p>
                            )}
                        </div>
                    </>,
                    document.body
                )}
            {panel &&
                createPortal(
                    <div className="pw-modal-backdrop" onClick={() => setPanel(undefined)}>
                        <section
                            className="pw-modal"
                            role="dialog"
                            aria-modal="true"
                            aria-label={panel}
                            onClick={(event) => event.stopPropagation()}
                        >
                            <header>
                                <h2>{panel}</h2>
                                <button aria-label="Close section" autoFocus onClick={() => setPanel(undefined)}>
                                    <X size={18} />
                                </button>
                            </header>
                            <p className="pw-modal-note">Sample content for reviewing this section.</p>
                            {(
                                section?.items ??
                                (panel === "Settings"
                                    ? ["Appearance", "Models", "Browser", "Voice", "Connections"]
                                    : ["Installed extensions", "Import extension"])
                            ).map((item) => (
                                <div className="pw-section-row" key={item}>
                                    <span>{item}</span>
                                    <ChevronDown size={14} />
                                </div>
                            ))}
                        </section>
                    </div>,
                    document.body
                )}
        </div>
    );
}
