import type { LucideIcon } from "lucide-react";
import { LiquidChrome } from "./os-liquid-chrome";
import {
    ArrowRight,
    BookOpen,
    Bot,
    Boxes,
    BrainCircuit,
    Check,
    Command,
    FileCode2,
    FileText,
    GitBranch,
    Globe2,
    Laptop,
    LayoutDashboard,
    Mic,
    MousePointer2,
    Network,
    PenLine,
    Search,
    Server,
    ShieldCheck,
    Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { setPageMeta } from "./lib/meta";
import { hasProductCapture, OsLanding, ScreenshotSlot } from "./os-landing";
import "./os-pages.css";
import { OsSiteShell } from "./os-shell";

type Media = {
    alt: string;
};

type Capability = {
    slug: string;
    label: string;
    eyebrow: string;
    title: string;
    summary: string;
    description: string;
    icon: LucideIcon;
    media: Media;
    points: string[];
};

type Chapter = {
    thesis: string;
    narrative: [string, string];
    details: Array<{ title: string; text: string }>;
    workflow: string[];
    gallery: Media[];
};

const releases = "https://github.com/Ahmedalsadi-1/kronos-releases";
const previewRelease = `${releases}/releases/tag/v0.14.5`;

const capabilities: Capability[] = [
    {
        slug: "workspace-canvas",
        label: "Workspace canvas",
        eyebrow: "01 / Command center",
        title: "One workspace. Four ways to make it yours.",
        summary: "Keep the same terminal, browser, files, sandboxes, and AI while changing how the work is arranged.",
        description:
            "KronOS can present a project as an OS desktop, resizable widgets, focused tabs, or a freeform spatial canvas. The canvas adds notes, diagram tools, live agent task cards, and a way to share selections with KronOS Agent without losing the underlying widgets.",
        icon: LayoutDashboard,
        media: {
            alt: "KronOS workspace canvas in motion",
        },
        points: [
            "OS desktop, Canvas, Tabs, and Widgets",
            "Live request, action, approval, evidence, and output cards",
            "Follow or quote canvas selections in KronOS Agent",
        ],
    },
    {
        slug: "kronoscode",
        label: "KronOS Agent",
        eyebrow: "02 / AI engine",
        title: "An agent that can see the work, not just the prompt.",
        summary: "KronOS Agent reasons across the live workspace, then acts through visible, inspectable steps.",
        description:
            "Give AI the context it normally misses: terminal output, files, diffs, browser state, sandbox activity, and session history. KronOS Agent plans across those surfaces while keeping meaningful commands and edits reviewable.",
        icon: BrainCircuit,
        media: { alt: "KronOS Agent working inside KronOS" },
        points: ["Workspace-aware planning", "Diff-first code changes", "Human approval at the right moments"],
    },
    {
        slug: "terminal",
        label: "Terminal",
        eyebrow: "03 / Command layer",
        title: "A real terminal at the center of the system.",
        summary: "Local shells, durable sessions, logs, and dev servers stay connected to the rest of the workspace.",
        description:
            "KronOS treats command output as product context. Failures, exit codes, logs, and test results can inform the agent, the browser preview, and the next edit without copying anything into another tool.",
        icon: Terminal,
        media: {
            alt: "A dev server running inside KronOS",
        },
        points: ["Full PTY terminal sessions", "AI-readable output and history", "Local and remote workflows"],
    },
    {
        slug: "browser-automation",
        label: "Browser automation",
        eyebrow: "04 / Product validation",
        title: "Build and validate in the same field of view.",
        summary:
            "Embedded Chromium keeps localhost, documentation, and live product flows beside the code that drives them.",
        description:
            "Open product previews and browser workflows as native blocks. Agents can inspect structured page state, navigate, click, type, and capture evidence while you keep the terminal and source context in view.",
        icon: Globe2,
        media: {
            alt: "Browser automation inside a KronOS block",
        },
        points: ["Embedded live previews", "Structured element references", "Screenshots and browser evidence"],
    },
    {
        slug: "sandbox-vms",
        label: "Sandbox VMs",
        eyebrow: "05 / Isolated runtime",
        title: "Give risky work a safe place to run.",
        summary: "Disposable Linux desktops let people and agents experiment without putting the host machine at risk.",
        description:
            "Launch isolated environments for package installs, reproductions, browser work, and automation. Each sandbox can expose a desktop, terminal, editor, and browser while remaining clearly separated from the host.",
        icon: Server,
        media: {
            alt: "An isolated Linux sandbox controlled from KronOS",
        },
        points: ["Disposable Linux environments", "Visible desktop automation", "Host and sandbox boundaries"],
    },
    {
        slug: "desktop-control",
        label: "Desktop control",
        eyebrow: "06 / Native automation",
        title: "Connect agent work to the apps already on your Mac.",
        summary: "Observe and operate native applications through accessibility and screenshot-based controls.",
        description:
            "Some workflows cross beyond code and browser tabs. KronOS gives agents a permission-aware path to inspect native app structure and perform targeted clicks, typing, keyboard actions, scrolling, and dragging.",
        icon: MousePointer2,
        media: {
            alt: "KronOS side panel coordinating desktop and workspace control",
        },
        points: ["Accessibility-tree inspection", "Targeted native app actions", "Visible host permissions"],
    },
    {
        slug: "remote-sessions",
        label: "Remote sessions",
        eyebrow: "07 / Distributed work",
        title: "Remote work that survives real life.",
        summary: "Durable SSH, remote files, and reconnecting sessions stay attached to the workspace.",
        description:
            "Keep remote terminal state, files, and previews available through network drops, sleep cycles, and app restarts. KronOS Agent can reason from the same remote output and project context you see.",
        icon: Network,
        media: { alt: "Remote files and terminal context inside KronOS" },
        points: ["Durable SSH sessions", "Remote file previews", "Automatic reconnection"],
    },
    {
        slug: "acp-agents",
        label: "Agent compatibility",
        eyebrow: "08 / Legacy compatibility",
        title: "A home for the compatibility details.",
        summary: "Older ACP integration paths remain for compatibility. KronOS Agent is the current agent experience.",
        description:
            "ACP paths are retained as legacy compatibility code. For current chat and workspace-aware agent work, use KronOS Agent, backed by the managed Hermes runtime. Availability of older integrations depends on the build.",
        icon: Bot,
        media: {
            alt: "ACP agent management inside KronOS",
        },
        points: ["Multiple specialist agents", "Scoped background work", "Inspectable session history"],
    },
    {
        slug: "voice",
        label: "Voice (experimental)",
        eyebrow: "09 / Experimental",
        title: "Speak into the same agent context already on the canvas.",
        summary:
            "Optional speech capture and local transcription connect directly to the active KronOS Agent composer.",
        description:
            "KronOS can start an optional local Python audio process, capture microphone input, transcribe speech with faster-whisper, and submit the final text through the active composer. Speech output is also available when an online or offline TTS engine is configured.",
        icon: Mic,
        media: {
            alt: "The KronOS side panel where voice transcripts enter the active agent session",
        },
        points: ["Local speech-to-text", "Visible listening and transcription state", "Opt-in process lifecycle"],
    },
];

const chapters: Record<string, Chapter> = {
    "workspace-canvas": {
        thesis: "The workspace should preserve the shape of the problem and still let the operator choose the right level of focus.",
        narrative: [
            "Most technical work changes shape during the day. A broad investigation benefits from several visible surfaces; a focused edit needs one active pane; planning and agent review become easier when evidence can be arranged spatially. A fixed layout forces the operator to rebuild context whenever the work changes.",
            "KronOS keeps the same live widgets underneath three presentations: resizable tiles, browser-style tabs with pane splitting, and a persistent pan-and-zoom canvas. On the canvas, notes and diagrams can sit beside a live agent graph, and any selected widget or task card can become the next prompt's focus or quoted evidence.",
        ],
        details: [
            {
                title: "Change the presentation, keep the work",
                text: "Move between tiled monitoring, focused tabs, and spatial planning without replacing the underlying widgets.",
            },
            {
                title: "See the agent's lineage",
                text: "Requests, decisions, actions, approvals, evidence, and outputs remain connected as live task cards.",
            },
            {
                title: "Prompt from the selection",
                text: "Use a selected widget or task card as the active focus, or quote it as supporting evidence.",
            },
        ],
        workflow: [
            "Choose tiles, tabs, or canvas",
            "Arrange the surfaces and notes",
            "Follow live agent and evidence cards",
            "Send the right selection back to KronOS Agent",
        ],
        gallery: [
            { alt: "Navigate the canvas and locate project frames" },
            {
                alt: "Browser, terminal, and a connected device arranged on Canvas",
            },
            { alt: "Preview a design in the browser" },
        ],
    },
    kronoscode: {
        thesis: "An agent becomes more useful when it can inspect the same evidence as the person directing it.",
        narrative: [
            "A chat transcript is a narrow representation of software work. It omits the failing command, the open diff, the browser state, the remote connection, and the decisions that produced the current workspace. That missing context is where most agent mistakes begin.",
            "KronOS Agent operates inside KronOS, where it can reason from visible workspace evidence. It plans across files, terminal output, browser state, sandboxes, and session history, then presents commands and edits at the moment a person needs to review them.",
        ],
        details: [
            {
                title: "Evidence before action",
                text: "Plans can incorporate files, output, screenshots, previews, and prior session state.",
            },
            {
                title: "Inspectable execution",
                text: "Commands, tool calls, and code changes remain visible instead of disappearing behind a spinner.",
            },
            {
                title: "Review the delta",
                text: "Diff-first editing keeps attention on what changed, why it changed, and what still needs validation.",
            },
        ],
        workflow: [
            "Describe the outcome",
            "Inspect the proposed route",
            "Approve meaningful actions",
            "Review evidence and continue",
        ],
        gallery: [
            { alt: "Agent chat history and workspace navigation" },
            { alt: "Agent work, code, and a localhost preview together" },
            { alt: "Inspect agent tools and configuration" },
            { alt: "A parallel workspace overview, including Labs device experiments" },
        ],
    },
    terminal: {
        thesis: "The command line is not a utility at the edge of the product. It is the system of record for what actually ran.",
        narrative: [
            "Builds, tests, servers, migrations, and remote operations all leave their clearest evidence in the terminal. When that output lives in a detached window, the rest of the workspace loses the most precise account of what happened.",
            "KronOS keeps full PTY sessions beside the files and products they affect. Scrollback, exit status, logs, and running processes become usable context for both the operator and KronOS Agent, without flattening the terminal into a decorative console.",
        ],
        details: [
            {
                title: "Full terminal fidelity",
                text: "Local shells, long-running processes, familiar shortcuts, and durable terminal state remain intact.",
            },
            {
                title: "Output as context",
                text: "Failures and logs can inform the next agent action without being copied into a prompt.",
            },
            {
                title: "Development in one frame",
                text: "Run a server, inspect the product, edit files, and validate changes without losing the command history.",
            },
        ],
        workflow: [
            "Start a local or remote shell",
            "Run the system under investigation",
            "Connect output to files and previews",
            "Preserve the session with the workspace",
        ],
        gallery: [
            {
                alt: "Give the agent a task and inspect terminal verification",
            },
            { alt: "Terminal output with an integrated file explorer" },
            { alt: "Terminal blocks arranged with product surfaces" },
        ],
    },
    "browser-automation": {
        thesis: "Product validation belongs beside implementation, not in a separate trail of windows and screenshots.",
        narrative: [
            "A browser is where assumptions become visible. Layout, state, authentication, network behavior, and customer flows can contradict what the code appears to promise. Separating that surface from the development workspace slows every feedback loop.",
            "Embedded Chromium blocks keep localhost, documentation, dashboards, and live applications beside the source and terminal. Structured element references give agents a stable way to inspect and operate pages while screenshots preserve the visual evidence a team needs to review.",
        ],
        details: [
            {
                title: "Inline product truth",
                text: "Keep the running product visible while commands and edits change the system around it.",
            },
            {
                title: "Structured interaction",
                text: "Agents can navigate, inspect, click, type, and scroll through stable element references.",
            },
            {
                title: "Evidence that travels",
                text: "Screenshots and browser state can remain attached to the task and inform the next step.",
            },
        ],
        workflow: [
            "Open the target experience",
            "Inspect visible and structured state",
            "Operate the browser with clear scope",
            "Connect the result back to code",
        ],
        gallery: [
            {
                alt: "Zoom into the browser on a connected computer",
            },
            { alt: "Browser, terminal, and a connected device arranged on Canvas" },
            { alt: "Inspect the browser preview and return to the workspace" },
        ],
    },
    "sandbox-vms": {
        thesis: "Uncertain work should have room to run without inheriting access to the host machine.",
        narrative: [
            "Package installation, unfamiliar repositories, browser automation, and reproduction work often need a complete environment—not just a restricted shell. Running that work directly on the host turns every experiment into a trust decision.",
            "KronOS sandboxes provide disposable Linux desktops with their own terminal, browser, editor, and filesystem. The agent can work visibly inside the isolated environment while the operator decides which results are worth carrying back into the primary workspace.",
        ],
        details: [
            {
                title: "A complete isolated machine",
                text: "Use a desktop, terminal, editor, browser, and root access without exposing the host.",
            },
            {
                title: "Automation you can watch",
                text: "Desktop and browser activity remains visible instead of vanishing into a remote job.",
            },
            {
                title: "Disposable by design",
                text: "Create, validate, and remove environments without leaving experimental state behind.",
            },
        ],
        workflow: [
            "Launch an isolated environment",
            "Install and reproduce freely",
            "Observe agent activity",
            "Promote only trusted results",
        ],
        gallery: [
            { alt: "Keep chat beside a connected sandbox desktop" },
            {
                alt: "A sandbox workflow running inside KronOS",
            },
            {
                alt: "A sandbox arranged beside the primary development workspace",
            },
        ],
    },
    "desktop-control": {
        thesis: "Some of the most valuable technical workflows cross the boundary between code and native applications.",
        narrative: [
            "Release tools, design software, system dialogs, simulators, and internal applications do not always expose a clean API. A code-only agent reaches the edge of its world precisely where many real workflows continue.",
            "Desktop control gives KronOS Agent a permission-aware path into native macOS applications. Accessibility structure and screenshots provide observable state; targeted clicks, typing, key presses, scrolling, and dragging provide action without pretending the desktop is just another shell.",
        ],
        details: [
            {
                title: "Read native structure",
                text: "Inspect accessibility roles, labels, menus, fields, and panes before taking action.",
            },
            {
                title: "Act with specific scope",
                text: "Target visible controls rather than granting an opaque automation process broad freedom.",
            },
            {
                title: "Keep host actions distinct",
                text: "Desktop control remains visibly separate from browser, sandbox, terminal, and remote execution.",
            },
        ],
        workflow: [
            "Observe the target application",
            "Identify a stable control",
            "Approve the scoped action",
            "Return the result to the workspace",
        ],
        gallery: [
            { alt: "KronOS coordinating native desktop control" },
            { alt: "Native app state visible alongside the KronOS workspace" },
            { alt: "KronOS controls and permissions for agent tools" },
        ],
    },
    "remote-sessions": {
        thesis: "Remote infrastructure should feel like a durable room in the workspace, not a fragile terminal tab.",
        narrative: [
            "Network drops, sleep cycles, and application restarts are ordinary parts of remote development. Traditional SSH workflows make those interruptions the operator’s problem and detach remote files from the rest of the debugging context.",
            "KronOS keeps remote sessions, files, and previews attached to a persistent workspace. Reconnection restores the operating picture, while KronOS Agent can reason from the same remote output and artifacts the engineer is using.",
        ],
        details: [
            {
                title: "Durable connections",
                text: "Recover working sessions after common network and machine interruptions.",
            },
            {
                title: "Remote files in context",
                text: "Browse and preview artifacts without separating them from commands and investigation notes.",
            },
            {
                title: "One local control plane",
                text: "Coordinate local and remote work without changing the workspace model.",
            },
        ],
        workflow: [
            "Connect to a remote environment",
            "Arrange its files and terminals",
            "Work through interruptions",
            "Resume with context intact",
        ],
        gallery: [
            { alt: "Remote project files inside KronOS" },
            { alt: "A remote development workspace in KronOS" },
            {
                alt: "A remote-style development workflow with live output",
            },
        ],
    },
    "acp-agents": {
        thesis: "A multi-agent system needs a place where responsibilities, activity, and results remain legible.",
        narrative: [
            "Specialist agents are useful because they can work with different tools, models, and operating boundaries. Without a shared control plane, that specialization creates another collection of disconnected chats and background processes.",
            "KronOS brings Agent Control Protocol sessions into the workspace. Teams can choose specialists, define scopes, observe activity, and move between interactive and background work while preserving the evidence and decisions around each agent session.",
        ],
        details: [
            {
                title: "Specialists with boundaries",
                text: "Assign different agents to focused responsibilities, tools, and runtime environments.",
            },
            {
                title: "Background work stays visible",
                text: "Monitor ongoing activity and review the outcomes without losing the primary workspace.",
            },
            {
                title: "Sessions become operational memory",
                text: "Keep plans, tool activity, decisions, and results available when the team returns.",
            },
        ],
        workflow: [
            "Select a specialist agent",
            "Define scope and runtime",
            "Monitor the session",
            "Review and preserve the result",
        ],
        gallery: [
            {
                alt: "Agent Control Protocol management in KronOS",
            },
            { alt: "Multiple agent applications available through KronOS" },
            { alt: "An active specialist agent session" },
        ],
    },
    voice: {
        thesis: "Voice is useful when it enters the same visible, reviewable context as every other instruction.",
        narrative: [
            "A microphone should not create a second assistant with a second session. Spoken input is most useful when it arrives in the composer that already knows the selected model, workspace, files, canvas nodes, and approval state.",
            "KronOS's experimental voice path starts an optional local Python process, captures microphone input, transcribes speech with faster-whisper, and submits the final transcript through the active KronOS Agent composer. Listening, transcribing, speaking, idle, and error states remain visible, and turning voice off terminates the process.",
        ],
        details: [
            {
                title: "One composer",
                text: "Voice transcripts enter the active KronOS Agent session instead of opening a parallel AI experience.",
            },
            {
                title: "Local transcription",
                text: "Speech-to-text runs in the optional local Python process with faster-whisper.",
            },
            {
                title: "Explicit lifecycle",
                text: "The UI reports audio state and can stop capture and shut down the engine from KronSettings.",
            },
        ],
        workflow: [
            "Enable the optional voice engine",
            "Start listening from the composer",
            "Review the submitted transcript",
            "Disable the engine when voice is no longer needed",
        ],
        gallery: [
            { alt: "KronOS's active agent composer" },
            { alt: "KronOS settings for models and optional capabilities" },
            {
                alt: "Voice entering the same workspace context as the open surfaces",
            },
        ],
    },
};

type ReferenceItem = {
    label: string;
    value: string;
};

const chapterReference: Record<string, { eyebrow: string; title: string; intro: string; items: ReferenceItem[] }> = {
    "workspace-canvas": {
        eyebrow: "Workspace catalogue",
        title: "Four layouts. One shared workspace.",
        intro: "The same live widgets can become OS windows, tiles, focused tabs, or surfaces on a spatial canvas.",
        items: [
            {
                label: "Presentations",
                value: "OS desktop with Overview and a connected dock, tiled widgets, tabs with pane splits, or a spatial canvas.",
            },
            {
                label: "Canvas tools",
                value: "Pan, zoom, fit, move, resize, add notes, draw, and connect shapes around live widgets.",
            },
            {
                label: "Agent graph",
                value: "Requests, decisions, actions, approvals, evidence, and outputs remain connected as task cards.",
            },
            {
                label: "Canvas context",
                value: "Send a selected widget or agent card to KronOS Agent as active focus or quoted evidence.",
            },
            {
                label: "Terminal",
                value: "Full PTY, shell integration, scrollback capture, SSH, and AI-readable output.",
            },
            { label: "Browser", value: "Embedded Chromium for documentation, dashboards, previews, and automation." },
            {
                label: "Preview",
                value: "Markdown, images, CSVs, PDFs, and HTML that refresh when source files change.",
            },
            { label: "AI chat", value: "KronOS Agent with the context of every open block, file, and command." },
            {
                label: "Sandbox VM",
                value: "An isolated Linux desktop with Firefox, VS Code, terminal, and its own filesystem.",
            },
            { label: "Launcher", value: "A command palette for quick actions and workspace navigation." },
            { label: "System info", value: "Live CPU, memory, disk, and network monitoring inside the canvas." },
            { label: "Settings", value: "A visual editor for themes, keybindings, fonts, and AI providers." },
        ],
    },
    kronoscode: {
        eyebrow: "Execution anatomy",
        title: "Your agent belongs beside the work.",
        intro: "KronOS Agent uses the managed Hermes runtime to keep tool calls, approvals, and results visible alongside the workspace.",
        items: [
            { label: "Runtime", value: "KronOS Agent is backed by the managed Hermes runtime." },
            { label: "Screen", value: "Capture any block or the macOS desktop, read pixels, and track the cursor." },
            { label: "Accessibility", value: "Read native application structure, values, controls, and scroll areas." },
            {
                label: "Widget",
                value: "Snapshot, click, type, scroll, drag, wait, and screenshot through stable element refs.",
            },
            {
                label: "Terminal",
                value: "Run commands with timeouts, capture scrollback, parse exit codes, and return JSON.",
            },
            { label: "Network", value: "Fetch URLs, search the web and documentation, scrape pages, and call APIs." },
            {
                label: "Conversation",
                value: "Work in full chat or beside the Canvas, keeping the conversation as you switch.",
            },
            { label: "Tooling", value: "Workspace tools, MCP integrations, and loadable skills." },
            {
                label: "Lifecycle",
                value: "Managed local startup, health, credential refresh, reconnection, and visible repair guidance.",
            },
        ],
    },
    terminal: {
        eyebrow: "Command reference",
        title: "The terminal remains a real terminal.",
        intro: "KronOS keeps terminal fidelity intact while making command evidence available to the rest of the workspace.",
        items: [
            {
                label: "Local PTY",
                value: "Full shell sessions through node-pty, with familiar shortcuts and long-running processes.",
            },
            { label: "Remote PTY", value: "A Go-based SSH bridge for durable remote command sessions." },
            {
                label: "Evidence",
                value: "Scrollback, exit codes, logs, and structured JSON can inform the next action.",
            },
            {
                label: "File explorer",
                value: "Browse, open, and edit files from the terminal with a KronOS Agent overlay.",
            },
            {
                label: "Settings TUI",
                value: "Configure themes, keybindings, fonts, and providers without leaving the command layer.",
            },
            {
                label: "Streamable apps",
                value: "Run a development server and keep its live view beside the code and output.",
            },
        ],
    },
    "browser-automation": {
        eyebrow: "Browser reference",
        title: "Automation native to the workspace.",
        intro: "Browser blocks use structured page state so agents can operate visible product flows without a separate automation stack.",
        items: [
            {
                label: "Runtime",
                value: "Embedded Chromium for localhost, documentation, dashboards, and live applications.",
            },
            {
                label: "Inspection",
                value: "The Widget Protocol returns a structured element tree with stable refs such as @e3.",
            },
            {
                label: "Actions",
                value: "Navigate, fill forms, click, type, scroll, scrape, inspect, and capture screenshots.",
            },
            {
                label: "Resilience",
                value: "Element refs replace fragile coordinate-only interaction for normal browser workflows.",
            },
            {
                label: "Feedback loop",
                value: "Keep the running product beside its source, command output, and agent plan.",
            },
            {
                label: "No handoff",
                value: "Core browser automation does not require a separate Playwright or Selenium process.",
            },
        ],
    },
    "sandbox-vms": {
        eyebrow: "Isolation reference",
        title: "A complete machine with a clear boundary.",
        intro: "E2B-powered Linux desktops give uncertain work enough room to run without inheriting access to the host.",
        items: [
            {
                label: "Desktop",
                value: "Firefox, VS Code, a terminal, and an independent filesystem in each environment.",
            },
            {
                label: "Privilege",
                value: "Root access for package installation and network operations inside the sandbox.",
            },
            {
                label: "Control",
                value: "KronOS Agent can click, type, scroll, drag, open apps, and work with files visibly.",
            },
            {
                label: "Isolation",
                value: "Sandbox operations remain separate from the host command and filesystem surfaces.",
            },
            {
                label: "Lifecycle",
                value: "Create an environment for a test, then discard it without Dockerfiles or VM upkeep.",
            },
            {
                label: "Use cases",
                value: "Reproductions, unfamiliar repositories, browser work, installs, and risky automation.",
            },
        ],
    },
    "desktop-control": {
        eyebrow: "Native action index",
        title: "The bridge from code to the applications around it.",
        intro: "KronOS Agent uses macOS Accessibility and visual evidence to work with native apps through explicit host permissions.",
        items: [
            { label: "See", value: "Read the full accessibility tree for buttons, fields, menus, and scroll areas." },
            { label: "Click", value: "Target an element name, DOM id, or screenshot coordinate." },
            { label: "Type", value: "Enter text into the currently focused native field." },
            { label: "Press", value: "Send key combinations such as ⌘C or ⌘⇧P." },
            { label: "Scroll + drag", value: "Move through panels or between coordinates with controlled duration." },
            { label: "Set values", value: "Operate sliders, date pickers, and supported native inputs." },
        ],
    },
    "remote-sessions": {
        eyebrow: "Remote reference",
        title: "A connection designed to be resumed.",
        intro: "Remote sessions preserve their place through the interruptions that normally erase terminal context.",
        items: [
            {
                label: "Durability",
                value: "Sessions survive routine network drops, sleep cycles, and KronOS restarts.",
            },
            { label: "Recovery", value: "Automatic reconnection restores the remote operating picture." },
            { label: "Remote files", value: "Browse and edit server-side files with a built-in graphical editor." },
            {
                label: "Inline previews",
                value: "Inspect remote markdown, images, CSVs, and PDFs beside the connection.",
            },
            {
                label: "Shared context",
                value: "KronOS Agent reads the same remote output, files, and evidence as the operator.",
            },
            {
                label: "One model",
                value: "Local and remote work use the same block, layout, and agent interaction system.",
            },
        ],
    },
    "acp-agents": {
        eyebrow: "Agent roster",
        title: "Kronos works where your workspace lives.",
        intro: "Kronos is built into KronOS for persistent, scoped work across terminals, browsers, files, sandboxes, and canvas. Additional ACP specialists can join the same observable workspace.",
        items: [
            {
                label: "Kronos",
                value: "KronOS's built-in persistent agent for automation, research, coding, and workspace control.",
            },
            {
                label: "OpenClaw",
                value: "Filesystem intelligence for dependency graphs, navigation, and large-scale refactors.",
            },
            {
                label: "Codex",
                value: "Deep code analysis and generation for complex paths and production-grade modules.",
            },
            {
                label: "Background work",
                value: "Run continuously, report progress, and preserve session history in the workspace.",
            },
            {
                label: "Configuration",
                value: "Choose agents, tools, models, runtime boundaries, and scopes from one control plane.",
            },
            { label: "Availability", value: "ACP agents are planned as part of KronOS’s commercial premium tier." },
        ],
    },
    voice: {
        eyebrow: "Experimental audio path",
        title: "Speech enters the active KronOS Agent session.",
        intro: "Voice is an optional local process with visible state and an explicit shutdown path.",
        items: [
            { label: "Capture", value: "Opt-in microphone capture through the Electron-to-Python audio bridge." },
            { label: "Transcription", value: "Local speech-to-text through faster-whisper." },
            { label: "Submission", value: "Final transcripts are routed through the active KronOS Agent composer." },
            { label: "Speech", value: "Online TTS with an offline system fallback when available." },
            { label: "State", value: "Idle, listening, transcribing, speaking, and error remain visible in the UI." },
            { label: "Availability", value: "Experimental and dependent on optional local runtime packages." },
        ],
    },
};

type DocumentationSection = {
    id: string;
    eyebrow: string;
    title: string;
    summary: string;
    points: string[];
    link: string;
    linkLabel: string;
};

const documentationSections: DocumentationSection[] = [
    {
        id: "getting-started",
        eyebrow: "01 / Begin here",
        title: "Getting started",
        summary:
            "Install KronOS, create your first workspace, choose an AI provider, and arrange the surfaces your project needs.",
        points: [
            "Download the macOS preview and complete the guided onboarding.",
            "Create a workspace, then add terminal, browser, preview, files, and AI chat blocks.",
            "Connect OpenAI, Anthropic, Google, Ollama, or LM Studio with your own credentials.",
        ],
        link: "/download",
        linkLabel: "Download the preview",
    },
    {
        id: "workspace",
        eyebrow: "02 / Workspace model",
        title: "Blocks and layouts",
        summary:
            "Understand the OS desktop, tiled Widgets, focused Tabs, and spatial Canvas, and how each preserves the same project surfaces.",
        points: [
            "Choose the OS desktop, resizable Widgets, focused Tabs, or a pan-and-zoom Canvas.",
            "Place live task, approval, evidence, and output cards beside the widgets that produced them.",
            "Send selected widgets or agent cards to KronOS Agent as focus or quoted evidence.",
        ],
        link: "/capabilities/workspace-canvas",
        linkLabel: "Read the workspace chapter",
    },
    {
        id: "widget-protocol",
        eyebrow: "03 / Interaction",
        title: "Widget Protocol",
        summary:
            "Every block exposes a structured element tree so agents can inspect and operate the same visible surface as the person directing them.",
        points: [
            "Capture a widget snapshot with stable element references such as @e3.",
            "Click, type, scroll, drag, inspect, wait, and screenshot through one interface.",
            "Use structured references before falling back to fragile coordinate-only actions.",
        ],
        link: "/capabilities#reference-manual",
        linkLabel: "Open the protocol reference",
    },
    {
        id: "kronoscode",
        eyebrow: "04 / Agent engine",
        title: "KronOS Agent",
        summary: "Work with KronOS Agent through the managed Hermes runtime, in full chat or beside your Canvas.",
        points: [
            "Keep the conversation, workspace tools, and task result in view.",
            "Review commands, diffs, screenshots, and tool results as the session progresses.",
            "Use /files, /terminal, and /preview to bring workspace context into chat.",
        ],
        link: "/capabilities/kronoscode",
        linkLabel: "Read the KronOS Agent chapter",
    },
    {
        id: "terminal-remote",
        eyebrow: "05 / Command layer",
        title: "Terminal and SSH",
        summary:
            "Run full local PTY sessions, preserve command evidence, and keep remote connections alive through real-world interruptions.",
        points: [
            "Capture scrollback, exit codes, logs, and structured command output.",
            "Browse and edit local or remote files without leaving the workspace.",
            "Reconnect durable SSH sessions after network drops, sleep, or app restarts.",
        ],
        link: "/capabilities/terminal",
        linkLabel: "Read the terminal chapter",
    },
    {
        id: "browser-sandbox",
        eyebrow: "06 / Validation",
        title: "Browser and sandboxes",
        summary:
            "Keep product validation beside implementation, and move uncertain work into disposable Linux desktops.",
        points: [
            "Operate embedded Chromium through structured page state and visible evidence.",
            "Launch E2B environments with Firefox, VS Code, terminal, and isolated files.",
            "Promote only reviewed results from the sandbox back into the host workspace.",
        ],
        link: "/capabilities/browser-automation",
        linkLabel: "Read the browser chapter",
    },
    {
        id: "desktop-control",
        eyebrow: "07 / Native apps",
        title: "Desktop control",
        summary:
            "Use the macOS accessibility tree and screenshots to connect agent work to native applications with explicit host permissions.",
        points: [
            "Inspect buttons, fields, menus, values, and scroll areas.",
            "Click, type, press keys, scroll, drag, and set supported control values.",
            "Keep native actions distinct from browser, terminal, remote, and sandbox work.",
        ],
        link: "/capabilities/desktop-control",
        linkLabel: "Read the desktop chapter",
    },
    {
        id: "security",
        eyebrow: "08 / Trust model",
        title: "Security and providers",
        summary:
            "Understand surface routing, tool budgets, secure key storage, local execution, and the direct path to your chosen model provider.",
        points: [
            "Store provider credentials in the operating system’s native secure store.",
            "Keep source code, terminal output, and tool execution on the local machine.",
            "Use capability checks, stop conditions, and Git safety rules around agent work.",
        ],
        link: "/security",
        linkLabel: "Read the security model",
    },
    {
        id: "voice",
        eyebrow: "09 / Experimental",
        title: "Voice",
        summary:
            "Connect optional local speech capture and transcription to the same composer, model, and workspace context.",
        points: [
            "Transcribe speech locally through faster-whisper.",
            "Keep listening, transcription, speaking, and error state visible.",
            "Stop capture and terminate the optional process from KronSettings.",
        ],
        link: "/capabilities/voice",
        linkLabel: "Read the voice chapter",
    },
];

type BlogPost = {
    slug: string;
    note: string;
    date: string;
    readTime: string;
    title: string;
    dek: string;
    sections: Array<{ title: string; paragraphs: string[] }>;
};

const blogPosts: BlogPost[] = [
    {
        slug: "workspace-is-the-context",
        note: "Field note 01",
        date: "July 2026",
        readTime: "6 min read",
        title: "The workspace is the context.",
        dek: "Why agent work improves when the terminal, product, files, and decisions remain visible in the same operating picture.",
        sections: [
            {
                title: "A transcript is only a shadow of the work",
                paragraphs: [
                    "Most software work does not happen in a prompt. It happens across a running process, an open diff, a browser state, a remote machine, and a series of decisions that rarely fit cleanly into one message.",
                    "When an agent only receives a transcript, the person directing it becomes a human context bridge. They copy the failure, describe the open page, paste the file, and explain which environment is safe to touch.",
                ],
            },
            {
                title: "Keep the evidence where the action happened",
                paragraphs: [
                    "KronOS treats the workspace as the durable unit of context. Blocks preserve the spatial relationship between commands, source, previews, sandboxes, and agent sessions.",
                    "The goal is not maximal automation. It is a legible loop where a person and an agent can inspect the same evidence, act on the same surface, and understand what changed.",
                ],
            },
        ],
    },
    {
        slug: "browser-automation-should-leave-evidence",
        note: "Field note 02",
        date: "July 2026",
        readTime: "5 min read",
        title: "Browser automation should leave evidence.",
        dek: "A browser action is more trustworthy when the page state, target, screenshot, and resulting product behavior stay attached to the task.",
        sections: [
            {
                title: "Coordinates are not an explanation",
                paragraphs: [
                    "A click at x and y can reproduce an action, but it does not explain the target or survive a small layout change. Structured element references give browser work a vocabulary that people and agents can share.",
                    "KronOS’s Widget Protocol exposes visible controls as stable references, while screenshots preserve the visual result that a selector alone cannot describe.",
                ],
            },
            {
                title: "Validation belongs beside implementation",
                paragraphs: [
                    "The browser is where assumptions about layout, state, authentication, and customer flow become visible. Keeping it beside the terminal and source compresses the distance between a change and its proof.",
                    "An agent can inspect a page, operate a scoped flow, capture the result, and connect that evidence back to the command or file that produced it.",
                ],
            },
        ],
    },
    {
        slug: "give-risky-work-a-room-of-its-own",
        note: "Field note 03",
        date: "July 2026",
        readTime: "4 min read",
        title: "Give risky work a room of its own.",
        dek: "Why disposable, visible Linux desktops are a better boundary for uncertain repositories, installations, and automation.",
        sections: [
            {
                title: "Uncertainty needs more than a restricted shell",
                paragraphs: [
                    "Reproducing an unfamiliar system often requires a browser, editor, package manager, terminal, and complete filesystem. Reducing that work to a narrow shell can make it less useful without making the boundary much clearer.",
                    "A disposable Linux desktop gives the task enough room to run while keeping its packages, credentials, files, and failures away from the host.",
                ],
            },
            {
                title: "Isolation should still be visible",
                paragraphs: [
                    "Background infrastructure can be safe and still feel opaque. KronOS keeps the sandbox desktop on the canvas so people can watch the agent navigate, install, test, and gather evidence.",
                    "The sandbox is not a second hidden world. It is another explicit workspace surface with a boundary the operator can see.",
                ],
            },
        ],
    },
];

function usePageMeta(title: string, description: string) {
    const location = useLocation();

    useEffect(() => {
        setPageMeta(title, description);
        if (location.hash) {
            window.requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
            return;
        }
        window.scrollTo({ top: 0 });
    }, [description, location.hash, location.pathname, title]);
}

function ProductMedia({
    media,
    className = "",
    captureName = "workspace-hero",
}: {
    media: Media;
    className?: string;
    captureName?: string;
}) {
    if (!hasProductCapture(captureName)) return null;
    return (
        <div className={`product-media ${className}`}>
            <ScreenshotSlot name={captureName} label={media.alt} />
        </div>
    );
}

function PetNote({
    message,
    pose = "guide",
    className = "",
}: {
    message: string;
    pose?: "guide" | "walk";
    className?: string;
}) {
    return (
        <aside className={`pet-note pet-note-${pose} ${className}`} aria-label="KronOS note">
            <p>{message}</p>
        </aside>
    );
}

function ControlSection() {
    return (
        <section className="control-section section">
            <div className="control-shell">
                <div className="control-copy">
                    <p className="kicker">Canvas map / control is a feature</p>
                    <h2>Powerful agents. Legible boundaries.</h2>
                    <p>
                        KronOS keeps host, sandbox, browser, terminal, and remote actions distinct. Teams can bring
                        their own models, review consequential steps, and retain the evidence behind each session.
                    </p>
                    <Link className="button button-light" to="/security">
                        Explore security <ArrowRight size={16} />
                    </Link>
                </div>
                <div className="control-map" aria-label="KronOS control boundary diagram">
                    <div className="control-node control-node-center">
                        <strong>KronOS</strong>
                        <span>policy + context</span>
                    </div>
                    <div className="control-node control-node-one">
                        <Terminal size={17} /> Terminal
                    </div>
                    <div className="control-node control-node-two">
                        <Globe2 size={17} /> Browser
                    </div>
                    <div className="control-node control-node-three">
                        <Server size={17} /> Sandbox
                    </div>
                    <div className="control-node control-node-four">
                        <Laptop size={17} /> Desktop
                    </div>
                    <div className="control-node control-node-five">
                        <Bot size={17} /> Agents
                    </div>
                    <div className="control-orbit control-orbit-one" />
                    <div className="control-orbit control-orbit-two" />
                </div>
            </div>
        </section>
    );
}

function FinalCta() {
    return (
        <section className="final-cta section">
            <LiquidChrome />
            <p className="kicker">Your next workspace</p>
            <h2>Make space for what comes next.</h2>
            <p>Your tools, your agents, and your next idea. Together in KronOS.</p>
            <div className="final-actions">
                <Link className="button button-primary" to="/download">
                    Download KronOS
                </Link>
                <Link className="button button-quiet" to="/docs">
                    Read the docs
                </Link>
            </div>
        </section>
    );
}

function ChapterPortal({ capability, index }: { capability: Capability; index: number }) {
    const Icon = capability.icon;
    const captureName = capability.slug === "kronoscode" ? "agent-workspace" : capability.slug;

    return (
        <article className={index < 2 ? "chapter-portal chapter-portal-featured" : "chapter-portal"}>
            <span className="chapter-spine" aria-hidden="true">
                KronOS / {String(index + 1).padStart(2, "0")}
            </span>
            {hasProductCapture(captureName) && (
                <div className="chapter-cover">
                    <ScreenshotSlot name={captureName} label={capability.label} />
                    <span className="chapter-cover-shade" />
                    <div className="chapter-cover-heading">
                        <span>Chapter {String(index + 1).padStart(2, "0")}</span>
                        <Icon size={22} aria-hidden="true" />
                    </div>
                </div>
            )}
            <Link className="chapter-portal-copy" to={`/capabilities/${capability.slug}`}>
                <div>
                    <p>{capability.eyebrow.split(" / ")[1]}</p>
                    <h3>{capability.label}</h3>
                </div>
                <p>{capability.summary}</p>
                <span className="chapter-enter">
                    Enter chapter <ArrowRight size={15} />
                </span>
            </Link>
        </article>
    );
}

function ChapterPortalSection({ showHeading = true }: { showHeading?: boolean }) {
    return (
        <section className="chapter-library section" id="chapters">
            {showHeading ? (
                <div className="chapter-library-heading">
                    <div>
                        <p className="kicker">The KronOS field guide</p>
                        <h2>Nine chapters. Nine complete product stories.</h2>
                    </div>
                    <p>
                        Each chapter is a dedicated destination with its own thesis, detailed explanation, workflow, and
                        product gallery. Choose a cover to enter that part of KronOS.
                    </p>
                </div>
            ) : null}
            <div className="chapter-library-grid">
                {capabilities.map((capability, index) => (
                    <ChapterPortal capability={capability} index={index} key={capability.slug} />
                ))}
            </div>
        </section>
    );
}

function ReferenceManual() {
    return (
        <div className="reference-manual" id="reference-manual">
            <header className="reference-manual-header section">
                <p className="kicker">The KronOS way</p>
                <div>
                    <h2>A desktop that stays with the task.</h2>
                    <p>
                        Arrange tools around the work, bring your agent into context, and keep the result close enough
                        to inspect.
                    </p>
                </div>
            </header>
            <section className="reference-spread">
                <div className="spread-heading">
                    <p className="kicker">Connected surfaces</p>
                    <h2>One home for your tools.</h2>
                    <p>
                        The same live blocks move between OS, Canvas, Tabs, and Widgets. Your layout changes with the
                        task.
                    </p>
                </div>
                <div className="reference-card-grid">
                    {chapterReference["workspace-canvas"].items.map((item) => (
                        <article key={item.label}>
                            <h3>{item.label}</h3>
                            <p>{item.value}</p>
                        </article>
                    ))}
                </div>
            </section>
            <section className="status-spread">
                <div className="status-heading">
                    <p className="kicker">Product status</p>
                    <h2>
                        Start on your Mac.
                        <br />
                        See what is taking shape.
                    </h2>
                </div>
                <div className="platform-ledger">
                    <article>
                        <span>macOS preview</span>
                        <h3>KronOS desktop</h3>
                        <p>
                            The linked public preview is for Apple silicon Macs running macOS 26 or later. Review the
                            release notes before installing.
                        </p>
                        <Link className="notebook-link" to="/download">
                            Download details
                        </Link>
                    </article>
                    <article>
                        <span>Current agent surface</span>
                        <h3>KronOS Agent</h3>
                        <p>
                            Managed Hermes runtime, full chat or Canvas, and workspace context through /files,
                            /terminal, and /preview.
                        </p>
                        <Link className="notebook-link" to="/capabilities/kronoscode">
                            Meet your agent
                        </Link>
                    </article>
                    <article>
                        <span>Labs and experiments</span>
                        <h3>Still taking shape</h3>
                        <p>
                            The iPhone client and phone-control bridge are Labs work. Voice depends on optional local
                            components. These are not part of the standard desktop promise.
                        </p>
                        <Link className="notebook-link" to="/capabilities/voice">
                            Voice availability
                        </Link>
                    </article>
                </div>
            </section>
        </div>
    );
}

function ChapterReference({ capability }: { capability: Capability }) {
    const reference = chapterReference[capability.slug];

    return (
        <section className="chapter-reference section">
            <div className="chapter-reference-heading">
                <p className="kicker">{reference.eyebrow}</p>
                <h2>{reference.title}</h2>
                <p>{reference.intro}</p>
            </div>
            <dl>
                {reference.items.map((item, index) => (
                    <div key={item.label}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <dt>{item.label}</dt>
                        <dd>{item.value}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

function CapabilityIndexPage() {
    usePageMeta(
        "Workspace | KronOS",
        "Explore the layouts, tools, and agent surfaces that make up your KronOS desktop."
    );

    return (
        <>
            <section className="field-guide-hero section os-chrome-surface">
                <LiquidChrome phase={32} />
                <div className="field-guide-edition">
                    <BookOpen size={22} />
                    <span>Four layouts / One workspace</span>
                </div>
                <p className="kicker">The complete product</p>
                <h1>
                    One desktop.
                    <br />
                    Many ways to work.
                </h1>
                <p>
                    A collection of dedicated product chapters for the surfaces, systems, and operating boundaries that
                    make human-plus-agent work legible.
                </p>
            </section>
            <ChapterPortalSection showHeading={false} />
            <ReferenceManual />
            <FinalCta />
        </>
    );
}

function ChapterNavigation({ currentSlug }: { currentSlug: string }) {
    return (
        <nav className="chapter-navigation" aria-label="KronOS field guide chapters">
            <Link className="chapter-navigation-home" to="/capabilities">
                <BookOpen size={15} /> Field guide
            </Link>
            <div className="chapter-navigation-pages">
                {capabilities.map((item, index) => (
                    <Link
                        className={item.slug === currentSlug ? "active" : ""}
                        to={`/capabilities/${item.slug}`}
                        aria-current={item.slug === currentSlug ? "page" : undefined}
                        aria-label={`Chapter ${index + 1}: ${item.label}`}
                        key={item.slug}
                    >
                        {String(index + 1).padStart(2, "0")}
                    </Link>
                ))}
            </div>
        </nav>
    );
}

function CapabilityPage() {
    const { slug } = useParams();
    const capability = capabilities.find((item) => item.slug === slug);
    const chapter = capability ? chapters[capability.slug] : null;

    usePageMeta(
        capability ? `${capability.label} | KronOS Field Guide` : "Capability | KronOS",
        capability?.summary ?? "Explore the KronOS workspace."
    );

    if (!capability || !chapter) {
        return <Navigate to="/capabilities" replace />;
    }

    const chapterIndex = capabilities.findIndex((item) => item.slug === capability.slug);
    const nextCapability = capabilities[(chapterIndex + 1) % capabilities.length];
    const Icon = capability.icon;
    const gallery = chapter.gallery
        .map((media, index) => ({
            media,
            captureName: `${capability.slug === "kronoscode" ? "agent" : capability.slug}-detail-${index + 1}`,
        }))
        .filter(({ captureName }) => hasProductCapture(captureName));

    return (
        <article className="chapter-page">
            <ChapterNavigation currentSlug={capability.slug} />

            <header className="chapter-hero section os-chrome-surface">
                <LiquidChrome phase={32} />
                <div className="chapter-hero-number" aria-hidden="true">
                    {String(chapterIndex + 1).padStart(2, "0")}
                </div>
                <div className="chapter-hero-copy">
                    <div className="chapter-hero-meta">
                        <span>
                            Chapter {String(chapterIndex + 1).padStart(2, "0")} of{" "}
                            {String(capabilities.length).padStart(2, "0")}
                        </span>
                        <span>{capability.eyebrow.split(" / ")[1]}</span>
                    </div>
                    <span className="chapter-icon">
                        <Icon size={24} />
                    </span>
                    <h1>{capability.title}</h1>
                    <p>{capability.description}</p>
                    <div className="detail-actions">
                        <a className="button button-primary" href="#chapter-story">
                            Read the chapter
                        </a>
                        <Link className="button button-quiet" to="/capabilities">
                            All chapters
                        </Link>
                    </div>
                </div>
                <ProductMedia
                    media={capability.media}
                    className="chapter-hero-media"
                    captureName={capability.slug === "kronoscode" ? "agent-workspace" : capability.slug}
                />
            </header>

            <section className="chapter-thesis section" id="chapter-story">
                <div className="chapter-thesis-label">
                    <span>Thesis</span>
                    <span>{String(chapterIndex + 1).padStart(2, "0")}—A</span>
                </div>
                <blockquote>{chapter.thesis}</blockquote>
            </section>

            <section className="chapter-essay section">
                <aside>
                    <p className="kicker">Why it exists</p>
                    <h2>{capability.label} is a complete product surface.</h2>
                </aside>
                <div className="chapter-prose">
                    <p>{chapter.narrative[0]}</p>
                    <p>{chapter.narrative[1]}</p>
                </div>
            </section>

            <section className="chapter-details section">
                <div className="chapter-section-heading">
                    <p className="kicker">Canvas notes / the operating model</p>
                    <h2>What changes when this surface is part of the workspace.</h2>
                </div>
                <div className="chapter-detail-grid">
                    {chapter.details.map((detail, index) => (
                        <article key={detail.title}>
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <h3>{detail.title}</h3>
                            <p>{detail.text}</p>
                        </article>
                    ))}
                </div>
            </section>

            <ChapterReference capability={capability} />

            {gallery.length > 0 && (
                <section className="chapter-gallery section">
                    <div className="chapter-section-heading gallery-heading">
                        <div>
                            <p className="kicker">Pinned to the canvas / product plates</p>
                            <h2>A closer look at {capability.label.toLowerCase()}.</h2>
                        </div>
                        <span>{gallery.length} product views</span>
                    </div>
                    <div className="chapter-gallery-grid">
                        {gallery.map(({ media, captureName }, index) => (
                            <figure
                                className={
                                    index === 0 && gallery.length % 2 === 1
                                        ? "gallery-plate gallery-plate-wide"
                                        : "gallery-plate"
                                }
                                key={media.alt}
                            >
                                <ProductMedia media={media} captureName={captureName} />
                                <figcaption>
                                    <span>Plate {String(index + 1).padStart(2, "0")}</span>
                                    <p>{media.alt}</p>
                                </figcaption>
                            </figure>
                        ))}
                    </div>
                </section>
            )}

            <section className="chapter-workflow section">
                <div className="chapter-section-heading">
                    <p className="kicker">Canvas sequence / a typical flow</p>
                    <h2>From entry to evidence.</h2>
                </div>
                <ol>
                    {chapter.workflow.map((step, index) => (
                        <li key={step}>
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <strong>{step}</strong>
                        </li>
                    ))}
                </ol>
            </section>

            <Link className="next-chapter section" to={`/capabilities/${nextCapability.slug}`}>
                <span>Turn the page</span>
                <div>
                    <p>Next / Chapter {String(((chapterIndex + 1) % capabilities.length) + 1).padStart(2, "0")}</p>
                    <h2>{nextCapability.label}</h2>
                </div>
                <ArrowRight size={34} />
            </Link>
        </article>
    );
}

function SecurityPage() {
    usePageMeta("Security | KronOS", "Visible boundaries and approval-aware agent execution in KronOS.");
    const items = [
        [
            ShieldCheck,
            "Surface routing",
            "Host, sandbox, browser, terminal, and remote actions are explicitly separated so commands cannot silently cross boundaries.",
        ],
        [
            Boxes,
            "Tool budgets",
            "Broad searches and agent activity can be limited before coding to control scope and model cost.",
        ],
        [
            BrainCircuit,
            "Capability contracts",
            "Runtime health checks tell agents which tools are actually available before a plan reaches execution.",
        ],
        [
            FileCode2,
            "Stop conditions",
            "Agents stop when acceptance checks pass or when credentials and other required inputs are missing.",
        ],
        [GitBranch, "Git safety", "Workflows do not force-push, amend published commits, or bypass repository hooks."],
        [
            Command,
            "Bring your own keys",
            "Your provider credentials connect directly to OpenAI, Anthropic, Google, or local models.",
        ],
        [
            ShieldCheck,
            "Secure storage",
            "Secrets use the native macOS Keychain, Linux secret service, or Windows Credential Manager.",
        ],
        [
            Server,
            "Sandbox isolation",
            "E2B environments allow root access inside the VM with no access to the host by default.",
        ],
    ] as const;
    return (
        <>
            <section className="simple-hero notebook-hero section os-chrome-surface">
                <LiquidChrome phase={32} />
                <p className="kicker">Security by legibility</p>
                <h1>See where every action happens.</h1>
                <p>
                    Agent power is only useful when teams can understand the boundary, inspect the step, and verify the
                    result.
                </p>
                <PetNote message="A clear boundary is easier to trust—and much easier to debug." />
            </section>
            <section className="simple-grid section">
                {items.map(([Icon, title, text]) => (
                    <article key={title}>
                        <Icon size={23} />
                        <h2>{title}</h2>
                        <p>{text}</p>
                    </article>
                ))}
            </section>
            <section className="data-flow section" aria-labelledby="data-flow-title">
                <div className="data-flow-heading">
                    <p className="kicker">Canvas diagram / local-first data flow</p>
                    <h2 id="data-flow-title">Your workspace is not routed through a KronOS cloud.</h2>
                    <p>
                        Source code, terminal output, and local files stay on your machine. Only the context you
                        authorize moves from the local engine to the model provider you selected.
                    </p>
                </div>
                <ol>
                    <li>
                        <span>01</span>
                        <strong>Your API key</strong>
                        <p>Stored by the operating system’s native secure store.</p>
                    </li>
                    <li>
                        <span>02</span>
                        <strong>Your provider</strong>
                        <p>OpenAI, Anthropic, Google, Ollama, LM Studio, or another configured endpoint.</p>
                    </li>
                    <li>
                        <span>03</span>
                        <strong>Local KronOS Agent</strong>
                        <p>Plans and tool orchestration run on your machine.</p>
                    </li>
                    <li>
                        <span>04</span>
                        <strong>Local tools</strong>
                        <p>Approved actions execute against the workspace and return evidence to the session.</p>
                    </li>
                </ol>
                <p className="data-flow-note">
                    KronOS has no required cloud service in this path. Local providers can keep model inference local as
                    well.
                </p>
            </section>
            <ControlSection />
            <FinalCta />
        </>
    );
}

function PricingPage() {
    usePageMeta("Pricing | KronOS", "Use KronOS with your own API keys or a compatible local model.");
    return (
        <>
            <section className="simple-hero notebook-hero section os-chrome-surface">
                <LiquidChrome phase={32} />
                <p className="kicker">Bring your own models</p>
                <h1>The workspace is yours to use.</h1>
                <p>
                    Download KronOS without a KronOS account or subscription. Connect your own API key or a compatible
                    local model. Your model provider handles its own usage charges and subscriptions.
                </p>
                <Link className="button button-primary" to="/download">
                    Download KronOS <ArrowRight size={17} />
                </Link>
            </section>
            <section className="pricing-disclosure section">
                <div>
                    <p className="kicker">What ships with the product</p>
                    <h2>KronOS Agent is included.</h2>
                </div>
                <div>
                    <p>
                        KronOS Agent uses the managed Hermes runtime. Connect a supported cloud provider with your own
                        key, or use a compatible local model.
                    </p>
                </div>
            </section>
            <FinalCta />
        </>
    );
}

function AccessPage({ contact = false }: { contact?: boolean }) {
    usePageMeta(
        contact ? "Contact | KronOS" : "Download | KronOS",
        "Download KronOS and connect your own model provider."
    );
    return (
        <section className="access-page notebook-access section os-chrome-surface">
                <LiquidChrome phase={32} />
            <div className="access-copy">
                <p className="kicker">{contact ? "KronOS support" : "KronOS for macOS"}</p>
                <h1>{contact ? "Get help with KronOS" : "Download KronOS"}</h1>
                <p>
                    {contact
                        ? "Use GitHub to report a problem or suggest an improvement. Include what you expected and the steps to reproduce it."
                        : "KronOS brings your terminal, browser, files, and agent into one persistent desktop. Connect your own provider or local model. No KronOS account or subscription is required."}
                </p>
                <div className="access-points">
                    <span>
                        <Check size={16} /> Bring your own API key
                    </span>
                    <span>
                        <Check size={16} /> Local support diagnostics
                    </span>
                    <span>
                        <Check size={16} /> Public downloads, private source
                    </span>
                </div>
                <PetNote
                    message={
                        contact
                            ? "Tell us where context gets lost. That is usually the best place to begin."
                            : "Provider usage is billed by your provider. Review support reports before sharing them."
                    }
                />
            </div>
            <div className="access-card">
                <span className="card-icon">
                    <Command size={20} />
                </span>
                <h2>{contact ? "Report a problem" : "KronOS 0.14.5 public preview"}</h2>
                <p>
                    {contact
                        ? "In Settings > About, you can preview and copy a local support report. Review it before posting to a public issue."
                        : "For Apple silicon Macs running macOS 26 or later. This preview is ad-hoc signed and is not notarized by Apple. macOS may block the first launch."}
                </p>
                <a
                    className="button button-primary"
                    href={
                        contact
                            ? `${releases}/issues`
                            : `${releases}/releases/download/v0.14.5/KronOS-darwin-arm64-0.14.5.dmg`
                    }
                >
                    {contact ? "Open GitHub support" : "Download for Apple silicon"} <ArrowRight size={16} />
                </a>
                {contact ? (
                    <small>GitHub requires an account to submit issues.</small>
                ) : (
                    <small>
                        <a href={previewRelease}>Release notes, ZIP, and checksums</a>
                    </small>
                )}
            </div>
            {!contact && (
                <div className="install-instructions">
                    <h2>Install on your Mac</h2>
                    <ol>
                        <li>Download and open the DMG, then drag KronOS into Applications.</li>
                        <li>Eject the installer and open KronOS from Applications.</li>
                        <li>
                            If Apple says the developer cannot be verified or cannot check the app, and you trust this
                            download, open System Settings → Privacy &amp; Security → Open Anyway. Confirm Open when
                            prompted. This option may be unavailable on a managed Mac.
                        </li>
                    </ol>
                    <p>
                        If macOS says the app will damage your computer or contains malware, stop and contact support.
                        Do not disable Gatekeeper or remove quarantine attributes.
                    </p>
                    <a href="https://support.apple.com/en-us/102445">Read Apple’s instructions for opening downloaded apps</a>
                </div>
            )}
        </section>
    );
}

function DocumentationPage() {
    const [query, setQuery] = useState("");
    const normalizedQuery = query.trim().toLowerCase();
    const filteredSections = documentationSections.filter((section) => {
        if (!normalizedQuery) {
            return true;
        }
        return [section.title, section.eyebrow, section.summary, ...section.points].some((value) =>
            value.toLowerCase().includes(normalizedQuery)
        );
    });

    usePageMeta(
        "Documentation | KronOS",
        "Learn how KronOS workspaces, blocks, KronOS Agent, browser automation, sandboxes, desktop control, SSH, and security fit together."
    );

    return (
        <>
            <section className="notebook-page docs-hero section os-chrome-surface">
                <LiquidChrome phase={32} />
                <div className="notebook-punches" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                </div>
                <div className="notebook-folio">
                    <span>KronOS / Documentation</span>
                    <span>Revision 01 · 2026</span>
                </div>
                <p className="kicker">Your workspace manual</p>
                <h1>Everything needed to operate the workspace.</h1>
                <p>
                    Start with the model, then move into the exact surface you need. These notes connect the product
                    concepts, operating boundaries, and detailed field-guide chapters in one readable index.
                </p>
                <div className="docs-actions">
                    <a className="button button-light" href={previewRelease}>
                        Read installation notes <ArrowRight size={15} />
                    </a>
                    <Link className="button notebook-button" to="/capabilities">
                        Browse the field guide <BookOpen size={15} />
                    </Link>
                </div>
                <PetNote
                    className="docs-hero-pet"
                    message="I indexed the surfaces by the job you are trying to finish."
                />
            </section>

            <section className="docs-layout section">
                <aside className="docs-contents notebook-sheet">
                    <p className="kicker">On this page</p>
                    <nav aria-label="Documentation sections">
                        {documentationSections.map((section, index) => (
                            <a href={`#${section.id}`} key={section.id}>
                                <span>{String(index + 1).padStart(2, "0")}</span>
                                {section.title}
                            </a>
                        ))}
                    </nav>
                    <p className="docs-contents-note">Nine entries · product and operating reference</p>
                </aside>

                <div className="docs-manual">
                    <label className="docs-search">
                        <Search size={18} aria-hidden="true" />
                        <span className="sr-only">Search documentation</span>
                        <input
                            type="search"
                            value={query}
                            placeholder="Search documentation"
                            onChange={(event) => setQuery(event.target.value)}
                        />
                        <small aria-live="polite">
                            {filteredSections.length} {filteredSections.length === 1 ? "entry" : "entries"}
                        </small>
                    </label>

                    {filteredSections.length ? (
                        filteredSections.map((section, index) => (
                            <article className="docs-entry notebook-sheet" id={section.id} key={section.id}>
                                <div className="docs-entry-index">
                                    <span>{String(index + 1).padStart(2, "0")}</span>
                                    <FileText size={18} />
                                </div>
                                <div className="docs-entry-copy">
                                    <p className="kicker">{section.eyebrow}</p>
                                    <h2>{section.title}</h2>
                                    <p>{section.summary}</p>
                                    <ul>
                                        {section.points.map((point) => (
                                            <li key={point}>{point}</li>
                                        ))}
                                    </ul>
                                    <Link className="notebook-link" to={section.link}>
                                        {section.linkLabel} <ArrowRight size={14} />
                                    </Link>
                                </div>
                            </article>
                        ))
                    ) : (
                        <div className="docs-empty notebook-sheet">
                            <PetNote message="No note matches that phrase yet. Try a surface, action, or boundary." />
                            <button type="button" onClick={() => setQuery("")}>
                                Clear the search
                            </button>
                        </div>
                    )}
                </div>
            </section>
        </>
    );
}

function BlogPage() {
    usePageMeta(
        "Field Notes | KronOS Blog",
        "Read product thinking from KronOS about workspace context, inspectable browser automation, and isolated agent execution."
    );
    const [featured, ...remainingPosts] = blogPosts;

    return (
        <>
            <section className="notebook-page blog-hero section os-chrome-surface">
                <LiquidChrome phase={32} />
                <div className="notebook-punches" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                </div>
                <div className="notebook-folio">
                    <span>KronOS / Journal</span>
                    <span>Vol. 01 · 2026</span>
                </div>
                <p className="kicker">KronOS blog</p>
                <h1>Inside the workspace.</h1>
                <p>
                    Product decisions, operating principles, and practical lessons from designing one workspace for
                    people and agents.
                </p>
                <PetNote
                    className="blog-hero-pet"
                    pose="walk"
                    message="I patrol the margins and collect the interesting decisions."
                />
            </section>

            <section className="blog-index section">
                <Link className="blog-feature-note" to={`/blog/${featured.slug}`}>
                    <div className="blog-note-meta">
                        <span>{featured.note}</span>
                        <span>
                            {featured.date} · {featured.readTime}
                        </span>
                    </div>
                    <div>
                        <p className="kicker">Featured dispatch</p>
                        <h2>{featured.title}</h2>
                        <p>{featured.dek}</p>
                    </div>
                    <span className="blog-read-link">
                        Read the field note <ArrowRight size={16} />
                    </span>
                </Link>

                <div className="blog-note-grid">
                    {remainingPosts.map((post, index) => (
                        <Link
                            className={`blog-note-card blog-note-card-${index + 1}`}
                            to={`/blog/${post.slug}`}
                            key={post.slug}
                        >
                            <div className="blog-note-meta">
                                <span>{post.note}</span>
                                <span>{post.readTime}</span>
                            </div>
                            <PenLine size={21} aria-hidden="true" />
                            <h2>{post.title}</h2>
                            <p>{post.dek}</p>
                            <span className="blog-read-link">
                                Open note <ArrowRight size={14} />
                            </span>
                        </Link>
                    ))}
                </div>

                <div className="blog-community-note notebook-sheet">
                    <div>
                        <p className="kicker">Shape the next note</p>
                        <h2>What should we document in public?</h2>
                    </div>
                    <p>
                        Share the workflow, technical boundary, or agent-design question you want the KronOS team to
                        unpack next.
                    </p>
                    <a className="notebook-link" href={`${releases}/issues`}>
                        Share feedback on GitHub <ArrowRight size={14} />
                    </a>
                </div>
            </section>
        </>
    );
}

function BlogPostPage() {
    const { slug } = useParams();
    const post = blogPosts.find((item) => item.slug === slug);
    const postIndex = post ? blogPosts.findIndex((item) => item.slug === post.slug) : -1;
    const nextPost = post ? blogPosts[(postIndex + 1) % blogPosts.length] : null;

    usePageMeta(
        post ? `${post.title} | KronOS Field Notes` : "Field note | KronOS",
        post?.dek ?? "Read product and engineering notes from KronOS."
    );

    if (!post || !nextPost) {
        return <Navigate to="/blog" replace />;
    }

    return (
        <article className="blog-post">
            <header className="notebook-page blog-post-header section os-chrome-surface">
                <LiquidChrome phase={32} />
                <div className="notebook-punches" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                </div>
                <Link className="blog-back-link" to="/blog">
                    <ArrowRight size={14} /> All field notes
                </Link>
                <div className="blog-note-meta">
                    <span>{post.note}</span>
                    <span>
                        {post.date} · {post.readTime}
                    </span>
                </div>
                <h1>{post.title}</h1>
                <p>{post.dek}</p>
                <PetNote className="blog-post-pet" message="A field note should leave the reasoning visible." />
            </header>

            <section className="blog-prose section">
                <aside className="blog-prose-margin">
                    <span>Filed under</span>
                    <strong>Product principles</strong>
                    <span>Author</span>
                    <strong>KronOS team</strong>
                </aside>
                <div className="blog-prose-copy">
                    {post.sections.map((section, index) => (
                        <section key={section.title}>
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <h2>{section.title}</h2>
                            {section.paragraphs.map((paragraph) => (
                                <p key={paragraph}>{paragraph}</p>
                            ))}
                        </section>
                    ))}
                </div>
            </section>

            <Link className="next-field-note section" to={`/blog/${nextPost.slug}`}>
                <span>Turn to the next field note</span>
                <h2>{nextPost.title}</h2>
                <ArrowRight size={28} />
            </Link>
        </article>
    );
}

function AppRoutes() {
    const location = useLocation();

    return (
        <div className="page-turn-stage">
            <div className="page-leaf" key={location.pathname}>
                <Routes location={location}>
                    <Route path="/" element={<OsLanding />} />
                    <Route path="/capabilities" element={<CapabilityIndexPage />} />
                    <Route path="/capabilities/:slug" element={<CapabilityPage />} />
                    <Route path="/docs" element={<DocumentationPage />} />
                    <Route path="/blog" element={<BlogPage />} />
                    <Route path="/blog/:slug" element={<BlogPostPage />} />
                    <Route path="/security" element={<SecurityPage />} />
                    <Route path="/pricing" element={<PricingPage />} />
                    <Route path="/download" element={<AccessPage />} />
                    <Route path="/contact-sales" element={<AccessPage contact />} />
                    <Route path="/product" element={<Navigate to="/" replace />} />
                    <Route path="/kronoscode" element={<Navigate to="/capabilities/kronoscode" replace />} />
                    <Route path="/terminal" element={<Navigate to="/capabilities/terminal" replace />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </div>
        </div>
    );
}

export function App() {
    const location = useLocation();
    return (
        <OsSiteShell>
            {location.pathname === "/" ? (
                <OsLanding />
            ) : (
                <div className="os-inner-pages">
                    <AppRoutes />
                </div>
            )}
        </OsSiteShell>
    );
}
