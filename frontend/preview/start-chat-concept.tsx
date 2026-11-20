// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { BorderBeam } from "border-beam";
import {
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    AudioLines,
    Bot,
    Check,
    ChevronDown,
    Circle,
    Clock3,
    Files,
    GitBranch,
    Globe,
    LayoutGrid,
    Mic,
    Monitor,
    PanelLeft,
    PanelRight,
    PanelsTopLeft,
    Paperclip,
    Plus,
    Rocket,
    RotateCcw,
    Search,
    Settings2,
    SlidersHorizontal,
    Smartphone,
    Sparkles,
    Terminal,
    Type,
    X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import kronosLogo from "../../docs/static/img/logo/kronterm-icon.svg";
import "../app/tab/os-chat-start-motion.css";
import { ChromeBackground, makeChromeVariation } from "../app/tab/os-chat-start-visuals";
import "./start-chat-concept.css";

type Intent = "auto" | "chat" | "search" | "canvas";
type Message = { role: "user" | "assistant"; text: string };
type Surface = {
    kind: "browser" | "search" | "terminal" | "files" | "device" | "changes" | "canvas";
    title: string;
    value?: string;
};
type Destination = { title: string; url: string };
type Attachment = { id: string; name: string; image?: string };
const Launchers = [
    { label: "Terminal", icon: Terminal, kind: "terminal" },
    { label: "Changes", icon: GitBranch, kind: "changes" },
    { label: "Files", icon: Files, kind: "files" },
    { label: "Android Emulator", icon: Smartphone, kind: "device" },
    { label: "iPhone Simulator", icon: Smartphone, kind: "device" },
    { label: "Sandbox VM", icon: Monitor, kind: "terminal" },
] as const;
const ExampleRecentSites: Destination[] = [
    { title: "Coffee — Wikipedia", url: "https://en.wikipedia.org/wiki/Coffee" },
    { title: "GitHub", url: "https://github.com" },
];
const SuggestedSites: Destination[] = [
    { title: "MDN Web Docs", url: "https://developer.mozilla.org" },
    { title: "Vite documentation", url: "https://vite.dev" },
];
const Suggestions = ["Plan a weekend in Kyoto", "Help me build a landing page", "Search the web for coffee brewing"];

function Tool({
    label,
    children,
    onClick,
    active = false,
}: {
    label: string;
    children: ReactNode;
    onClick?: () => void;
    active?: boolean;
}) {
    return (
        <button
            type="button"
            className="concept-tool"
            aria-label={label}
            title={label}
            aria-pressed={active}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function StartChatConcept() {
    const [action, setAction] = useState("");
    const [chrome, setChrome] = useState(makeChromeVariation);
    const [recentSites, setRecentSites] = useState<Destination[]>([]);
    const [draft, setDraft] = useState("");
    const [intent, setIntent] = useState<Intent>("auto");
    const [messages, setMessages] = useState<Message[]>([]);
    const [surface, setSurface] = useState<Surface>();
    const [sidebar, setSidebar] = useState(false);
    const [menu, setMenu] = useState("");
    const [model, setModel] = useState("Auto");
    const [computer, setComputer] = useState("Workspace");
    const [voice, setVoice] = useState(false);
    const [dictation, setDictation] = useState(false);
    const [sideAgent, setSideAgent] = useState(false);
    const [largeText, setLargeText] = useState(false);
    const [thinking, setThinking] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const input = useRef<HTMLTextAreaElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const replyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const imageUrls = useRef<string[]>([]);
    const text = draft.trim();
    const isUrl = /^(https?:\/\/|localhost[:/]|[^\s]+\.[a-z]{2,}(?:[:/]|$))/i.test(text);
    const effective = intent === "auto" ? (isUrl ? "navigate" : "chat") : intent;
    const expanded = Boolean(text || attachments.length || voice);
    const matchingDestinations = (items: Destination[], category = "") => {
        const query = text.toLowerCase().replace(/^https?:\/\//, "");
        return items.filter((item) => `${category} ${item.title} ${item.url}`.toLowerCase().includes(query));
    };
    const localServers = matchingDestinations(
        [
            { title: "Start page concept · running", url: window.location.origin },
            { title: "Development app · example", url: "http://localhost:3000" },
            { title: "Vite project · example", url: "http://localhost:5173" },
        ],
        "local localhost 127.0.0.1"
    );
    const shownRecents = matchingDestinations(recentSites.length ? recentSites : ExampleRecentSites);
    const suggestedSites = matchingDestinations(SuggestedSites);
    const inChat = messages.length > 0;
    const activeTitle = surface?.title ?? (inChat ? messages[0].text.slice(0, 29) : "New tab");

    useEffect(
        () => () => {
            clearTimeout(replyTimer.current);
            imageUrls.current.forEach((url) => URL.revokeObjectURL(url));
        },
        []
    );
    useEffect(() => {
        const dismiss = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setMenu("");
                setVoice(false);
            }
        };
        window.addEventListener("keydown", dismiss);
        return () => window.removeEventListener("keydown", dismiss);
    }, []);

    const reset = () => {
        setAction("");
        setChrome(makeChromeVariation());
        clearTimeout(replyTimer.current);
        setDraft("");
        setIntent("auto");
        setMessages([]);
        setSurface(undefined);
        setAttachments([]);
        setVoice(false);
        setThinking(false);
        setMenu("");
        imageUrls.current.forEach((url) => URL.revokeObjectURL(url));
        imageUrls.current = [];
        input.current?.focus();
    };
    const fill = (value: string, mode: Intent = "auto") => {
        setDraft(value);
        setIntent(mode);
        input.current?.focus();
    };
    const submit = (mode = effective) => {
        if (!text || thinking) return;
        setMenu("");
        setAction(mode === "navigate" || mode === "search" ? "browser" : mode === "canvas" ? "canvas" : "task");
        if (mode === "navigate") {
            const value = /^https?:\/\//i.test(text) ? text : `https://${text}`;
            openDestination({ title: text.replace(/^https?:\/\//, ""), url: value });
            setDraft("");
            setIntent("auto");
            return;
        }
        if (mode === "search") {
            setSurface({ kind: "search", title: `Search · ${text}`, value: text });
            setDraft("");
            setIntent("auto");
            return;
        }
        if (mode === "canvas") {
            setSurface({ kind: "canvas", title: "Canvas", value: text });
        }
        setMessages((rows) => [
            ...rows,
            {
                role: "user",
                text:
                    text +
                    (attachments.length
                        ? `\n${attachments.length} attachment${attachments.length > 1 ? "s" : ""}`
                        : ""),
            },
        ]);
        setDraft("");
        setAttachments([]);
        setIntent("auto");
        setVoice(false);
        setThinking(true);
        replyTimer.current = setTimeout(() => {
            setMessages((rows) => [
                ...rows,
                {
                    role: "assistant",
                    text:
                        mode === "canvas"
                            ? "I’ve opened a concept canvas beside our conversation. Your prompt is the starting note; you can edit it in the preview. Nothing is connected to your workspace."
                            : /kyoto|trip|weekend/i.test(text)
                              ? "Let’s shape this around the kind of weekend you want. We could start with a quiet morning in Higashiyama, a walk along the river, and an evening food stop.\n\nWould you like a relaxed itinerary, or one with more places to explore?"
                              : "Your start page has become the conversation. The same field is now your reply composer, with your tools one keystroke away.\n\nWe can keep talking here, or open a browser, file, or terminal alongside the chat.",
                },
            ]);
            setThinking(false);
        }, 700);
    };
    const openDestination = (destination: Destination) => {
        setSurface({ kind: "browser", title: destination.title, value: destination.url });
        setRecentSites((current) =>
            [destination, ...current.filter((item) => item.url !== destination.url)].slice(0, 5)
        );
        setDraft("");
        setIntent("auto");
        setMenu("");
    };
    const toggleMenu = (name: string) => setMenu((current) => (current === name ? "" : name));

    return (
        <div className={`concept-shell ${sidebar ? "with-sidebar" : ""}`}>
            <header className="concept-titlebar">
                <div className="concept-brand">
                    <div className="concept-traffic">
                        <i />
                        <i />
                        <i />
                    </div>
                    <LayoutGrid size={14} />
                    <span>untitled.pen</span>
                    <Tool label="Toggle sessions sidebar" onClick={() => setSidebar(!sidebar)} active={sidebar}>
                        <PanelLeft size={15} />
                    </Tool>
                </div>
                <nav className="concept-tabs" aria-label="Workspace tabs">
                    <button className="selected" onClick={reset}>
                        <Globe size={14} />
                        <span>{activeTitle}</span>
                        {(surface || inChat) && <X size={13} />}
                    </button>
                    <button
                        onClick={() =>
                            setSurface({
                                kind: "browser",
                                title: "Coffee — Wikipedia",
                                value: "https://en.wikipedia.org/wiki/Coffee",
                            })
                        }
                    >
                        <Globe size={14} />
                        <span>Coffee — Wikipedia</span>
                        <X size={13} />
                    </button>
                    <button onClick={() => setSurface({ kind: "terminal", title: "Terminal" })}>
                        <Terminal size={14} />
                        <span>Terminal</span>
                        <X size={13} />
                    </button>
                    <Tool label="New tab" onClick={reset}>
                        <Plus size={17} />
                    </Tool>
                </nav>
                <div className="concept-window-tools">
                    <span className="concept-avatar">A</span>
                    <span className="concept-account">Workspace</span>
                    <Tool label="Concept settings" onClick={() => toggleMenu("settings")}>
                        <Settings2 size={15} />
                    </Tool>
                    <Tool
                        label="Toggle media preview"
                        onClick={() =>
                            setSurface(
                                surface
                                    ? undefined
                                    : { kind: "browser", title: "Browser", value: "https://example.com" }
                            )
                        }
                    >
                        <PanelRight size={16} />
                    </Tool>
                </div>
            </header>
            {sidebar && (
                <aside className="concept-sidebar">
                    <div className="concept-side-heading">Workspace</div>
                    <button onClick={reset}>
                        <Plus size={15} />
                        New tab
                    </button>
                    <button
                        onClick={() =>
                            setSurface({
                                kind: "browser",
                                title: "Coffee — Wikipedia",
                                value: "https://en.wikipedia.org/wiki/Coffee",
                            })
                        }
                    >
                        <Globe size={15} />
                        Coffee — Wikipedia
                    </button>
                    <div className="concept-side-heading">Chats</div>
                    <button onClick={() => fill("Plan a weekend in Kyoto")}>
                        <Sparkles size={15} />
                        Weekend in Kyoto
                    </button>
                    <button onClick={() => fill("Help me build a landing page")}>
                        <Sparkles size={15} />A new idea
                    </button>
                    <div className="concept-side-footer">
                        <span className="concept-avatar">A</span>Personal workspace
                    </div>
                </aside>
            )}
            <main
                data-start-action={action || undefined}
                className={`concept-workspace ${inChat ? "is-conversation" : ""} ${surface ? "has-media" : ""}`}
            >
                {!inChat && !surface && <ChromeBackground variation={chrome} />}
                <section
                    className={`concept-main ${inChat ? "chatting" : ""} ${surface && !inChat ? "over-media" : ""}`}
                    aria-label={inChat ? "Conversation" : "New tab start page"}
                >
                    {inChat && (
                        <div className="concept-thread">
                            <div className="concept-thread-heading">
                                <span>
                                    <Sparkles size={14} />
                                    New conversation
                                </span>
                                <button onClick={reset}>
                                    New chat <Plus size={13} />
                                </button>
                            </div>
                            {messages.map((message, index) => (
                                <article key={index} className={`concept-message ${message.role}`}>
                                    {message.role === "assistant" && (
                                        <div className="concept-assistant-label">
                                            <span className="concept-agent-dot" />
                                            KronOS
                                        </div>
                                    )}
                                    <div>{message.text}</div>
                                </article>
                            ))}
                            {thinking && (
                                <div className="concept-thinking">
                                    <span />
                                    <span />
                                    <span />
                                </div>
                            )}
                            {!thinking && messages.some((message) => message.role === "assistant") && (
                                <div className="concept-followups">
                                    <button
                                        onClick={() =>
                                            setSurface({
                                                kind: "browser",
                                                title: "Research",
                                                value: "https://example.com",
                                            })
                                        }
                                    >
                                        <Globe size={14} />
                                        Open a browser alongside
                                    </button>
                                    <button onClick={() => fill("Turn this into a plan")}>
                                        <Plus size={14} />
                                        Turn this into a plan
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    <div className={`concept-entry-area ${expanded ? "has-draft" : ""}`}>
                        {!inChat && !surface && (
                            <div className="concept-greeting">
                                <h1>
                                    <img src={kronosLogo} alt="KronOS logo" />
                                    OS is awake
                                </h1>
                                <p>With an active memory that evolves with every action to understand you better.</p>
                            </div>
                        )}
                        <div
                            className={`concept-composer ${expanded ? "expanded" : ""} ${voice ? "voice-active" : ""}`}
                        >
                            <BorderBeam
                                className="concept-border-beam"
                                size="md"
                                theme="dark"
                                colorVariant="ocean"
                                staticColors
                                duration={6}
                                strength={expanded ? 0.8 : 0.4}
                                saturation={0.65}
                                borderRadius={expanded && !inChat && !surface ? 12 : expanded ? 20 : 23}
                                aria-hidden="true"
                            >
                                <span />
                            </BorderBeam>
                            {attachments.length > 0 && (
                                <div className="concept-attachments">
                                    {attachments.map((file) => (
                                        <div key={file.id}>
                                            {file.image ? (
                                                <img src={file.image} alt={file.name} />
                                            ) : (
                                                <Paperclip size={14} />
                                            )}
                                            <span>{file.name}</span>
                                            <button
                                                aria-label={`Remove ${file.name}`}
                                                onClick={() =>
                                                    setAttachments((files) =>
                                                        files.filter((item) => item.id !== file.id)
                                                    )
                                                }
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {voice ? (
                                <div className="concept-voice">
                                    <span className="concept-orb" />
                                    <div>
                                        Voice preview<small>The microphone stays off in this concept.</small>
                                    </div>
                                    <button onClick={() => setVoice(false)}>Back to typing</button>
                                </div>
                            ) : (
                                <div className="concept-input-line">
                                    <span className="concept-input-icon">
                                        {expanded && effective === "chat" ? (
                                            <Sparkles size={19} />
                                        ) : (
                                            <Search size={19} />
                                        )}
                                    </span>
                                    <textarea
                                        ref={input}
                                        aria-label="Chat and search"
                                        placeholder={
                                            inChat
                                                ? "Reply, search, or open a page…"
                                                : "Ask anything, search, or enter a URL"
                                        }
                                        value={draft}
                                        rows={1}
                                        className={largeText ? "larger" : ""}
                                        onChange={(event) => {
                                            setDraft(event.target.value);
                                            if (!event.target.value) setIntent("auto");
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" && !event.shiftKey) {
                                                event.preventDefault();
                                                submit();
                                            }
                                        }}
                                    />
                                </div>
                            )}
                            {expanded && (
                                <div className="concept-expanded-controls">
                                    <div className="concept-composer-tools">
                                        <div className="concept-tool-start">
                                            <Tool
                                                label="Add context"
                                                active={menu === "context"}
                                                onClick={() => toggleMenu("context")}
                                            >
                                                <Plus size={17} />
                                            </Tool>
                                            <button
                                                className="concept-attach-button"
                                                onClick={() => fileInput.current?.click()}
                                            >
                                                <Paperclip size={14} />
                                                <span>Attach files</span>
                                            </button>
                                        </div>
                                        <div className="concept-tool-end">
                                            <Tool
                                                label="Chat tools and model"
                                                active={menu === "model"}
                                                onClick={() => toggleMenu("model")}
                                            >
                                                <SlidersHorizontal size={15} />
                                            </Tool>
                                            <Tool
                                                label="Text size"
                                                active={largeText}
                                                onClick={() => setLargeText(!largeText)}
                                            >
                                                <Type size={15} />
                                            </Tool>
                                            <Tool
                                                label="Side agent"
                                                active={sideAgent}
                                                onClick={() => setSideAgent(!sideAgent)}
                                            >
                                                <span className="concept-pi">π</span>
                                            </Tool>
                                            <Tool
                                                label="Choose computer"
                                                active={menu === "computer"}
                                                onClick={() => toggleMenu("computer")}
                                            >
                                                <Monitor size={15} />
                                            </Tool>
                                            <Tool
                                                label="Voice dictation preview"
                                                active={dictation}
                                                onClick={() => {
                                                    setDictation(!dictation);
                                                    toggleMenu("dictation");
                                                }}
                                            >
                                                <Mic size={15} />
                                            </Tool>
                                            <Tool
                                                label="Start voice conversation preview"
                                                onClick={() => setVoice(true)}
                                            >
                                                <AudioLines size={17} />
                                            </Tool>
                                            <Tool
                                                label="Run settings"
                                                active={menu === "run"}
                                                onClick={() => toggleMenu("run")}
                                            >
                                                <Rocket size={16} />
                                            </Tool>
                                            <Tool
                                                label="More chat actions"
                                                active={menu === "more"}
                                                onClick={() => toggleMenu("more")}
                                            >
                                                <ChevronDown size={14} />
                                            </Tool>
                                            <button
                                                className="concept-send"
                                                aria-label={
                                                    effective === "navigate"
                                                        ? "Open website"
                                                        : effective === "search"
                                                          ? "Search web"
                                                          : "Send message"
                                                }
                                                title="Enter to submit · Shift+Enter for a new line"
                                                disabled={!text || thinking}
                                                onClick={() => submit()}
                                            >
                                                <ArrowUp size={17} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {menu && menu !== "settings" && (
                                <div className="concept-popover" role="dialog" aria-label={menu + " controls"}>
                                    <div className="concept-popover-heading">
                                        {
                                            (
                                                {
                                                    model: "Agent & model",
                                                    computer: "Use a computer",
                                                    context: "Add context",
                                                    run: "Run settings",
                                                    more: "Chat actions",
                                                    dictation: "Dictation preview",
                                                } as Record<string, string>
                                            )[menu]
                                        }
                                        <button aria-label="Close controls" onClick={() => setMenu("")}>
                                            <X size={13} />
                                        </button>
                                    </div>
                                    {menu === "model" &&
                                        ["Auto", "Fast", "Thinking"].map((name) => (
                                            <button
                                                key={name}
                                                onClick={() => {
                                                    setModel(name);
                                                    setMenu("");
                                                }}
                                            >
                                                <Bot size={15} />
                                                <span>Hermes · {name}</span>
                                                {model === name && <Check size={14} />}
                                            </button>
                                        ))}
                                    {menu === "computer" &&
                                        ["Workspace", "Browser", "Terminal"].map((name) => (
                                            <button
                                                key={name}
                                                onClick={() => {
                                                    setComputer(name);
                                                    setMenu("");
                                                }}
                                            >
                                                <Monitor size={15} />
                                                <span>{name}</span>
                                                {computer === name && <Check size={14} />}
                                            </button>
                                        ))}
                                    {menu === "context" && (
                                        <>
                                            <button
                                                onClick={() => {
                                                    fileInput.current?.click();
                                                    setMenu("");
                                                }}
                                            >
                                                <Paperclip size={15} />
                                                Attach files
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setAttachments((files) => [
                                                        ...files,
                                                        { id: crypto.randomUUID(), name: "Current workspace" },
                                                    ]);
                                                    setMenu("");
                                                }}
                                            >
                                                <LayoutGrid size={15} />
                                                Current workspace
                                            </button>
                                        </>
                                    )}
                                    {menu === "run" && (
                                        <>
                                            <button
                                                onClick={() => {
                                                    setModel(model === "Thinking" ? "Auto" : "Thinking");
                                                }}
                                            >
                                                <Sparkles size={15} />
                                                <span>Extended thinking</span>
                                                {model === "Thinking" && <Check size={14} />}
                                            </button>
                                            <p>
                                                {sideAgent ? "Side agent included" : "One agent"} · {model} model
                                            </p>
                                        </>
                                    )}
                                    {menu === "more" && (
                                        <>
                                            <button onClick={reset}>
                                                <Plus size={15} />
                                                New conversation
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setDraft("");
                                                    setAttachments([]);
                                                    setMenu("");
                                                }}
                                            >
                                                <X size={15} />
                                                Clear draft
                                            </button>
                                        </>
                                    )}
                                    {menu === "dictation" && (
                                        <p>
                                            This button would dictate into the same field. This preview does not access
                                            your microphone.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        {Boolean(text) && !voice && (
                            <div className="concept-action-list" aria-label="Input action">
                                <button
                                    aria-pressed={effective === "search" || effective === "navigate"}
                                    onClick={() => {
                                        setIntent(isUrl ? "auto" : "search");
                                        submit(isUrl ? "navigate" : "search");
                                    }}
                                >
                                    <Search size={16} />
                                    <strong>{isUrl ? "Open website" : "Search on Google"}</strong>
                                    <span className="concept-action-query">{text}</span>
                                    {(effective === "search" || effective === "navigate") && (
                                        <span className="concept-action-enter">↵</span>
                                    )}
                                </button>
                                <div className="concept-task-row">
                                    <button
                                        aria-pressed={effective === "chat"}
                                        onClick={() => {
                                            setIntent("chat");
                                            submit("chat");
                                        }}
                                    >
                                        <img src={kronosLogo} alt="" />
                                        <strong>Run task</strong>
                                        <span className="concept-action-shortcut">↵</span>
                                    </button>
                                    <select
                                        aria-label="Task model"
                                        value={model}
                                        onChange={(event) => setModel(event.target.value)}
                                    >
                                        <option>Auto</option>
                                        <option>Fast</option>
                                        <option>Thinking</option>
                                    </select>
                                </div>
                                <button
                                    aria-pressed={effective === "canvas"}
                                    onClick={() => {
                                        setIntent("canvas");
                                        submit("canvas");
                                    }}
                                >
                                    <PanelsTopLeft size={16} />
                                    <strong>Ask in Canvas</strong>
                                    <span className="concept-action-query">{text}</span>
                                    {effective === "canvas" && <span className="concept-action-enter">↵</span>}
                                </button>
                            </div>
                        )}
                        <div className="concept-entry-caption">
                            {expanded ? (
                                <>
                                    <span>
                                        Hermes · {model}
                                        {sideAgent ? " + side agent" : ""}
                                    </span>
                                    <span>{computer} · Shift + Enter for a new line</span>
                                </>
                            ) : inChat ? (
                                <span>Type to reveal your chat tools</span>
                            ) : null}
                        </div>
                        {!inChat && !surface && (
                            <div className="concept-start-content">
                                <div className="concept-section-label">New</div>
                                <div className="concept-launchers">
                                    {Launchers.map(({ label, icon: Icon, kind }) => (
                                        <button key={label} onClick={() => setSurface({ kind, title: label })}>
                                            <Icon size={19} />
                                            <span>{label}</span>
                                        </button>
                                    ))}
                                </div>
                                <section className="concept-destinations" aria-label="Destination suggestions">
                                    <div className="concept-destinations-heading">
                                        <span>Suggestions{text ? " matching your input" : ""}</span>
                                        <small>Local examples · visits in this preview only</small>
                                    </div>
                                    <div className="concept-destination-groups">
                                        {[
                                            { label: "Local servers", icon: Monitor, items: localServers },
                                            {
                                                label: recentSites.length
                                                    ? "Recently visited"
                                                    : "Recently visited · examples",
                                                icon: Clock3,
                                                items: shownRecents,
                                            },
                                            { label: "Suggested sites", icon: Globe, items: suggestedSites },
                                        ]
                                            .filter((group) => group.items.length > 0)
                                            .map(({ label, icon: Icon, items }) => (
                                                <div key={label} className="concept-destination-group">
                                                    <h2>
                                                        <Icon size={13} />
                                                        {label}
                                                    </h2>
                                                    {items.map((item) => (
                                                        <button key={item.url} onClick={() => openDestination(item)}>
                                                            <span>{item.title}</span>
                                                            <small>{item.url.replace(/^https?:\/\//, "")}</small>
                                                            <ArrowUp size={12} />
                                                        </button>
                                                    ))}
                                                </div>
                                            ))}
                                        {localServers.length + shownRecents.length + suggestedSites.length === 0 && (
                                            <p className="concept-suggestion-empty">
                                                No matching destinations. Use Search on Google above, or enter a URL.
                                            </p>
                                        )}
                                    </div>
                                </section>
                                <div className="concept-try">
                                    <span>Or start a conversation</span>
                                    {Suggestions.map((value) => (
                                        <button
                                            key={value}
                                            onClick={() =>
                                                fill(
                                                    value.replace(/^Search the web for /, ""),
                                                    value.startsWith("Search") ? "search" : "chat"
                                                )
                                            }
                                        >
                                            {value}
                                            <ArrowUp size={12} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    {inChat && <div className="concept-local-note">Concept conversation · sample replies</div>}
                </section>
                {surface && (
                    <section className={`concept-media ${inChat ? "split" : ""}`} aria-label="Media preview">
                        <div className="concept-media-toolbar">
                            <div>
                                <ArrowLeft size={14} />
                                <ArrowRight size={14} />
                                <RotateCcw size={14} />
                            </div>
                            <span>{surface.value ?? surface.title}</span>
                            <button aria-label="Close media preview" onClick={() => setSurface(undefined)}>
                                <X size={16} />
                            </button>
                        </div>
                        {surface.kind === "search" ? (
                            <div className="concept-search-page">
                                <small>LOCAL SEARCH PREVIEW</small>
                                <h1>{surface.value}</h1>
                                <p>Your search opens alongside the same chat field.</p>
                                {[
                                    "A useful place to start",
                                    "Guides and practical examples",
                                    "Explore another perspective",
                                ].map((title, index) => (
                                    <button
                                        key={title}
                                        onClick={() =>
                                            setSurface({
                                                kind: "browser",
                                                title,
                                                value: `https://example.com/result-${index + 1}`,
                                            })
                                        }
                                    >
                                        <small>example.com / result-{index + 1}</small>
                                        <h2>{title}</h2>
                                        <p>
                                            A sample result for “{surface.value}”. Click to try the browser transition.
                                        </p>
                                    </button>
                                ))}
                            </div>
                        ) : surface.kind === "terminal" ? (
                            <div className="concept-terminal">
                                <span>kronos ~/workspace</span>
                                <p>
                                    $ <span className="concept-caret">▌</span>
                                </p>
                                <small>Terminal preview — no commands are executed.</small>
                            </div>
                        ) : surface.kind === "files" ? (
                            <div className="concept-file-page">
                                <h2>Workspace</h2>
                                {["src", "assets", "README.md", "package.json"].map((name) => (
                                    <div key={name}>
                                        <Files size={17} />
                                        {name}
                                    </div>
                                ))}
                                <small>Sample files · preview only</small>
                            </div>
                        ) : surface.kind === "device" ? (
                            <div className="concept-device">
                                <div>
                                    <span />
                                    <Smartphone size={32} />
                                    <h3>{surface.title}</h3>
                                    <p>Device preview</p>
                                </div>
                            </div>
                        ) : surface.kind === "canvas" ? (
                            <div className="concept-canvas-page">
                                <small>LOCAL CANVAS PREVIEW</small>
                                <h2>Your starting point</h2>
                                <label htmlFor="concept-canvas-note">Canvas note</label>
                                <textarea id="concept-canvas-note" defaultValue={surface.value} />
                                <p>Edit this note while continuing the conversation.</p>
                            </div>
                        ) : surface.kind === "changes" ? (
                            <div className="concept-file-page">
                                <h2>Changes</h2>
                                <div>
                                    <GitBranch size={17} />
                                    Your workspace is up to date
                                </div>
                                <small>Sample workspace · preview only</small>
                            </div>
                        ) : (
                            <div className="concept-browser-page">
                                <small>SIMULATED BROWSER</small>
                                <h1>A place for your next idea.</h1>
                                <p>
                                    The page stays visible while you ask questions, explore something new, or continue
                                    the conversation.
                                </p>
                                <div className="concept-browser-cards">
                                    <div>
                                        Explore
                                        <br />
                                        <span>Keep your context close.</span>
                                    </div>
                                    <div>
                                        Create
                                        <br />
                                        <span>Start with a thought.</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        fill("Help me understand this page", "chat");
                                        input.current?.focus();
                                    }}
                                >
                                    <Sparkles size={15} />
                                    Ask about this page
                                </button>
                            </div>
                        )}
                    </section>
                )}
            </main>
            {menu === "settings" && (
                <div className="concept-settings" role="dialog" aria-label="Concept settings">
                    <strong>Concept preview</strong>
                    <p>
                        All interactions stay in this page. Chat replies, search results, and workspace surfaces are
                        simulated.
                    </p>
                    <button onClick={() => setChrome(makeChromeVariation())}>Shuffle chrome background</button>
                    <small className="concept-chrome-label">
                        {chrome.purple ? "Purple chrome" : "Graphite chrome"} · randomized on each new tab
                    </small>
                    <button onClick={() => setMenu("")}>Close</button>
                </div>
            )}
            <footer className="concept-watermark">
                <Circle size={5} fill="currentColor" />
                Concept only · local interactions
            </footer>
            <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                    const files = [...(event.target.files ?? [])].map((file) => {
                        const image = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
                        if (image) imageUrls.current.push(image);
                        return { id: crypto.randomUUID(), name: file.name, image };
                    });
                    setAttachments((current) => [...current, ...files]);
                    event.target.value = "";
                    setMenu("");
                    input.current?.focus();
                }}
            />
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<StartChatConcept />);
