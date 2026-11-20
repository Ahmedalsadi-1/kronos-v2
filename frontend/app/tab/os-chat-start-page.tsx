// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { BorderBeam } from "border-beam";
import {
    ArrowUp,
    AudioLines,
    ChevronDown,
    Files,
    GitPullRequest,
    Globe,
    LoaderCircle,
    Mic,
    Monitor,
    PanelsTopLeft,
    Paperclip,
    Plus,
    Rocket,
    Search,
    Settings2,
    Smartphone,
    Sparkles,
    Type,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import KronosLogo from "@/app/asset/logo.svg";
import "./os-chat-start-motion.css";
import "./os-chat-start-page.css";
import { ChromeBackground, makeChromeVariation } from "./os-chat-start-visuals";
import type { PenChatDockApp } from "./os-pen-chat-dock-model";

type StartAction = "browser" | "task" | "canvas";
export type ChatStartDestination = { value: string; label: string; detail?: string };
const StartApps = [
    { app: "terminal", label: "Terminal", icon: PanelsTopLeft },
    { app: "changes", label: "Changes", icon: GitPullRequest },
    { app: "files", label: "Files", icon: Files },
    { app: "android", label: "Android Emulator", icon: Smartphone },
    { app: "iphone", label: "iPhone Simulator", icon: Smartphone },
    { app: "sandbox", label: "Sandbox VM", icon: Monitor },
] as const;

export function OSChatStartPage({
    active,
    query,
    onQuery,
    onBrowser,
    onChat,
    onTool,
    onLaunch,
    onChanges,
    onSearchIntent,
    destinations,
    pending,
}: {
    active: boolean;
    query: string;
    onQuery: (value: string) => void;
    onBrowser: (value: string) => Promise<unknown>;
    onChat: (text: string, canvas: boolean) => Promise<void>;
    onTool: (label: string, text: string) => Promise<void>;
    onLaunch: (app: PenChatDockApp) => Promise<unknown>;
    onChanges: () => void;
    onSearchIntent?: (searching: boolean) => void;
    destinations: ChatStartDestination[];
    pending: boolean;
}) {
    const keyboardHelp = useId();
    const [chrome] = useState(makeChromeVariation);
    const [intent, setIntent] = useState<StartAction | "auto">("auto");
    const [transition, setTransition] = useState<StartAction>();
    const [largeText, setLargeText] = useState(false);
    const [failure, setFailure] = useState("");
    useEffect(() => {
        if (!active) {
            setIntent("auto");
            onSearchIntent?.(false);
        }
    }, [active, onSearchIntent]);
    const submitting = useRef(false);
    const text = query.trim();
    const isUrl = /^(https?:\/\/|localhost(?=[:/]|$)|127\.0\.0\.1|[^\s]+\.[a-z]{2,}(?:[:/]|$))/i.test(text);
    const selectedAction = intent === "auto" ? (isUrl ? "browser" : "task") : intent;
    const local = destinations.filter(({ value }) =>
        /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/i.test(value)
    );
    const recent = destinations.filter((row) => !local.includes(row));
    const open = async (action: StartAction, destination?: string) => {
        if (submitting.current || pending || (!text && !destination)) return;
        submitting.current = true;
        setFailure("");
        setTransition(action);
        try {
            if (action === "browser") {
                await onBrowser(destination ?? `https://www.google.com/search?q=${encodeURIComponent(text)}`);
            } else {
                await onChat(text, action === "canvas");
                onQuery("");
            }
        } catch (error) {
            setFailure(error instanceof Error ? error.message : "Could not open this action. Please try again.");
        } finally {
            submitting.current = false;
            setTransition(undefined);
        }
    };
    const tool = async (label: string) => {
        try {
            await onTool(label, text);
            onQuery("");
        } catch (error) {
            setFailure(error instanceof Error ? error.message : "Could not open chat controls.");
        }
    };
    const actionRow = (action: StartAction, icon: ReactNode, label: string) => (
        <button
            type="button"
            aria-pressed={selectedAction === action}
            onClick={() => {
                setIntent(action === "browser" && isUrl ? "auto" : action);
                onSearchIntent?.(action === "browser" && !isUrl);
                void open(action, action === "browser" && isUrl ? text : undefined);
            }}
            disabled={pending || Boolean(transition)}
        >
            {icon}
            <strong>{label}</strong>
            <span>{action === "task" ? "↵" : text}</span>
        </button>
    );
    return (
        <section
            hidden={!active}
            className="os-chat-start-page"
            aria-label="New widget"
            data-widget-preview-id="new"
            data-start-action={transition}
        >
            {active && <ChromeBackground variation={chrome} />}
            <div className="os-chat-start-content">
                <header>
                    <h1>
                        <KronosLogo role="img" aria-label="KronOS" />
                        OS is awake
                    </h1>
                    <p>With an active memory that evolves with every action to understand you better.</p>
                </header>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void open(selectedAction, intent === "auto" && isUrl ? text : undefined);
                    }}
                >
                    <div className="os-chat-start-composer" data-expanded={Boolean(text)}>
                        {active && typeof window.matchMedia === "function" && (
                            <BorderBeam
                                className="concept-border-beam"
                                size="md"
                                theme="dark"
                                colorVariant="ocean"
                                staticColors
                                duration={6}
                                strength={text ? 0.8 : 0.4}
                                borderRadius={14}
                                aria-hidden="true"
                            >
                                <span />
                            </BorderBeam>
                        )}
                        <textarea
                            aria-label="Chat and search"
                            aria-describedby={keyboardHelp}
                            placeholder="Ask anything, search, or enter a URL"
                            value={query}
                            rows={text ? 3 : 1}
                            style={{ fontSize: largeText ? 18 : 15 }}
                            onChange={(event) => {
                                onQuery(event.target.value);
                                if (!event.target.value) setIntent("auto");
                            }}
                            onKeyDown={(event) => {
                                if (
                                    (event.key === "ArrowDown" || event.key === "ArrowUp") &&
                                    text &&
                                    !event.nativeEvent.isComposing
                                ) {
                                    event.preventDefault();
                                    const actions: StartAction[] = ["browser", "task", "canvas"];
                                    const index = actions.indexOf(selectedAction);
                                    const next = actions[(index + (event.key === "ArrowDown" ? 1 : 2)) % 3];
                                    setIntent(next === "browser" && isUrl ? "auto" : next);
                                    onSearchIntent?.(next === "browser" && !isUrl);
                                    return;
                                }
                                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                                event.preventDefault();
                                const action = event.metaKey || event.ctrlKey ? "task" : selectedAction;
                                void open(
                                    action,
                                    intent === "auto" && isUrl && action === "browser" ? text : undefined
                                );
                            }}
                        />
                        {text && (
                            <div className="os-chat-start-tools">
                                <button
                                    type="button"
                                    aria-label="Add to context"
                                    title="Add to context"
                                    onClick={() => void tool("Add to context")}
                                >
                                    <Plus size={16} />
                                </button>
                                <button type="button" onClick={() => void tool("Attach files")}>
                                    <Paperclip size={15} />
                                    Attach files
                                </button>
                                <span />
                                <button
                                    type="button"
                                    aria-label="Text size"
                                    title="Text size"
                                    aria-pressed={largeText}
                                    onClick={() => setLargeText(!largeText)}
                                >
                                    <Type size={16} />
                                </button>
                                {[
                                    { label: "Hermes chat tools", icon: Settings2 },
                                    { label: "KronOS Side Agent (Pi)", icon: Sparkles },
                                    { label: "Choose sandbox computer", icon: Monitor },
                                    { label: "Voice dictation", icon: Mic },
                                    { label: "Start voice conversation", icon: AudioLines },
                                    { label: "Run settings", icon: Rocket },
                                    { label: "Chat options", icon: ChevronDown },
                                ].map(({ label, icon: Icon }) => (
                                    <button
                                        type="button"
                                        key={label}
                                        aria-label={label}
                                        title={label}
                                        onClick={() => void tool(label)}
                                    >
                                        <Icon size={16} />
                                    </button>
                                ))}
                                <button
                                    type="submit"
                                    aria-label="Send message"
                                    disabled={pending || Boolean(transition)}
                                >
                                    <ArrowUp size={17} />
                                </button>
                            </div>
                        )}
                    </div>
                    <span id={keyboardHelp} className="os-chat-start-sr-only">
                        Enter opens the selected action. Arrow keys change actions. Shift and Enter add a new line.
                    </span>
                    {text && (
                        <div className="os-chat-start-actions" aria-label="Input action">
                            {actionRow(
                                "browser",
                                <Search size={16} />,
                                isUrl && intent === "auto" ? "Open website" : "Search on Google"
                            )}
                            {actionRow("task", <Sparkles size={16} />, "Run task")}
                            {actionRow("canvas", <PanelsTopLeft size={16} />, "Ask in Canvas")}
                        </div>
                    )}
                </form>
                {transition && (
                    <div className="os-chat-start-progress" role="status">
                        <LoaderCircle size={16} />
                        {transition === "browser"
                            ? "Opening browser…"
                            : transition === "canvas"
                              ? "Opening Canvas…"
                              : "Starting task…"}
                    </div>
                )}
                {failure && <p role="alert">{failure}</p>}
                <h2>New</h2>
                <div className="os-chat-start-launchers">
                    {StartApps.map(({ app, label, icon: Icon }) => (
                        <button
                            type="button"
                            key={app}
                            disabled={pending}
                            onClick={() => (app === "changes" ? onChanges() : void onLaunch(app))}
                        >
                            <Icon size={19} />
                            {label}
                        </button>
                    ))}
                </div>
                <div className="os-chat-start-suggestions">
                    {[
                        { title: "Local servers", rows: local },
                        { title: "Recently visited & suggestions", rows: recent },
                    ]
                        .filter(({ rows }) => rows.length > 0)
                        .map(({ title, rows }) => (
                            <section key={title} aria-label={title}>
                                <h2>{title}</h2>
                                {rows.slice(0, 6).map(({ value, label, detail }) => (
                                    <button
                                        type="button"
                                        key={value}
                                        disabled={pending}
                                        onClick={() => void open("browser", value)}
                                    >
                                        <Globe size={14} />
                                        <span>
                                            {label}
                                            <small>{detail || value}</small>
                                        </span>
                                        <ArrowUp size={12} />
                                    </button>
                                ))}
                            </section>
                        ))}
                </div>
            </div>
        </section>
    );
}
