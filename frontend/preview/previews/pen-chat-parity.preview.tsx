// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    ArrowUp,
    AudioLines,
    Box,
    Check,
    ChevronDown,
    Clock,
    FileText,
    FolderOpen,
    Globe,
    Layers3,
    MessageSquareText,
    Mic,
    PanelLeftIcon,
    Pin,
    Plus,
    Search,
    Settings,
    SlidersHorizontal,
    X,
} from "@hermes/lib/icons";
import type { ComponentType } from "react";
import { useRef, useState } from "react";
import "./pen-chat-parity.preview.css";

type Destination =
    "Chat" | "Search" | "Recents" | "Projects" | "Library" | "Scheduled" | "Plugins" | "Skills" | "Settings" | "Canvas";
const Destinations: { name: Destination; icon: ComponentType<{ size?: number }> }[] = [
    { name: "Search", icon: Search },
    { name: "Recents", icon: MessageSquareText },
    { name: "Projects", icon: FolderOpen },
    { name: "Library", icon: FileText },
    { name: "Scheduled", icon: Clock },
    { name: "Plugins", icon: Box },
    { name: "Skills", icon: Layers3 },
];
const RecentItems = [
    { title: "A quieter workspace", project: "KronOS", type: "Chat", when: "Just now", pinned: true },
    { title: "Research the launch landscape", project: "Launch", type: "Work", when: "Today", pinned: true },
    { title: "Draft the product story", project: "Launch", type: "Chat", when: "Yesterday", pinned: false },
    { title: "Review the navigation", project: "KronOS", type: "Work", when: "Yesterday", pinned: false },
];
const SettingsGroups = [
    "General",
    "Appearance",
    "Personalization",
    "Memory",
    "Models",
    "Voice",
    "Connections",
    "Browser",
    "Computer use",
    "Remotes",
    "Data & privacy",
    "Storage",
    "Import",
    "Profile",
    "Account & billing",
    "Security & login",
    "Safety & wellbeing",
    "Parental controls",
    "Time management",
    "Computer history",
    "Viewers",
];
const LibraryItems = [
    {
        title: "Product story",
        kind: "Document",
        detail: "Launch / Writing",
        text: "KronOS brings your conversations, tools, and work into one persistent workspace.\n\nStart with a question. Keep the research, files, and decisions together. Open the canvas when you need a wider view.",
    },
    {
        title: "Launch research",
        kind: "Report",
        detail: "Launch / Research",
        text: "Research brief\n\n1. Understand the audience\n2. Compare the current workflows\n3. Document sources and assumptions\n\nSources and report content in this preview are illustrative.",
    },
    {
        title: "Welcome page",
        kind: "Code",
        detail: "KronOS / Website",
        text: "<main>\n  <h1>A little more room to think.</h1>\n  <p>Your workspace, connected.</p>\n</main>",
    },
];
const PluginItems = [
    { name: "Files", detail: "Read, edit, and organize your work", state: "Installed", category: "Workspace" },
    { name: "Browser", detail: "Research and work across the web", state: "Installed", category: "Research" },
    { name: "Documents", detail: "Create documents, sheets, and slides", state: "Preview", category: "Creation" },
    {
        name: "Connected apps",
        detail: "Choose an account and review access",
        state: "Connect",
        category: "Connections",
    },
];

export function PenChatParityPreview() {
    const [destination, setDestination] = useState<Destination>("Chat");
    const [sidebar, setSidebar] = useState(true);
    const [mode, setMode] = useState("Chat");
    const [draft, setDraft] = useState("");
    const [messages, setMessages] = useState<string[]>([]);
    const [attachments, setAttachments] = useState<string[]>([]);
    const [toolMenu, setToolMenu] = useState(false);
    const [temporary, setTemporary] = useState(false);
    const [personalized, setPersonalized] = useState(false);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("All");
    const [pins, setPins] = useState(RecentItems.filter((item) => item.pinned).map((item) => item.title));
    const [setting, setSetting] = useState("General");
    const [notice, setNotice] = useState("");
    const [editor, setEditor] = useState<(typeof LibraryItems)[number]>();
    const [editText, setEditText] = useState("");
    const [sourceMode, setSourceMode] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const [future, setFuture] = useState<string[]>([]);
    const [plugin, setPlugin] = useState<(typeof PluginItems)[number]>();
    const [paused, setPaused] = useState(false);
    const [voice, setVoice] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const visibleRecents = RecentItems.filter(
        (item) =>
            item.title.toLowerCase().includes(query.toLowerCase()) &&
            (filter === "All" || filter === item.type || (filter === "Pinned" && pins.includes(item.title)))
    );
    const navigate = (next: Destination) => {
        setDestination(next);
        setPlugin(undefined);
        setEditor(undefined);
        setFilter("All");
        setQuery("");
        setNotice("");
    };
    const openEditor = (item: (typeof LibraryItems)[number]) => {
        setEditor(item);
        setEditText(item.text);
        setHistory([]);
        setFuture([]);
        setSourceMode(false);
    };
    const simulate = (message: string) => setNotice(message + " — preview only");
    const submit = () => {
        if (!draft.trim() && !attachments.length) return;
        setMessages((items) => [...items, draft.trim() || "Review the attached files"]);
        setDraft("");
        setAttachments([]);
        simulate("Message added; no agent request sent");
    };
    return (
        <div className="parity-preview" data-sidebar={sidebar}>
            <div className="parity-preview-note">
                <span>INTERACTIVE PREVIEW</span>
                <span>Sample content · Changes stay here</span>
                <button onClick={() => simulate("Navigation and appearance are ready for your review")}>
                    Review this direction
                </button>
            </div>
            <div className="parity-shell">
                {sidebar && (
                    <aside className="parity-sidebar">
                        <div className="parity-brand">
                            <span className="parity-mark">K</span>
                            <select
                                aria-label="Workspace destination"
                                onChange={(event) => navigate(event.target.value === "Canvas" ? "Canvas" : "Chat")}
                            >
                                <option>KronOS</option>
                                <option>Canvas</option>
                            </select>
                            <button aria-label="Hide sidebar" onClick={() => setSidebar(false)}>
                                <PanelLeftIcon size={17} />
                            </button>
                        </div>
                        <button
                            className="parity-new"
                            onClick={() => {
                                navigate("Chat");
                                setMessages([]);
                            }}
                        >
                            <Plus size={17} /> New chat <kbd>⌘ N</kbd>
                        </button>
                        <nav aria-label="Workspace navigation">
                            {Destinations.map(({ name, icon: Icon }) => (
                                <button
                                    key={name}
                                    aria-current={destination === name ? "page" : undefined}
                                    onClick={() => navigate(name)}
                                >
                                    <Icon size={17} />
                                    <span>{name}</span>
                                    {name === "Scheduled" && <small>1</small>}
                                </button>
                            ))}
                        </nav>
                        <div className="parity-sidebar-label">
                            PINNED <span>{pins.length}</span>
                        </div>
                        {RecentItems.filter((item) => pins.includes(item.title)).map((item) => (
                            <button
                                className="parity-history-item"
                                key={item.title}
                                onClick={() => {
                                    navigate("Chat");
                                    setMessages([item.title]);
                                }}
                            >
                                <span>{item.title}</span>
                            </button>
                        ))}
                        <div className="parity-sidebar-label">
                            PROJECTS{" "}
                            <button aria-label="Create project" onClick={() => navigate("Projects")}>
                                <Plus size={14} />
                            </button>
                        </div>
                        {["KronOS", "Launch"].map((project) => (
                            <button
                                className="parity-project-link"
                                key={project}
                                onClick={() => {
                                    navigate("Projects");
                                    simulate(project + " selected");
                                }}
                            >
                                <FolderOpen size={15} />
                                {project}
                            </button>
                        ))}
                        <div className="parity-sidebar-bottom">
                            <button onClick={() => navigate("Settings")}>
                                <Settings size={17} />
                                Settings
                            </button>
                            <button
                                className="parity-profile"
                                onClick={() => {
                                    navigate("Settings");
                                    setSetting("Profile");
                                }}
                            >
                                <span>A</span>
                                <div>
                                    Personal workspace<small>Local and connected tools</small>
                                </div>
                            </button>
                        </div>
                    </aside>
                )}
                <main className="parity-main">
                    <header className="parity-topbar">
                        <div>
                            {!sidebar && (
                                <button aria-label="Show sidebar" onClick={() => setSidebar(true)}>
                                    <PanelLeftIcon size={18} />
                                </button>
                            )}
                            <span>{destination === "Chat" ? "Personal workspace" : destination}</span>
                            <ChevronDown size={13} />
                        </div>
                        <div className="parity-mode" aria-label="Conversation mode">
                            {["Chat", "Work"].map((value) => (
                                <button
                                    key={value}
                                    aria-pressed={mode === value}
                                    onClick={() => {
                                        setMode(value);
                                        setDestination("Chat");
                                    }}
                                >
                                    {value}
                                </button>
                            ))}
                        </div>
                        <button
                            className="parity-canvas-link"
                            onClick={() => navigate(destination === "Canvas" ? "Chat" : "Canvas")}
                        >
                            <Layers3 size={16} />
                            {destination === "Canvas" ? "Open chat" : "Open canvas"}
                        </button>
                    </header>
                    <div className="parity-content">
                        {destination === "Chat" && (
                            <div className="parity-chat">
                                {messages.length === 0 ? (
                                    <div className="parity-welcome">
                                        <div className="parity-eyebrow">YOUR WORK, WITH ROOM TO THINK</div>
                                        <h1>
                                            {mode === "Work"
                                                ? "What shall we work on?"
                                                : "Where would you like to start?"}
                                        </h1>
                                        <p>
                                            {mode === "Work"
                                                ? "Turn a brief into research, a document, or something you can use."
                                                : "Ask a question, bring a file, or pick up where you left off."}
                                        </p>
                                        <div className="parity-suggestions">
                                            {[
                                                {
                                                    icon: Globe,
                                                    label: "Research a topic",
                                                    prompt: "Research the launch landscape and keep track of your sources.",
                                                },
                                                {
                                                    icon: FileText,
                                                    label: "Create something",
                                                    prompt: "Help me draft a clear product story.",
                                                },
                                                {
                                                    icon: FolderOpen,
                                                    label: "Explore my project",
                                                    prompt: "Help me understand the current KronOS project.",
                                                },
                                            ].map(({ icon: Icon, label, prompt }) => (
                                                <button key={label} onClick={() => setDraft(prompt)}>
                                                    <Icon size={18} />
                                                    <span>{label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="parity-transcript">
                                        {messages.map((message, index) => (
                                            <div key={index}>
                                                <div className="parity-user-message">{message}</div>
                                                <div className="parity-agent-message">
                                                    <span className="parity-mark">K</span>
                                                    <div>
                                                        <p>
                                                            {mode === "Work"
                                                                ? "Here is a proposed workflow to review."
                                                                : "We can keep the conversation and its outputs together."}
                                                        </p>
                                                        {mode === "Work" && (
                                                            <ol>
                                                                <li>Review the brief and sources</li>
                                                                <li>Prepare the deliverable</li>
                                                                <li>Check the result with you</li>
                                                            </ol>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                navigate("Library");
                                                                openEditor(LibraryItems[0]);
                                                            }}
                                                        >
                                                            <FileText size={16} />
                                                            Open example document
                                                        </button>
                                                        <small>Illustrative response · no model called</small>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="parity-composer-wrap">
                                    {temporary && (
                                        <div className="parity-temporary">
                                            <span>Temporary chat</span>
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={personalized}
                                                    onChange={(e) => setPersonalized(e.target.checked)}
                                                />
                                                Use personalization
                                            </label>
                                            <button
                                                onClick={() => {
                                                    setTemporary(false);
                                                    simulate("Converted to a saved chat");
                                                }}
                                            >
                                                Save chat
                                            </button>
                                        </div>
                                    )}
                                    {voice && (
                                        <div className="parity-voice">
                                            <AudioLines size={20} />
                                            <span>Voice conversation preview</span>
                                            <button onClick={() => setVoice(false)}>End</button>
                                        </div>
                                    )}
                                    <div className="parity-composer">
                                        {!!attachments.length && (
                                            <div className="parity-attachment-list">
                                                {attachments.map((name, index) => (
                                                    <span key={index}>
                                                        <FileText size={14} />
                                                        {name}
                                                        <button
                                                            aria-label={`Remove ${name}`}
                                                            onClick={() =>
                                                                setAttachments((items) =>
                                                                    items.filter((_, i) => i !== index)
                                                                )
                                                            }
                                                        >
                                                            <X size={13} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <textarea
                                            aria-label="Message"
                                            placeholder={
                                                mode === "Work"
                                                    ? "Describe the outcome you want…"
                                                    : "Ask anything, or @mention a file or app…"
                                            }
                                            value={draft}
                                            onChange={(e) => setDraft(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    submit();
                                                }
                                            }}
                                        />
                                        <div className="parity-composer-controls">
                                            <div className="parity-tool-anchor">
                                                <button
                                                    aria-label="Add context and tools"
                                                    aria-expanded={toolMenu}
                                                    onClick={() => setToolMenu(!toolMenu)}
                                                >
                                                    <Plus size={19} />
                                                </button>
                                                {toolMenu && (
                                                    <div className="parity-tool-menu">
                                                        {[
                                                            "Attach files",
                                                            "Mention an app",
                                                            "Web search",
                                                            "Deep research",
                                                            "Temporary chat",
                                                        ].map((label) => (
                                                            <button
                                                                key={label}
                                                                onClick={() => {
                                                                    setToolMenu(false);
                                                                    if (label === "Attach files")
                                                                        input.current?.click();
                                                                    else if (label === "Temporary chat")
                                                                        setTemporary(!temporary);
                                                                    else if (label === "Mention an app")
                                                                        setDraft(draft + "@Files ");
                                                                    else {
                                                                        setDraft(label + ": " + draft);
                                                                        setMode("Work");
                                                                    }
                                                                }}
                                                            >
                                                                {label}
                                                                {label === "Temporary chat" && temporary && (
                                                                    <Check size={15} />
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <select aria-label="Model">
                                                <option>Current model</option>
                                                <option>Fast model · example</option>
                                                <option>Reasoning model · example</option>
                                            </select>
                                            <span className="parity-grow" />
                                            <button
                                                aria-label="Dictate"
                                                onClick={() => {
                                                    setDraft(draft + "Review this idea with me.");
                                                    simulate("Example dictation inserted; microphone not accessed");
                                                }}
                                            >
                                                <Mic size={17} />
                                            </button>
                                            <button aria-label="Voice conversation" onClick={() => setVoice(!voice)}>
                                                <AudioLines size={19} />
                                            </button>
                                            <button
                                                className="parity-send"
                                                aria-label="Send preview message"
                                                onClick={submit}
                                                disabled={!draft.trim() && !attachments.length}
                                            >
                                                <ArrowUp size={18} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="parity-composer-footnote">
                                        {mode === "Work"
                                            ? "Plans, progress, and outputs stay with this conversation."
                                            : "Your conversation stays with you when you open the canvas."}
                                    </div>
                                </div>
                            </div>
                        )}
                        {(destination === "Search" || destination === "Recents") && (
                            <section className="parity-page">
                                <div className="parity-page-heading">
                                    <div>
                                        <div className="parity-eyebrow">PICK UP THE THREAD</div>
                                        <h1>{destination}</h1>
                                    </div>
                                    <SlidersHorizontal size={20} />
                                </div>
                                <label className="parity-search">
                                    <Search size={18} />
                                    <input
                                        aria-label="Search your work"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Search chats, projects, and files"
                                    />
                                </label>
                                <div className="parity-tabs">
                                    {["All", "Chat", "Work", "Pinned"].map((item) => (
                                        <button
                                            key={item}
                                            aria-pressed={filter === item}
                                            onClick={() => setFilter(item)}
                                        >
                                            {item}
                                        </button>
                                    ))}
                                </div>
                                <div className="parity-list">
                                    {visibleRecents.map((item) => (
                                        <div key={item.title}>
                                            <button
                                                className="parity-list-main"
                                                onClick={() => {
                                                    navigate("Chat");
                                                    setMessages([item.title]);
                                                    setMode(item.type);
                                                }}
                                            >
                                                <MessageSquareText size={18} />
                                                <span>
                                                    {item.title}
                                                    <small>
                                                        {item.project} · {item.type}
                                                    </small>
                                                </span>
                                            </button>
                                            <small>{item.when}</small>
                                            <button
                                                aria-label={`${pins.includes(item.title) ? "Unpin" : "Pin"} ${item.title}`}
                                                aria-pressed={pins.includes(item.title)}
                                                onClick={() =>
                                                    setPins((items) =>
                                                        items.includes(item.title)
                                                            ? items.filter((title) => title !== item.title)
                                                            : [...items, item.title]
                                                    )
                                                }
                                            >
                                                <Pin size={16} />
                                            </button>
                                        </div>
                                    ))}
                                    {visibleRecents.length === 0 && (
                                        <p className="parity-empty">No matching conversations. Try another search.</p>
                                    )}
                                </div>
                            </section>
                        )}
                        {destination === "Projects" && (
                            <section className="parity-page">
                                <div className="parity-page-heading">
                                    <div>
                                        <div className="parity-eyebrow">CONTEXT THAT STAYS TOGETHER</div>
                                        <h1>Projects</h1>
                                        <p>Conversations, sources, and instructions for each piece of work.</p>
                                    </div>
                                    <button
                                        className="parity-primary"
                                        onClick={() =>
                                            simulate("New project form would reuse the existing project store")
                                        }
                                    >
                                        <Plus size={16} />
                                        New project
                                    </button>
                                </div>
                                <div className="parity-project-grid">
                                    {["KronOS", "Launch"].map((name) => (
                                        <article key={name}>
                                            <FolderOpen size={25} />
                                            <h2>{name}</h2>
                                            <p>
                                                {name === "KronOS"
                                                    ? "A calmer home for apps, agents, and ideas."
                                                    : "Research, writing, and the next release."}
                                            </p>
                                            <div className="parity-tabs">
                                                {["Chats", "Sources", "Instructions", "Memory"].map((tab) => (
                                                    <button key={tab} onClick={() => simulate(name + " / " + tab)}>
                                                        {tab}
                                                    </button>
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    navigate("Recents");
                                                }}
                                            >
                                                Open project →
                                            </button>
                                        </article>
                                    ))}
                                </div>
                            </section>
                        )}
                        {destination === "Library" && (
                            <section className="parity-page">
                                <div className="parity-page-heading">
                                    <div>
                                        <div className="parity-eyebrow">MORE THAN A CONVERSATION</div>
                                        <h1>Library</h1>
                                        <p>Documents, research, code, and files you want to keep.</p>
                                    </div>
                                    <button
                                        className="parity-primary"
                                        onClick={() =>
                                            openEditor({
                                                title: "Untitled document",
                                                kind: "Document",
                                                detail: "Personal",
                                                text: "",
                                            })
                                        }
                                    >
                                        <Plus size={16} />
                                        New page
                                    </button>
                                </div>
                                <div className="parity-tabs">
                                    {["All", "Document", "Report", "Code"].map((kind) => (
                                        <button
                                            key={kind}
                                            aria-pressed={filter === kind}
                                            onClick={() => setFilter(kind)}
                                        >
                                            {kind}
                                        </button>
                                    ))}
                                </div>
                                <div className="parity-library-grid">
                                    {LibraryItems.filter((item) => filter === "All" || item.kind === filter).map(
                                        (item) => (
                                            <button key={item.title} onClick={() => openEditor(item)}>
                                                <div className="parity-document-preview">
                                                    <FileText size={25} />
                                                    <span>{item.text.slice(0, 110)}</span>
                                                </div>
                                                <h2>{item.title}</h2>
                                                <small>{item.detail}</small>
                                            </button>
                                        )
                                    )}
                                </div>
                            </section>
                        )}
                        {destination === "Scheduled" && (
                            <section className="parity-page">
                                <div className="parity-page-heading">
                                    <div>
                                        <div className="parity-eyebrow">WORK THAT COMES BACK TO YOU</div>
                                        <h1>Scheduled</h1>
                                        <p>Manage recurring work and review each run.</p>
                                    </div>
                                    <button
                                        className="parity-primary"
                                        onClick={() => simulate("Create schedule would open the existing cron form")}
                                    >
                                        <Plus size={16} />
                                        New task
                                    </button>
                                </div>
                                <div className="parity-schedule">
                                    <Clock size={22} />
                                    <div>
                                        <h2>Weekly project review</h2>
                                        <p>Every Monday, 9:00 AM · America/New_York</p>
                                        <small>{paused ? "Paused" : "Active"} · Example schedule</small>
                                    </div>
                                    <button onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>
                                    <button onClick={() => simulate("Schedule editor selected")}>Edit</button>
                                </div>
                            </section>
                        )}
                        {(destination === "Plugins" || destination === "Skills") && (
                            <section className="parity-page">
                                <div className="parity-page-heading">
                                    <div>
                                        <div className="parity-eyebrow">BRING YOUR TOOLS WITH YOU</div>
                                        <h1>{destination}</h1>
                                        <p>
                                            {destination === "Plugins"
                                                ? "Apps, tools, and connections for your workspace."
                                                : "Reusable instructions for the way you work."}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() =>
                                            simulate(
                                                destination === "Skills"
                                                    ? "Skill import selected"
                                                    : "Plugin discovery selected"
                                            )
                                        }
                                    >
                                        {destination === "Skills" ? "Import skill" : "Explore plugins"}
                                    </button>
                                </div>
                                <div className="parity-tabs">
                                    {["Plugins", "Skills"].map((tab) => (
                                        <button
                                            key={tab}
                                            aria-pressed={destination === tab}
                                            onClick={() => navigate(tab as Destination)}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>
                                <div className="parity-plugin-grid">
                                    {(destination === "Plugins"
                                        ? PluginItems
                                        : [
                                              {
                                                  name: "Writing",
                                                  detail: "Clear drafts, edits, and revisions",
                                                  state: "Installed",
                                                  category: "Skill",
                                              },
                                              {
                                                  name: "Research",
                                                  detail: "Source-led investigation and reports",
                                                  state: "Installed",
                                                  category: "Skill",
                                              },
                                              {
                                                  name: "Create a skill",
                                                  detail: "Turn a repeatable process into instructions",
                                                  state: "Create",
                                                  category: "Skill",
                                              },
                                          ]
                                    ).map((item) => (
                                        <button key={item.name} onClick={() => setPlugin(item)}>
                                            <Box size={23} />
                                            <h2>{item.name}</h2>
                                            <p>{item.detail}</p>
                                            <small>{item.state}</small>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}
                        {destination === "Settings" && (
                            <section className="parity-settings">
                                <nav aria-label="Settings sections">
                                    {SettingsGroups.map((name) => (
                                        <button
                                            key={name}
                                            aria-current={setting === name ? "page" : undefined}
                                            onClick={() => setSetting(name)}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                </nav>
                                <div>
                                    <div className="parity-eyebrow">MAKE IT YOURS</div>
                                    <h1>{setting}</h1>
                                    <p className="parity-setting-intro">
                                        {setting === "General"
                                            ? "A few thoughtful defaults for your workspace."
                                            : "Explore the proposed controls for this section."}
                                    </p>
                                    {(setting === "General"
                                        ? ["Default destination", "Language", "Open canvas beside chat"]
                                        : setting === "Memory"
                                          ? ["Use saved preferences", "Project memory scope", "Manage saved memory"]
                                          : setting === "Connections"
                                            ? ["Connected accounts", "Permission review", "Reconnect an account"]
                                            : setting === "Data & privacy"
                                              ? ["Temporary conversations", "Export your data", "Manage stored data"]
                                              : setting === "Voice"
                                                ? ["Voice provider", "Voice", "Show transcript"]
                                                : setting === "Appearance"
                                                  ? ["Theme", "Accent", "Text size"]
                                                  : ["Preferences", "Review access", "Manage data"]
                                    ).map((label) => (
                                        <div className="parity-setting-row" key={label}>
                                            <span>{label}</span>
                                            <button onClick={() => simulate(setting + " / " + label)}>
                                                {label === "Default destination"
                                                    ? "Chat"
                                                    : label === "Theme"
                                                      ? "System"
                                                      : "Configure"}
                                                <ChevronDown size={13} />
                                            </button>
                                        </div>
                                    ))}
                                    <div className="parity-settings-note">
                                        Layout preview. Controls here do not change your settings or permissions.
                                    </div>
                                </div>
                            </section>
                        )}
                        {destination === "Canvas" && (
                            <section className="parity-canvas">
                                <div className="parity-canvas-heading">
                                    <div className="parity-eyebrow">THE SAME WORK, A WIDER VIEW</div>
                                    <h1>Your workspace canvas</h1>
                                    <p>Conversation and draft remain intact when you return to chat.</p>
                                </div>
                                <div className="parity-canvas-objects">
                                    <button onClick={() => navigate("Chat")}>
                                        <MessageSquareText size={22} />
                                        <h2>Current conversation</h2>
                                        <p>{draft || "Your draft stays here."}</p>
                                    </button>
                                    <button
                                        onClick={() => {
                                            navigate("Library");
                                            openEditor(LibraryItems[0]);
                                        }}
                                    >
                                        <FileText size={22} />
                                        <h2>Product story</h2>
                                        <p>Open the connected document</p>
                                    </button>
                                </div>
                            </section>
                        )}
                    </div>
                    {notice && (
                        <div className="parity-notice" role="status">
                            <span>{notice}</span>
                            <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
                                <X size={15} />
                            </button>
                        </div>
                    )}
                </main>
            </div>
            <input
                ref={input}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                    setAttachments((items) => [...items, ...Array.from(e.target.files ?? []).map((file) => file.name)]);
                    e.target.value = "";
                }}
            />
            {editor && (
                <div className="parity-modal-backdrop">
                    <section className="parity-editor" role="dialog" aria-modal="true" aria-label={editor.title}>
                        <header>
                            <FileText size={18} />
                            <strong>{editor.title}</strong>
                            <span className="parity-grow" />
                            <button
                                onClick={() => {
                                    if (history.length) {
                                        setFuture([editText, ...future]);
                                        setEditText(history[history.length - 1]);
                                        setHistory(history.slice(0, -1));
                                    }
                                }}
                                disabled={!history.length}
                            >
                                Undo
                            </button>
                            <button
                                onClick={() => {
                                    if (future.length) {
                                        setHistory([...history, editText]);
                                        setEditText(future[0]);
                                        setFuture(future.slice(1));
                                    }
                                }}
                                disabled={!future.length}
                            >
                                Redo
                            </button>
                            {editor.kind === "Code" && (
                                <button onClick={() => setSourceMode(!sourceMode)}>
                                    {sourceMode ? "Code" : "Preview"}
                                </button>
                            )}
                            <button onClick={() => simulate("Draft saved in this preview")}>Save</button>
                            <button aria-label="Close editor" onClick={() => setEditor(undefined)}>
                                <X size={18} />
                            </button>
                        </header>
                        {editor.kind === "Code" && sourceMode ? (
                            <div className="parity-rendered">
                                <h1>A little more room to think.</h1>
                                <p>Your workspace, connected.</p>
                                <small>Static example preview</small>
                            </div>
                        ) : (
                            <textarea
                                aria-label="Document content"
                                value={editText}
                                onChange={(e) => {
                                    setHistory([...history, editText]);
                                    setFuture([]);
                                    setEditText(e.target.value);
                                }}
                            />
                        )}
                        <footer>
                            <button
                                onClick={() => {
                                    setDraft("Revise this selected passage: " + window.getSelection()?.toString());
                                    setEditor(undefined);
                                    setDestination("Chat");
                                }}
                            >
                                Ask about selection
                            </button>
                            <span>Personal · Example document</span>
                            <button onClick={() => simulate("Sharing and access controls selected")}>Share</button>
                        </footer>
                    </section>
                </div>
            )}
            {plugin && (
                <div className="parity-modal-backdrop">
                    <section className="parity-plugin-detail" role="dialog" aria-modal="true" aria-label={plugin.name}>
                        <button
                            className="parity-close"
                            aria-label="Close details"
                            onClick={() => setPlugin(undefined)}
                        >
                            <X size={18} />
                        </button>
                        <Box size={30} />
                        <h1>{plugin.name}</h1>
                        <p>{plugin.detail}</p>
                        <hr />
                        <h2>{plugin.category === "Skill" ? "Instructions" : "Connection and access"}</h2>
                        <p>
                            {plugin.category === "Skill"
                                ? "Inspect and edit the instructions before using this skill."
                                : "Installation, account authorization, and tool permissions are separate steps."}
                        </p>
                        <div className="parity-setting-row">
                            <span>{plugin.category === "Skill" ? "Scope" : "Account"}</span>
                            <select aria-label="Connection account">
                                <option>Personal workspace</option>
                                <option>Choose another account</option>
                            </select>
                        </div>
                        <div className="parity-detail-actions">
                            <button
                                className="parity-primary"
                                onClick={() =>
                                    simulate(
                                        plugin.category === "Skill"
                                            ? "Skill editor selected"
                                            : "Connection flow selected"
                                    )
                                }
                            >
                                {plugin.category === "Skill" ? "Edit skill" : "Manage connection"}
                            </button>
                            <button onClick={() => simulate("Permissions selected")}>Review permissions</button>
                        </div>
                        <small>Illustrative state. No installation or authorization is performed.</small>
                    </section>
                </div>
            )}
        </div>
    );
}
