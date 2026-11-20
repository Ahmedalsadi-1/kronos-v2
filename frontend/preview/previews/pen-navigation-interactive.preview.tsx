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
    Pin,
    Plus,
    Search,
    Settings,
    SlidersHorizontal,
    X,
} from "@hermes/lib/icons";
import type { PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import "./pen-navigation-interactive.preview.css";

type Message = { role: "user" | "assistant"; text: string; files?: string[] };
type Chat = { id: string; title: string; project: string; pinned: boolean; messages: Message[] };
type Project = { id: string; name: string; instructions: string; sources: string[]; memory: string };
type Plugin = {
    id: string;
    name: string;
    description: string;
    installed: boolean;
    enabled: boolean;
    connected: boolean;
    permissions: string[];
};
type Panel =
    "history" | "projects" | "plugins" | "settings" | "skills" | "artifacts" | "scheduled" | "gaps" | "signin" | null;
const InitialChats: Chat[] = [
    { id: "current", title: "New chat", project: "personal", pinned: false, messages: [] },
    {
        id: "review",
        title: "Review the workspace",
        project: "kronos",
        pinned: true,
        messages: [
            { role: "user", text: "Keep the current workspace layout and improve access to projects." },
            {
                role: "assistant",
                text: "The navigation additions can sit beside Show chats. Your composer, tabs, and canvas stay in their existing positions.",
            },
        ],
    },
    {
        id: "launch",
        title: "Launch research",
        project: "launch",
        pinned: true,
        messages: [
            { role: "user", text: "Organize the launch research." },
            {
                role: "assistant",
                text: "Keep the sources and writing together in the Launch project. This is a sample conversation for the preview.",
            },
        ],
    },
    {
        id: "story",
        title: "Draft the product story",
        project: "launch",
        pinned: false,
        messages: [
            { role: "user", text: "Write a short product introduction." },
            {
                role: "assistant",
                text: "KronOS is a persistent workspace for conversations, tools, and the things you create together.",
            },
        ],
    },
];
const InitialProjects: Project[] = [
    { id: "personal", name: "Personal", instructions: "", sources: [], memory: "Default" },
    {
        id: "kronos",
        name: "KronOS",
        instructions: "Keep the existing KronOS v2 layout. Reuse current tools and surfaces.",
        sources: ["workspace-notes.md"],
        memory: "Project only",
    },
    {
        id: "launch",
        name: "Launch",
        instructions: "Write clearly. Keep source references with research.",
        sources: ["launch-brief.md", "audience-notes.txt"],
        memory: "Project only",
    },
];
const InitialPlugins: Plugin[] = [
    {
        id: "files",
        name: "Files",
        description: "Read, edit, and organize project files.",
        installed: true,
        enabled: true,
        connected: true,
        permissions: ["Read selected files", "Write with approval"],
    },
    {
        id: "browser",
        name: "Browser",
        description: "Search and interact with browser surfaces.",
        installed: true,
        enabled: true,
        connected: true,
        permissions: ["Read active page", "Ask before external actions"],
    },
    {
        id: "drive",
        name: "Drive",
        description: "Example of a connected app account.",
        installed: false,
        enabled: false,
        connected: false,
        permissions: ["Read selected documents"],
    },
];
const Prompts = [
    "Design a soft neumorphic meditation app inspired by Nordic winters",
    "Design a control panel for a humanoid robotics factory floor",
    "Design a clean SaaS dashboard for a solar energy monitoring startup",
    "Design an editorial portfolio for an avant-garde fashion photographer",
    "Plan a car-free weekend in Kyoto for two, with a rainy-day option",
    "Design a playful ordering app for matcha cakes",
];
const SettingSections = ["General", "Appearance", "Models", "Voice", "Memory", "Connections", "Browser", "Computers"];
const ExistingTools = [
    { name: "Skills", panel: "skills" },
    { name: "Artifacts", panel: "artifacts" },
    { name: "Scheduled jobs", panel: "scheduled" },
] as const;
const ExampleArtifacts = [
    {
        id: "brief",
        name: "Workspace brief.md",
        content:
            "# Workspace brief\n\nKeep the existing layout. Bring projects, plugins, and chat organization into reach.\n\nThe conversation and its outputs belong together.",
    },
    {
        id: "research",
        name: "Launch research.md",
        content:
            "# Launch research\n\n1. Gather sources\n2. Compare existing workflows\n3. Write a cited report\n\nSample content only.",
    },
];

export function PenNavigationInteractive() {
    const [scale, setScale] = useState(1);
    const [actual, setActual] = useState(false);
    const [showAdditions, setShowAdditions] = useState(true);
    const [menu, setMenu] = useState<"navigate" | "context" | "tools" | "run" | "views" | null>(null);
    const [panel, setPanel] = useState<Panel>(null);
    const [canvas, setCanvas] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [chats, setChats] = useState(InitialChats);
    const [chatId, setChatId] = useState("current");
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [files, setFiles] = useState<Record<string, string[]>>({});
    const [projects, setProjects] = useState(InitialProjects);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [projectTab, setProjectTab] = useState("Chats");
    const [newProject, setNewProject] = useState(false);
    const [projectName, setProjectName] = useState("");
    const [instructions, setInstructions] = useState("");
    const [plugins, setPlugins] = useState(InitialPlugins);
    const [pluginId, setPluginId] = useState<string | null>(null);
    const [pluginFilter, setPluginFilter] = useState("Installed");
    const [query, setQuery] = useState("");
    const [historyFilter, setHistoryFilter] = useState("All");
    const [sort, setSort] = useState("Recent");
    const [settingsSection, setSettingsSection] = useState("General");
    const [settings, setSettings] = useState<Record<string, string>>({
        "Default view": "Chat",
        Theme: "Dark",
        Model: "Current model",
        Voice: "Default",
        Memory: "Enabled",
        Permissions: "Ask first",
    });
    const [toast, setToast] = useState("");
    const [notification, setNotification] = useState(true);
    const [voice, setVoice] = useState(false);
    const [tabs, setTabs] = useState([
        { id: "chat", title: "New tab", type: "chat" },
        { id: "paint", title: "Kleki - Paint Tool", type: "paint" },
    ]);
    const [activeTab, setActiveTab] = useState("chat");
    const [skillEnabled, setSkillEnabled] = useState(true);
    const [skillText, setSkillText] = useState("Write concise, clear drafts. Preserve the user's intended meaning.");
    const [scheduled, setScheduled] = useState(true);
    const [artifactId, setArtifactId] = useState<string | null>(null);
    const [artifactTexts, setArtifactTexts] = useState<Record<string, string>>({});
    const [objects, setObjects] = useState([{ id: "note", x: 960, y: 460, text: "Workspace notes", kind: "note" }]);
    const [paintColor, setPaintColor] = useState("#a4b7ef");
    const [drawing, setDrawing] = useState(false);
    const viewport = useRef<HTMLDivElement>(null);
    const root = useRef<HTMLDivElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const sourceInput = useRef<HTMLInputElement>(null);
    const paint = useRef<HTMLCanvasElement>(null);
    const drag = useRef<{ id: string; px: number; py: number; x: number; y: number } | null>(null);
    const nextId = useRef(0);
    const chat = chats.find((item) => item.id === chatId)!;
    const project = projects.find((item) => item.id === projectId);
    const plugin = plugins.find((item) => item.id === pluginId);
    const draft = drafts[chatId] ?? "";
    const attachments = files[chatId] ?? [];
    const visibleChats = chats
        .filter(
            (item) =>
                item.title.toLowerCase().includes(query.toLowerCase()) && (historyFilter !== "Pinned" || item.pinned)
        )
        .sort((a, b) => (sort === "A–Z" ? a.title.localeCompare(b.title) : 0));
    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const measure = () => setScale(actual ? 1 : Math.min(1, element.clientWidth / 2617));
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        measure();
        return () => observer.disconnect();
    }, [actual]);
    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(""), 3500);
        return () => clearTimeout(timer);
    }, [toast]);
    useEffect(() => {
        const key = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setPanel(null);
                setMenu(null);
                setVoice(false);
            }
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, []);
    useEffect(() => {
        if (!panel) return;
        const container = root.current?.querySelector<HTMLElement>('[role="dialog"]');
        const controls = () =>
            Array.from(
                container?.querySelectorAll<HTMLElement>(
                    'button:not([disabled]),input,select,textarea,[tabindex="0"]'
                ) ?? []
            );
        controls()[0]?.focus();
        const trap = (event: KeyboardEvent) => {
            if (event.key !== "Tab") return;
            const items = controls();
            const first = items[0],
                last = items.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        };
        container?.addEventListener("keydown", trap);
        return () => container?.removeEventListener("keydown", trap);
    }, [panel]);
    const open = (next: Panel) => {
        setPanel(next);
        setMenu(null);
        setQuery("");
    };
    const pin = (id: string) =>
        setChats((items) => items.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item)));
    const selectChat = (id: string) => {
        setChatId(id);
        setPanel(null);
        setCanvas(false);
        setActiveTab("chat");
    };
    const createChat = (projectId = "personal") => {
        const id = "preview-" + ++nextId.current;
        setChats((items) => [{ id, title: "New chat", project: projectId, pinned: false, messages: [] }, ...items]);
        selectChat(id);
    };
    const setDraft = (text: string) => setDrafts((items) => ({ ...items, [chatId]: text }));
    const submit = () => {
        if (!draft.trim() && !attachments.length) return;
        const text = draft.trim() || "Review these files";
        setChats((items) =>
            items.map((item) =>
                item.id !== chatId
                    ? item
                    : {
                          ...item,
                          title: item.messages.length ? item.title : text.slice(0, 48),
                          messages: [
                              ...item.messages,
                              { role: "user", text, files: attachments },
                              {
                                  role: "assistant",
                                  text: "This is a local preview response. You can continue this conversation, pin it, find it in its project, or open the canvas. Your draft and attachments stay with their conversation.",
                              },
                          ],
                      }
            )
        );
        setDraft("");
        setFiles((items) => ({ ...items, [chatId]: [] }));
    };
    const projectOpen = (id: string) => {
        setProjectId(id);
        setProjectTab("Chats");
        setInstructions(projects.find((item) => item.id === id)?.instructions ?? "");
    };
    const updatePlugin = (patch: Partial<Plugin>) =>
        setPlugins((items) => items.map((item) => (item.id === pluginId ? { ...item, ...patch } : item)));
    const draw = (event: PointerEvent<HTMLCanvasElement>, start = false) => {
        const context = paint.current?.getContext("2d");
        if (!context) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) * event.currentTarget.width) / bounds.width,
            y = ((event.clientY - bounds.top) * event.currentTarget.height) / bounds.height;
        if (start) {
            context.beginPath();
            context.moveTo(x, y);
        } else if (drawing) {
            context.lineTo(x, y);
            context.strokeStyle = paintColor;
            context.lineWidth = 4;
            context.lineCap = "round";
            context.stroke();
        }
    };
    const panelTitle =
        panel === "history"
            ? "Chats"
            : panel === "projects"
              ? (project?.name ?? "Projects")
              : panel === "plugins"
                ? (plugin?.name ?? "Plugins")
                : panel === "settings"
                  ? "Settings"
                  : panel === "skills"
                    ? "Skills"
                    : panel === "artifacts"
                      ? "Artifacts"
                      : panel === "scheduled"
                        ? "Scheduled jobs"
                        : panel === "gaps"
                          ? "What is missing?"
                          : "Sign in";
    return (
        <div className="pen-interactive" ref={root}>
            <header className="pi-review">
                <span>
                    <strong>Interactive preview</strong>
                    <small>Reconstructed controls · local sample state · no live app connection</small>
                </span>
                <div>
                    <button
                        aria-pressed={showAdditions}
                        onClick={() => {
                            setShowAdditions(!showAdditions);
                            setMenu(null);
                        }}
                    >
                        {" "}
                        {showAdditions ? "Hide additions" : "Show additions"}
                    </button>
                    <button aria-pressed={!actual} onClick={() => setActual(false)}>
                        Fit
                    </button>
                    <button aria-pressed={actual} onClick={() => setActual(true)}>
                        100%
                    </button>
                    <button onClick={() => open("gaps")}>What is missing?</button>
                </div>
            </header>
            <div className="pi-viewport" ref={viewport}>
                <div style={{ width: 2617 * scale, height: 1361 * scale, position: "relative", margin: "0 auto" }}>
                    <div className="pi-stage" style={{ transform: `scale(${scale})` }}>
                        <div className="pi-window">
                            <header className="pi-titlebar">
                                <div className="pi-file">
                                    <span className="pi-traffic">
                                        <i />
                                        <i />
                                        <i />
                                    </span>
                                    <button onClick={() => open("artifacts")}>
                                        <FileText size={14} />
                                        untitled.pen
                                    </button>
                                </div>
                                <div className="pi-browser-tabs">
                                    {tabs.map((tab) => (
                                        <div key={tab.id} className={activeTab === tab.id ? "is-active" : ""}>
                                            <button
                                                onClick={() => {
                                                    setActiveTab(tab.id);
                                                    setCanvas(false);
                                                }}
                                            >
                                                <Globe size={15} />
                                                {tab.title}
                                            </button>
                                            {tab.id !== "chat" && (
                                                <button
                                                    aria-label={`Close ${tab.title}`}
                                                    onClick={() => {
                                                        setTabs((items) => items.filter((item) => item.id !== tab.id));
                                                        setActiveTab("chat");
                                                    }}
                                                >
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        aria-label="New widget tab"
                                        onClick={() => {
                                            const id = "tab-" + ++nextId.current;
                                            setTabs((items) => [...items, { id, title: "New tab", type: "empty" }]);
                                            setActiveTab(id);
                                        }}
                                    >
                                        <Plus size={16} />
                                    </button>
                                    <div className="pi-view-anchor">
                                        <button onClick={() => setMenu(menu === "views" ? null : "views")}>
                                            <Box size={14} />
                                            KronOS v2
                                            <ChevronDown size={12} />
                                        </button>
                                        {menu === "views" && (
                                            <div className="pi-menu pi-view-menu">
                                                <button
                                                    onClick={() => {
                                                        setCanvas(false);
                                                        setActiveTab("chat");
                                                        setMenu(null);
                                                    }}
                                                >
                                                    Chat
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setCanvas(true);
                                                        setActiveTab("chat");
                                                        setMenu(null);
                                                    }}
                                                >
                                                    Canvas
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <button className="pi-signin" onClick={() => open("signin")}>
                                        Sign In
                                    </button>
                                    <button aria-label="Settings" onClick={() => open("settings")}>
                                        <Settings size={16} />
                                    </button>
                                    <button
                                        aria-label="Mini Reviews"
                                        onClick={() => {
                                            setDraft("Review the current workspace design.");
                                            setActiveTab("chat");
                                        }}
                                    >
                                        <SlidersHorizontal size={16} />
                                    </button>
                                    <button aria-label="Widget side panel" onClick={() => open("artifacts")}>
                                        <Layers3 size={16} />
                                    </button>
                                </div>
                            </header>
                            <nav className="pi-sidebar-rail" aria-label="Sidebar shortcuts">
                                <button
                                    aria-label="Toggle sidebar"
                                    aria-expanded={sidebarOpen}
                                    aria-controls="preview-sidebar"
                                    onClick={() => setSidebarOpen(!sidebarOpen)}
                                >
                                    <Layers3 size={20} />
                                </button>
                                <button aria-label="New chat" onClick={() => createChat()}>
                                    <MessageSquareText size={20} />
                                </button>
                                <button
                                    aria-label="Recent chats"
                                    onClick={() => {
                                        setSidebarOpen(true);
                                        setHistoryFilter("All");
                                    }}
                                >
                                    <Clock size={20} />
                                </button>
                                <button
                                    aria-label="Projects"
                                    onClick={() => {
                                        setProjectId(null);
                                        open("projects");
                                    }}
                                >
                                    <FolderOpen size={20} />
                                </button>
                                {showAdditions && (
                                    <button
                                        aria-label="Plugins"
                                        onClick={() => {
                                            setPluginId(null);
                                            open("plugins");
                                        }}
                                    >
                                        <Box size={20} />
                                    </button>
                                )}
                                <span className="pi-rail-spacer" />
                                <button aria-label="Settings" onClick={() => open("settings")}>
                                    <Settings size={20} />
                                </button>
                            </nav>
                            {!sidebarOpen && (
                                <button
                                    className="pi-collapsed-canvas pi-open-canvas"
                                    onClick={() => {
                                        setCanvas(!canvas);
                                        setActiveTab("chat");
                                    }}
                                >
                                    ← {canvas ? "Open chat" : "Open canvas"}
                                </button>
                            )}
                            {sidebarOpen && (
                                <aside id="preview-sidebar" className="pi-docked-sidebar" aria-label="Chat sidebar">
                                    <header>
                                        <button
                                            className="pi-open-canvas"
                                            onClick={() => {
                                                setCanvas(!canvas);
                                                setActiveTab("chat");
                                            }}
                                        >
                                            ← {canvas ? "Open chat" : "Open canvas"}
                                        </button>
                                        <button aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}>
                                            <Layers3 size={16} />
                                        </button>
                                    </header>
                                    <div className="pi-sidebar-scroll">
                                        <div className="pi-sidebar-heading">
                                            <strong>Chat history</strong>
                                            <button onClick={() => createChat()}>
                                                <Plus size={13} /> New
                                            </button>
                                        </div>
                                        <nav className="pi-sidebar-destinations" aria-label="Chat navigation">
                                            {ExistingTools.map((tool) => (
                                                <button key={tool.name} onClick={() => open(tool.panel)}>
                                                    <FileText size={14} />
                                                    {tool.name}
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => {
                                                    setProjectId(null);
                                                    open("projects");
                                                }}
                                            >
                                                <FolderOpen size={14} />
                                                Project rooms
                                            </button>
                                            {showAdditions && (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            setPluginId(null);
                                                            open("plugins");
                                                        }}
                                                    >
                                                        <Box size={14} />
                                                        Plugins
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            setHistoryFilter(
                                                                historyFilter === "Pinned" ? "All" : "Pinned"
                                                            )
                                                        }
                                                        aria-pressed={historyFilter === "Pinned"}
                                                    >
                                                        <Pin size={14} />
                                                        Pinned chats
                                                    </button>
                                                </>
                                            )}
                                        </nav>
                                        <input
                                            className="pi-sidebar-search"
                                            aria-label="Search sidebar chats"
                                            placeholder="Search chats..."
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                        />
                                        <div className="pi-sidebar-heading pi-sidebar-muted">
                                            <span>Kron Agent sessions</span>
                                            <select
                                                aria-label="Sort sidebar chats"
                                                value={sort}
                                                onChange={(e) => setSort(e.target.value)}
                                            >
                                                <option>Recent</option>
                                                <option>A–Z</option>
                                            </select>
                                        </div>
                                        <div className="pi-sidebar-chats">
                                            {visibleChats.map((item) => (
                                                <div key={item.id} className={item.id === chatId ? "is-selected" : ""}>
                                                    <button onClick={() => selectChat(item.id)}>{item.title}</button>
                                                    <button
                                                        aria-label={`${item.pinned ? "Unpin" : "Pin"} ${item.title}`}
                                                        aria-pressed={item.pinned}
                                                        onClick={() => pin(item.id)}
                                                    >
                                                        <Pin size={13} />
                                                    </button>
                                                </div>
                                            ))}
                                            {!visibleChats.length && <p>No matching chats</p>}
                                        </div>
                                        {showAdditions && (
                                            <div className="pi-sidebar-projects">
                                                {projects
                                                    .filter((p) => p.id !== "personal")
                                                    .map((p) => (
                                                        <div key={p.id}>
                                                            <button
                                                                onClick={() => {
                                                                    projectOpen(p.id);
                                                                    open("projects");
                                                                }}
                                                            >
                                                                <FolderOpen size={15} />
                                                                {p.name}
                                                            </button>
                                                            {chats
                                                                .filter((c) => c.project === p.id)
                                                                .map((c) => (
                                                                    <button
                                                                        className="pi-project-chat"
                                                                        key={c.id}
                                                                        onClick={() => selectChat(c.id)}
                                                                    >
                                                                        {c.title}
                                                                    </button>
                                                                ))}
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                </aside>
                            )}
                            {notification && (
                                <aside className="pi-notification">
                                    <span>△</span>
                                    <div>
                                        <strong>MCP server needs re-authentication</strong>
                                        <p>canva MCP needs re-authentication.</p>
                                        <button onClick={() => open("signin")}>Sign in</button>
                                    </div>
                                    <button aria-label="Dismiss notification" onClick={() => setNotification(false)}>
                                        <X size={14} />
                                    </button>
                                </aside>
                            )}
                            {activeTab === "chat" && !canvas && (
                                <>
                                    {chat.messages.length === 0 ? (
                                        <section className="pi-start">
                                            <strong>Ask me to design anything</strong>
                                            <div className="pi-prompts">
                                                {Prompts.map((prompt) => (
                                                    <button key={prompt} onClick={() => setDraft(prompt)}>
                                                        {prompt}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="pi-start-help">
                                                <strong>Generate code</strong>
                                                <p>
                                                    Ask the agent to generate code you can copy to your project.
                                                    <br />
                                                    For an HTML file, select a frame and click “Export HTML” in the
                                                    properties panel.
                                                </p>
                                                <strong>Attach context files</strong>
                                                <p>Drop a PNG/JPG, DESIGN.md or any text file here or attach via +</p>
                                            </div>
                                        </section>
                                    ) : (
                                        <section className="pi-transcript">
                                            {chat.messages.map((message, index) => (
                                                <article className={message.role} key={index}>
                                                    <small>
                                                        {message.role === "user" ? "You" : "KronOS Agent · Preview"}
                                                    </small>
                                                    <p>{message.text}</p>
                                                    {message.files?.map((name, i) => (
                                                        <span className="pi-file-chip" key={i}>
                                                            <FileText size={13} />
                                                            {name}
                                                        </span>
                                                    ))}
                                                    {message.role === "assistant" && (
                                                        <button
                                                            onClick={() => {
                                                                setArtifactId("brief");
                                                                open("artifacts");
                                                            }}
                                                        >
                                                            Open sample artifact →
                                                        </button>
                                                    )}
                                                </article>
                                            ))}
                                        </section>
                                    )}
                                    <section className="pi-composer" aria-label="Chat composer">
                                        {voice && (
                                            <div className="pi-voice">
                                                <AudioLines size={18} />
                                                <span>Voice preview · microphone is off</span>
                                                <button onClick={() => setVoice(false)}>End</button>
                                            </div>
                                        )}
                                        {attachments.length > 0 && (
                                            <div className="pi-files">
                                                {attachments.map((name, index) => (
                                                    <span className="pi-file-chip" key={index}>
                                                        <FileText size={13} />
                                                        {name}
                                                        <button
                                                            aria-label={`Remove ${name}`}
                                                            onClick={() =>
                                                                setFiles((items) => ({
                                                                    ...items,
                                                                    [chatId]: attachments.filter((_, i) => i !== index),
                                                                }))
                                                            }
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <textarea
                                            aria-label="Message"
                                            value={draft}
                                            placeholder="Create, plan or research... @ to attach, / for skills"
                                            onChange={(e) => setDraft(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    submit();
                                                }
                                            }}
                                        />
                                        <div className="pi-composer-row">
                                            <div className="pi-tool-anchor">
                                                <button
                                                    aria-label="Add to context"
                                                    onClick={() => setMenu(menu === "context" ? null : "context")}
                                                >
                                                    <Plus size={16} />
                                                </button>
                                                {menu === "context" && (
                                                    <div className="pi-menu pi-above">
                                                        <button
                                                            onClick={() => {
                                                                setMenu(null);
                                                                fileInput.current?.click();
                                                            }}
                                                        >
                                                            Attach files
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setDraft(draft + "@Files ");
                                                                setMenu(null);
                                                            }}
                                                        >
                                                            Mention files
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setDraft(draft + "@Browser ");
                                                                setMenu(null);
                                                            }}
                                                        >
                                                            Mention browser
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <span className="pi-spacer" />
                                            <div className="pi-tool-anchor">
                                                <button
                                                    aria-label="Hermes chat tools"
                                                    onClick={() => setMenu(menu === "tools" ? null : "tools")}
                                                >
                                                    <SlidersHorizontal size={15} />
                                                </button>
                                                {menu === "tools" && (
                                                    <div className="pi-menu pi-above">
                                                        {ExistingTools.map((tool) => (
                                                            <button key={tool.name} onClick={() => open(tool.panel)}>
                                                                {tool.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                aria-label="Choose sandbox computer"
                                                onClick={() => {
                                                    setSettingsSection("Computers");
                                                    open("settings");
                                                }}
                                            >
                                                <Box size={15} />
                                            </button>
                                            <button
                                                aria-label="Voice dictation"
                                                onClick={() => {
                                                    setDraft(draft + "Help me organize this workspace.");
                                                    setToast("Sample dictation inserted. No microphone accessed.");
                                                }}
                                            >
                                                <Mic size={14} />
                                            </button>
                                            <button
                                                aria-label="Start voice conversation"
                                                onClick={() => setVoice(!voice)}
                                            >
                                                <AudioLines size={16} />
                                            </button>
                                            <div className="pi-tool-anchor">
                                                <button
                                                    aria-label="Run settings"
                                                    onClick={() => setMenu(menu === "run" ? null : "run")}
                                                >
                                                    <Globe size={15} />
                                                </button>
                                                {menu === "run" && (
                                                    <div className="pi-menu pi-above">
                                                        <label>
                                                            Model
                                                            <select
                                                                aria-label="Run model"
                                                                value={settings.Model}
                                                                onChange={(e) =>
                                                                    setSettings({ ...settings, Model: e.target.value })
                                                                }
                                                            >
                                                                <option>Current model</option>
                                                                <option>Fast model</option>
                                                                <option>Reasoning model</option>
                                                            </select>
                                                        </label>
                                                        <label>
                                                            Agents
                                                            <select aria-label="Agent count">
                                                                <option>1 agent</option>
                                                                <option>2 agents</option>
                                                                <option>3 agents</option>
                                                            </select>
                                                        </label>
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                aria-label="Model settings"
                                                onClick={() => {
                                                    setSettingsSection("Models");
                                                    open("settings");
                                                }}
                                            >
                                                <ChevronDown size={13} />
                                            </button>
                                            <button
                                                aria-label="Send message"
                                                className="pi-send"
                                                disabled={!draft.trim() && !attachments.length}
                                                onClick={submit}
                                            >
                                                <ArrowUp size={16} />
                                            </button>
                                        </div>
                                    </section>
                                </>
                            )}
                            {canvas && activeTab === "chat" && (
                                <section className="pi-canvas-surface">
                                    <div className="pi-canvas-toolbar">
                                        <button
                                            onClick={() =>
                                                setObjects((items) => [
                                                    ...items,
                                                    {
                                                        id: "object-" + ++nextId.current,
                                                        x: 750 + items.length * 60,
                                                        y: 350 + items.length * 40,
                                                        text: "New note",
                                                        kind: "note",
                                                    },
                                                ])
                                            }
                                        >
                                            + Sticky note
                                        </button>
                                        <button
                                            onClick={() =>
                                                setObjects((items) => [
                                                    ...items,
                                                    {
                                                        id: "object-" + ++nextId.current,
                                                        x: 900,
                                                        y: 400,
                                                        text: "Frame",
                                                        kind: "frame",
                                                    },
                                                ])
                                            }
                                        >
                                            + Frame
                                        </button>
                                        <span>Drag objects · local preview</span>
                                    </div>
                                    {objects.map((object) => (
                                        <div
                                            key={object.id}
                                            className={"pi-canvas-object " + object.kind}
                                            style={{ left: object.x, top: object.y }}
                                        >
                                            <button
                                                className="pi-drag-handle"
                                                onPointerDown={(e) => {
                                                    e.currentTarget.setPointerCapture(e.pointerId);
                                                    drag.current = {
                                                        id: object.id,
                                                        px: e.clientX,
                                                        py: e.clientY,
                                                        x: object.x,
                                                        y: object.y,
                                                    };
                                                }}
                                                onPointerMove={(e) => {
                                                    const d = drag.current;
                                                    if (!d || d.id !== object.id) return;
                                                    setObjects((items) =>
                                                        items.map((item) =>
                                                            item.id === d.id
                                                                ? {
                                                                      ...item,
                                                                      x: Math.max(0, d.x + (e.clientX - d.px) / scale),
                                                                      y: Math.max(0, d.y + (e.clientY - d.py) / scale),
                                                                  }
                                                                : item
                                                        )
                                                    );
                                                }}
                                                onPointerUp={() => (drag.current = null)}
                                            >
                                                ⋮⋮ Move
                                            </button>
                                            <button
                                                className="pi-object-close"
                                                aria-label={`Delete ${object.text}`}
                                                onClick={() =>
                                                    setObjects((items) => items.filter((item) => item.id !== object.id))
                                                }
                                            >
                                                <X size={13} />
                                            </button>
                                            <textarea
                                                aria-label="Canvas note"
                                                value={object.text}
                                                onChange={(e) =>
                                                    setObjects((items) =>
                                                        items.map((item) =>
                                                            item.id === object.id
                                                                ? { ...item, text: e.target.value }
                                                                : item
                                                        )
                                                    )
                                                }
                                            />
                                        </div>
                                    ))}
                                </section>
                            )}
                            {activeTab !== "chat" && (
                                <section className="pi-widget-surface">
                                    {tabs.find((tab) => tab.id === activeTab)?.type === "paint" ? (
                                        <>
                                            <div className="pi-paint-controls">
                                                <strong>Local drawing preview</strong>
                                                <label>
                                                    Color
                                                    <input
                                                        type="color"
                                                        value={paintColor}
                                                        onChange={(e) => setPaintColor(e.target.value)}
                                                    />
                                                </label>
                                                <button
                                                    onClick={() =>
                                                        paint.current?.getContext("2d")?.clearRect(0, 0, 1600, 800)
                                                    }
                                                >
                                                    Clear
                                                </button>
                                                <small>No external website loaded</small>
                                            </div>
                                            <canvas
                                                ref={paint}
                                                width={1600}
                                                height={800}
                                                onPointerDown={(e) => {
                                                    e.currentTarget.setPointerCapture(e.pointerId);
                                                    setDrawing(true);
                                                    draw(e, true);
                                                }}
                                                onPointerMove={(e) => draw(e)}
                                                onPointerUp={() => setDrawing(false)}
                                                onPointerCancel={() => setDrawing(false)}
                                            />
                                        </>
                                    ) : (
                                        <div className="pi-empty-tab">
                                            <Globe size={28} />
                                            <h2>New tab</h2>
                                            <p>Choose a local preview surface.</p>
                                            <button
                                                onClick={() => {
                                                    setCanvas(false);
                                                    setActiveTab("chat");
                                                }}
                                            >
                                                Open chat
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setCanvas(true);
                                                    setActiveTab("chat");
                                                }}
                                            >
                                                Open canvas
                                            </button>
                                        </div>
                                    )}
                                </section>
                            )}
                            {toast && (
                                <div className="pi-toast" role="status">
                                    {toast}
                                </div>
                            )}
                            {panel && (
                                <div
                                    className={"pi-panel-cover " + (panel === "history" ? "is-history" : "")}
                                    onPointerDown={(e) => {
                                        if (e.target === e.currentTarget) setPanel(null);
                                    }}
                                >
                                    <section
                                        className={"pi-dialog " + (panel === "history" ? "pi-history" : "")}
                                        role="dialog"
                                        aria-modal="true"
                                        aria-label={panelTitle}
                                    >
                                        <header>
                                            <div>
                                                {panel === "projects" && project && (
                                                    <button
                                                        aria-label="Back to projects"
                                                        onClick={() => setProjectId(null)}
                                                    >
                                                        ←
                                                    </button>
                                                )}
                                                {panel === "plugins" && plugin && (
                                                    <button
                                                        aria-label="Back to plugins"
                                                        onClick={() => setPluginId(null)}
                                                    >
                                                        ←
                                                    </button>
                                                )}
                                                <h2>{panelTitle}</h2>
                                            </div>
                                            <button aria-label="Close panel" onClick={() => setPanel(null)}>
                                                <X size={18} />
                                            </button>
                                        </header>
                                        <div className="pi-dialog-body">
                                            {panel === "history" && (
                                                <>
                                                    <div className="pi-search">
                                                        <Search size={16} />
                                                        <input
                                                            aria-label="Search chats"
                                                            placeholder="Search chats"
                                                            value={query}
                                                            onChange={(e) => setQuery(e.target.value)}
                                                        />
                                                        <button aria-label="New chat" onClick={() => createChat()}>
                                                            <Plus size={17} />
                                                        </button>
                                                    </div>
                                                    <div className="pi-filter-row">
                                                        {["All", "Pinned"].map((value) => (
                                                            <button
                                                                key={value}
                                                                aria-pressed={historyFilter === value}
                                                                onClick={() => setHistoryFilter(value)}
                                                            >
                                                                {value}
                                                            </button>
                                                        ))}
                                                        <select
                                                            aria-label="Sort chats"
                                                            value={sort}
                                                            onChange={(e) => setSort(e.target.value)}
                                                        >
                                                            <option>Recent</option>
                                                            <option>A–Z</option>
                                                        </select>
                                                    </div>
                                                    <div className="pi-chat-list">
                                                        {visibleChats.map((item) => (
                                                            <div key={item.id}>
                                                                <button onClick={() => selectChat(item.id)}>
                                                                    <span>{item.title}</span>
                                                                    <small>
                                                                        {projects.find((p) => p.id === item.project)
                                                                            ?.name ?? "Personal"}
                                                                    </small>
                                                                </button>
                                                                <button
                                                                    aria-label={`${item.pinned ? "Unpin" : "Pin"} ${item.title}`}
                                                                    aria-pressed={item.pinned}
                                                                    onClick={() => pin(item.id)}
                                                                >
                                                                    <Pin size={15} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                        {!visibleChats.length && (
                                                            <p className="pi-empty">No matching chats</p>
                                                        )}
                                                    </div>
                                                    <footer className="pi-history-tools">
                                                        {ExistingTools.map((tool) => (
                                                            <button key={tool.name} onClick={() => open(tool.panel)}>
                                                                {tool.name}
                                                            </button>
                                                        ))}
                                                    </footer>
                                                </>
                                            )}
                                            {panel === "projects" && !project && (
                                                <>
                                                    <div className="pi-section-heading">
                                                        <p>Your project conversations and context.</p>
                                                        <button onClick={() => setNewProject(!newProject)}>
                                                            <Plus size={15} />
                                                            New project
                                                        </button>
                                                    </div>
                                                    {newProject && (
                                                        <form
                                                            className="pi-inline-form"
                                                            onSubmit={(e) => {
                                                                e.preventDefault();
                                                                if (!projectName.trim()) return;
                                                                const id = "project-" + ++nextId.current;
                                                                setProjects((items) => [
                                                                    ...items,
                                                                    {
                                                                        id,
                                                                        name: projectName.trim(),
                                                                        instructions: "",
                                                                        sources: [],
                                                                        memory: "Default",
                                                                    },
                                                                ]);
                                                                setProjectName("");
                                                                setNewProject(false);
                                                                setProjectId(id);
                                                                setInstructions("");
                                                                setProjectTab("Chats");
                                                            }}
                                                        >
                                                            <input
                                                                autoFocus
                                                                aria-label="Project name"
                                                                placeholder="Project name"
                                                                value={projectName}
                                                                onChange={(e) => setProjectName(e.target.value)}
                                                            />
                                                            <button type="submit" disabled={!projectName.trim()}>
                                                                Create
                                                            </button>
                                                        </form>
                                                    )}
                                                    {projects.map((item) => (
                                                        <button
                                                            className="pi-destination-row"
                                                            key={item.id}
                                                            onClick={() => projectOpen(item.id)}
                                                        >
                                                            <FolderOpen size={20} />
                                                            <span>
                                                                {item.name}
                                                                <small>
                                                                    {chats.filter((c) => c.project === item.id).length}{" "}
                                                                    chats · {item.sources.length} sources
                                                                </small>
                                                            </span>
                                                            <span>→</span>
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                            {panel === "projects" && project && (
                                                <>
                                                    <div className="pi-filter-row">
                                                        {["Chats", "Sources", "Instructions", "Memory"].map((tab) => (
                                                            <button
                                                                key={tab}
                                                                aria-pressed={projectTab === tab}
                                                                onClick={() => setProjectTab(tab)}
                                                            >
                                                                {tab}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    {projectTab === "Chats" && (
                                                        <>
                                                            <button
                                                                className="pi-outline"
                                                                onClick={() => createChat(project.id)}
                                                            >
                                                                <Plus size={15} />
                                                                New project chat
                                                            </button>
                                                            {chats
                                                                .filter((item) => item.project === project.id)
                                                                .map((item) => (
                                                                    <button
                                                                        className="pi-destination-row"
                                                                        key={item.id}
                                                                        onClick={() => selectChat(item.id)}
                                                                    >
                                                                        <MessageSquareText size={17} />
                                                                        <span>{item.title}</span>
                                                                        <span>→</span>
                                                                    </button>
                                                                ))}
                                                            {!chats.some((item) => item.project === project.id) && (
                                                                <p className="pi-empty">
                                                                    No chats in this project yet.
                                                                </p>
                                                            )}
                                                        </>
                                                    )}
                                                    {projectTab === "Sources" && (
                                                        <>
                                                            <button
                                                                className="pi-outline"
                                                                onClick={() => sourceInput.current?.click()}
                                                            >
                                                                <Plus size={15} />
                                                                Add source
                                                            </button>
                                                            {project.sources.map((name, index) => (
                                                                <div className="pi-destination-row" key={index}>
                                                                    <FileText size={17} />
                                                                    <span>{name}</span>
                                                                    <button
                                                                        aria-label={`Remove source ${name}`}
                                                                        onClick={() =>
                                                                            setProjects((items) =>
                                                                                items.map((item) =>
                                                                                    item.id === project.id
                                                                                        ? {
                                                                                              ...item,
                                                                                              sources:
                                                                                                  item.sources.filter(
                                                                                                      (_, i) =>
                                                                                                          i !== index
                                                                                                  ),
                                                                                          }
                                                                                        : item
                                                                                )
                                                                            )
                                                                        }
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            <p className="pi-caption">
                                                                Filenames only in this preview. File contents are never
                                                                read or uploaded.
                                                            </p>
                                                        </>
                                                    )}
                                                    {projectTab === "Instructions" && (
                                                        <>
                                                            <label className="pi-field">
                                                                Project instructions
                                                                <textarea
                                                                    aria-label="Project instructions"
                                                                    value={instructions}
                                                                    onChange={(e) => setInstructions(e.target.value)}
                                                                    rows={7}
                                                                />
                                                            </label>
                                                            <button
                                                                className="pi-outline"
                                                                onClick={() => {
                                                                    setProjects((items) =>
                                                                        items.map((item) =>
                                                                            item.id === project.id
                                                                                ? { ...item, instructions }
                                                                                : item
                                                                        )
                                                                    );
                                                                    setToast("Project instructions saved in preview");
                                                                }}
                                                            >
                                                                Save instructions
                                                            </button>
                                                        </>
                                                    )}
                                                    {projectTab === "Memory" && (
                                                        <>
                                                            <label className="pi-field">
                                                                Memory scope
                                                                <select
                                                                    aria-label="Project memory scope"
                                                                    value={project.memory}
                                                                    onChange={(e) =>
                                                                        setProjects((items) =>
                                                                            items.map((item) =>
                                                                                item.id === project.id
                                                                                    ? {
                                                                                          ...item,
                                                                                          memory: e.target.value,
                                                                                      }
                                                                                    : item
                                                                            )
                                                                        )
                                                                    }
                                                                >
                                                                    <option>Default</option>
                                                                    <option>Project only</option>
                                                                </select>
                                                            </label>
                                                            <p className="pi-caption">
                                                                Proposed behavior to review. This control does not
                                                                enforce memory boundaries in the live app.
                                                            </p>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                            {panel === "plugins" && !plugin && (
                                                <>
                                                    <div className="pi-filter-row">
                                                        {["Installed", "Explore"].map((value) => (
                                                            <button
                                                                key={value}
                                                                aria-pressed={pluginFilter === value}
                                                                onClick={() => setPluginFilter(value)}
                                                            >
                                                                {value}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    {plugins
                                                        .filter((item) => pluginFilter === "Explore" || item.installed)
                                                        .map((item) => (
                                                            <button
                                                                className="pi-destination-row"
                                                                key={item.id}
                                                                onClick={() => setPluginId(item.id)}
                                                            >
                                                                <Box size={22} />
                                                                <span>
                                                                    {item.name}
                                                                    <small>{item.description}</small>
                                                                </span>
                                                                <small>
                                                                    {item.installed
                                                                        ? item.enabled
                                                                            ? "Enabled"
                                                                            : "Disabled"
                                                                        : "Not installed"}
                                                                </small>
                                                                <span>→</span>
                                                            </button>
                                                        ))}
                                                    <p className="pi-caption">
                                                        Sample inventory. Installation, connection, and permission
                                                        states are independent.
                                                    </p>
                                                </>
                                            )}
                                            {panel === "plugins" && plugin && (
                                                <>
                                                    <p>{plugin.description}</p>
                                                    <div className="pi-setting-row">
                                                        <span>Installed</span>
                                                        <button
                                                            onClick={() =>
                                                                updatePlugin({
                                                                    installed: !plugin.installed,
                                                                    enabled: !plugin.installed,
                                                                })
                                                            }
                                                        >
                                                            {plugin.installed ? "Uninstall" : "Install in preview"}
                                                        </button>
                                                    </div>
                                                    {plugin.installed && (
                                                        <>
                                                            <div className="pi-setting-row">
                                                                <label htmlFor="plugin-enabled">Enabled</label>
                                                                <input
                                                                    id="plugin-enabled"
                                                                    type="checkbox"
                                                                    checked={plugin.enabled}
                                                                    onChange={(e) =>
                                                                        updatePlugin({ enabled: e.target.checked })
                                                                    }
                                                                />
                                                            </div>
                                                            <div className="pi-setting-row">
                                                                <span>
                                                                    Account connection
                                                                    <small>
                                                                        {plugin.connected
                                                                            ? "Sample account connected"
                                                                            : "Disconnected"}
                                                                    </small>
                                                                </span>
                                                                <button
                                                                    onClick={() =>
                                                                        updatePlugin({ connected: !plugin.connected })
                                                                    }
                                                                >
                                                                    {plugin.connected
                                                                        ? "Disconnect"
                                                                        : "Connect sample account"}
                                                                </button>
                                                            </div>
                                                            <h3>Permissions</h3>
                                                            {plugin.permissions.map((permission) => (
                                                                <label className="pi-setting-row" key={permission}>
                                                                    {permission}
                                                                    <input type="checkbox" defaultChecked />
                                                                </label>
                                                            ))}
                                                        </>
                                                    )}
                                                    <p className="pi-caption">
                                                        These actions change local preview state only. No software is
                                                        installed, no OAuth flow runs, and no real permissions change.
                                                    </p>
                                                </>
                                            )}
                                            {panel === "settings" && (
                                                <div className="pi-settings-layout">
                                                    <nav>
                                                        {SettingSections.map((section) => (
                                                            <button
                                                                key={section}
                                                                aria-current={
                                                                    settingsSection === section ? "page" : undefined
                                                                }
                                                                onClick={() => setSettingsSection(section)}
                                                            >
                                                                {section}
                                                            </button>
                                                        ))}
                                                    </nav>
                                                    <div>
                                                        <h3>{settingsSection}</h3>
                                                        {(settingsSection === "General"
                                                            ? ["Default view"]
                                                            : settingsSection === "Appearance"
                                                              ? ["Theme"]
                                                              : settingsSection === "Models"
                                                                ? ["Model"]
                                                                : settingsSection === "Voice"
                                                                  ? ["Voice"]
                                                                  : settingsSection === "Memory"
                                                                    ? ["Memory"]
                                                                    : ["Permissions"]
                                                        ).map((name) => (
                                                            <label className="pi-setting-row" key={name}>
                                                                {name}
                                                                <select
                                                                    aria-label={name}
                                                                    value={settings[name]}
                                                                    onChange={(e) =>
                                                                        setSettings({
                                                                            ...settings,
                                                                            [name]: e.target.value,
                                                                        })
                                                                    }
                                                                >
                                                                    {(name === "Default view"
                                                                        ? ["Chat", "Canvas"]
                                                                        : name === "Theme"
                                                                          ? ["Dark", "System", "Light"]
                                                                          : name === "Model"
                                                                            ? [
                                                                                  "Current model",
                                                                                  "Fast model",
                                                                                  "Reasoning model",
                                                                              ]
                                                                            : name === "Voice"
                                                                              ? ["Default", "Calm", "Clear"]
                                                                              : name === "Memory"
                                                                                ? ["Enabled", "Disabled"]
                                                                                : ["Ask first", "Read only"]
                                                                    ).map((value) => (
                                                                        <option key={value}>{value}</option>
                                                                    ))}
                                                                </select>
                                                            </label>
                                                        ))}
                                                        <p className="pi-caption">
                                                            Selection is retained in this preview. Live settings and the
                                                            current UI stay unchanged.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                            {panel === "skills" && (
                                                <>
                                                    <div className="pi-setting-row">
                                                        <label htmlFor="writing-enabled">Writing skill</label>
                                                        <input
                                                            id="writing-enabled"
                                                            type="checkbox"
                                                            checked={skillEnabled}
                                                            onChange={(e) => setSkillEnabled(e.target.checked)}
                                                        />
                                                    </div>
                                                    <label className="pi-field">
                                                        Instructions
                                                        <textarea
                                                            rows={8}
                                                            value={skillText}
                                                            onChange={(e) => setSkillText(e.target.value)}
                                                        />
                                                    </label>
                                                    <button
                                                        className="pi-outline"
                                                        onClick={() => setToast("Skill instructions saved in preview")}
                                                    >
                                                        Save skill
                                                    </button>
                                                    <p className="pi-caption">
                                                        Existing Skills destination, represented with a local sample.
                                                    </p>
                                                </>
                                            )}
                                            {panel === "artifacts" && (
                                                <>
                                                    {artifactId ? (
                                                        <>
                                                            <button onClick={() => setArtifactId(null)}>
                                                                ← All artifacts
                                                            </button>
                                                            <label className="pi-field">
                                                                {
                                                                    ExampleArtifacts.find(
                                                                        (item) => item.id === artifactId
                                                                    )?.name
                                                                }
                                                                <textarea
                                                                    rows={12}
                                                                    aria-label="Artifact content"
                                                                    value={
                                                                        artifactTexts[artifactId] ??
                                                                        ExampleArtifacts.find(
                                                                            (item) => item.id === artifactId
                                                                        )?.content ??
                                                                        ""
                                                                    }
                                                                    onChange={(e) =>
                                                                        setArtifactTexts({
                                                                            ...artifactTexts,
                                                                            [artifactId]: e.target.value,
                                                                        })
                                                                    }
                                                                />
                                                            </label>
                                                            <button
                                                                className="pi-outline"
                                                                onClick={() => setToast("Artifact retained in preview")}
                                                            >
                                                                Save
                                                            </button>
                                                        </>
                                                    ) : (
                                                        ExampleArtifacts.map((item) => (
                                                            <button
                                                                className="pi-destination-row"
                                                                key={item.id}
                                                                onClick={() => setArtifactId(item.id)}
                                                            >
                                                                <FileText size={18} />
                                                                <span>
                                                                    {item.name}
                                                                    <small>Sample artifact</small>
                                                                </span>
                                                                <span>→</span>
                                                            </button>
                                                        ))
                                                    )}
                                                    <p className="pi-caption">
                                                        Existing Artifacts destination. Shared Library service is not
                                                        simulated as live.
                                                    </p>
                                                </>
                                            )}
                                            {panel === "scheduled" && (
                                                <>
                                                    <div className="pi-destination-row">
                                                        <Clock size={20} />
                                                        <span>
                                                            Weekly workspace review
                                                            <small>Monday, 9:00 AM · America/New_York</small>
                                                        </span>
                                                        <button onClick={() => setScheduled(!scheduled)}>
                                                            {scheduled ? "Pause" : "Resume"}
                                                        </button>
                                                    </div>
                                                    <p role="status">{scheduled ? "Active" : "Paused"} in preview</p>
                                                    <p className="pi-caption">
                                                        The real scheduled-jobs destination already exists. This does
                                                        not schedule a run.
                                                    </p>
                                                </>
                                            )}
                                            {panel === "gaps" && (
                                                <>
                                                    <div className="pi-gap-section">
                                                        <h3>Added navigation only</h3>
                                                        <p>
                                                            Projects, Plugins, and pinned chat filters inside a
                                                            collapsible left sidebar. The icon rail stays visible when
                                                            closed. The existing composer and workspace stay in place.
                                                        </p>
                                                    </div>
                                                    <div className="pi-gap-section">
                                                        <h3>Already available — reuse</h3>
                                                        <p>
                                                            Show chats, session search, Skills, Artifacts, Scheduled
                                                            jobs, model settings, voice controls, canvas, and widget
                                                            tabs.
                                                        </p>
                                                    </div>
                                                    <div className="pi-gap-section">
                                                        <h3>Separate feature work</h3>
                                                        <p>
                                                            Cross-content search, shared editable pages, real
                                                            project-memory enforcement, temporary-chat retention,
                                                            app-account authorization, and mobile camera/screen sharing
                                                            need separate contracts. The navigation preview does not
                                                            implement these services.
                                                        </p>
                                                    </div>
                                                    <p className="pi-caption">
                                                        Every screen here is rendered with HTML and React. No screenshot
                                                        background, live Pen iframe, Electron API, gateway, or agent is
                                                        used.
                                                    </p>
                                                </>
                                            )}
                                            {panel === "signin" && (
                                                <>
                                                    <h3>Account flow preview</h3>
                                                    <p>
                                                        The screenshot’s sign-in control is preserved here. This
                                                        isolated preview does not collect credentials or contact an
                                                        authentication service.
                                                    </p>
                                                    <button
                                                        className="pi-outline"
                                                        onClick={() => {
                                                            setNotification(false);
                                                            setPanel(null);
                                                            setToast(
                                                                "Sample reconnection completed — no real account changed"
                                                            );
                                                        }}
                                                    >
                                                        <Check size={16} />
                                                        Simulate successful reconnection
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                        <footer className="pi-dialog-footer">
                                            Local preview · Changes last until this page is reloaded
                                        </footer>
                                    </section>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <input
                ref={fileInput}
                hidden
                type="file"
                multiple
                onChange={(e) => {
                    const names = Array.from(e.target.files ?? []).map((file) => file.name);
                    setFiles((items) => ({ ...items, [chatId]: [...attachments, ...names] }));
                    e.target.value = "";
                }}
            />
            <input
                ref={sourceInput}
                hidden
                type="file"
                multiple
                onChange={(e) => {
                    const names = Array.from(e.target.files ?? []).map((file) => file.name);
                    setProjects((items) =>
                        items.map((item) =>
                            item.id === projectId ? { ...item, sources: [...item.sources, ...names] } : item
                        )
                    );
                    e.target.value = "";
                }}
            />
        </div>
    );
}
