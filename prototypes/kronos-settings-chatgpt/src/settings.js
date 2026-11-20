// Copyright 2026, KronOS.
const select = (key, label, value, options, description) => ({
    key,
    label,
    value,
    options,
    description,
    type: "select",
});
const toggle = (key, label, value = true, description) => ({ key, label, value, description, type: "toggle" });
const input = (key, label, value, description, type = "text") => ({ key, label, value, description, type });
const link = (label, target, value = "") => ({ key: target, label, target, value, type: "link" });
const group = (title, rows, note) => ({ title, rows, note });
export const Pages = {
    personalization: {
        title: "Personalization",
        description: "Make KronOS Agent feel more like you.",
        groups: [
            group("", [
                select("display.personality", "Base style and tone", "Default", [
                    "Default",
                    "Helpful",
                    "Technical",
                    "Concise",
                    "Creative",
                    "Teacher",
                    "Pirate",
                    "Shakespeare",
                    "Noir",
                    "Philosopher",
                ]),
            ]),
            group("", [
                select("reasoningDisplay", "Reasoning blocks", "Collapsed", ["Collapsed", "Expanded"]),
                select("toolViewMode", "Tool activity", "Compact", ["Compact", "Expanded"]),
                toggle("reactions", "Message reactions"),
            ]),
            group(
                "Custom instructions",
                [
                    input(
                        "customInstructions",
                        "",
                        "",
                        "What would you like Hermes to know about how you work?",
                        "textarea"
                    ),
                ],
                "Your preferences help shape responses across conversations."
            ),
            group("", [
                link("Memory & context", "memory"),
                link("Voice & language", "voice"),
                link("Model & reasoning", "model"),
            ]),
        ],
    },
    model: {
        title: "Model & reasoning",
        description: "Choose how Hermes thinks and responds.",
        groups: [
            group("Default model", [
                select("model.provider", "Provider", "Nous Portal", [
                    "Nous Portal",
                    "Anthropic",
                    "OpenRouter",
                    "OpenAI",
                    "Gemini",
                    "Custom endpoint",
                ]),
                input("model", "Model", "Use provider default"),
                select("model.reasoning_effort", "Reasoning effort", "Medium", ["Low", "Medium", "High"]),
                input("modelContextLength", "Context window", "128000", undefined, "number"),
            ]),
            group("Agent", [
                input("agent.max_turns", "Max agent steps", "90", undefined, "number"),
                input("agent.api_max_retries", "API retries", "3", undefined, "number"),
                select("agent.image_input_mode", "Image attachments", "Auto", ["Auto", "Native", "Vision tool"]),
            ]),
            group("", [link("Providers & connections", "connections"), link("Delegation", "delegation")]),
        ],
    },
    memory: {
        title: "Memory & context",
        description: "Choose what carries into your next conversation.",
        groups: [
            group(
                "Memory",
                [
                    toggle("memory.memory_enabled", "Persistent memory", true),
                    toggle("memory.user_profile_enabled", "User profile", true),
                    input("memory.memory_char_limit", "Memory budget", "2200", undefined, "number"),
                    input("memory.user_char_limit", "Profile budget", "1375", undefined, "number"),
                ],
                "Hermes can retain useful information about your preferences and work."
            ),
            group("Context", [
                toggle("compression.enabled", "Auto-compression"),
                input("compression.threshold", "Compression threshold", "0.85", undefined, "number"),
                input("compression.target_ratio", "Compression target", "0.5", undefined, "number"),
                input("compression.protect_last_n", "Protected recent messages", "6", undefined, "number"),
            ]),
        ],
    },
    voice: {
        title: "Voice & language",
        description: "Speak naturally. Make the response your own.",
        groups: [
            group("Listening", [
                toggle("stt.enabled", "Speech to text"),
                select("stt.provider", "Transcription provider", "Local", [
                    "Local",
                    "OpenAI",
                    "Groq",
                    "Mistral",
                    "ElevenLabs",
                ]),
                toggle("stt.echo_transcripts", "Echo transcripts", false),
                input("voice.record_key", "Voice shortcut", "Control + Space"),
            ]),
            group("Speaking", [
                toggle("voice.auto_tts", "Read responses aloud", false),
                select("tts.provider", "Voice provider", "Edge", [
                    "Edge",
                    "OpenAI",
                    "ElevenLabs",
                    "Gemini",
                    "Piper",
                    "KittenTTS",
                ]),
                input("tts.edge.voice", "Voice", "en-US-AriaNeural"),
                input("voice.max_recording_seconds", "Max recording length", "120", undefined, "number"),
            ]),
        ],
    },
    tools: {
        title: "Tools & permissions",
        description: "Decide how your agent works with your workspace.",
        groups: [
            group("Approvals", [
                select("approvals.mode", "Approval mode", "Ask", ["Ask", "Auto", "Deny"]),
                input("approvals.timeout", "Approval timeout", "60", undefined, "number"),
                toggle("approvals.mcp_reload_confirm", "Confirm MCP reloads"),
            ]),
            group("Security", [
                toggle("security.redact_secrets", "Redact secrets"),
                toggle("security.allow_private_urls", "Allow private URLs", false),
                toggle("browser.auto_local_for_private_urls", "Local browser for private URLs"),
                toggle("checkpoints.enabled", "File checkpoints"),
            ]),
            group("Terminal", [
                select("terminal.backend", "Execution backend", "Local", ["Local", "Docker", "SSH"]),
                input("terminal.timeout", "Command timeout", "120", undefined, "number"),
                toggle("terminal.persistent_shell", "Persistent shell"),
            ]),
        ],
    },
    delegation: {
        title: "Delegation",
        description: "Fine-tune how Hermes works with other agents.",
        groups: [
            group("Subagents", [
                input("delegation.provider", "Subagent provider", "Inherit from parent"),
                input("delegation.model", "Subagent model", "Inherit from parent"),
                select("delegation.reasoning_effort", "Reasoning effort", "Medium", ["Low", "Medium", "High"]),
                input("delegation.max_concurrent_children", "Parallel subagents", "3", undefined, "number"),
                input("delegation.max_iterations", "Subagent turn limit", "30", undefined, "number"),
                input("delegation.child_timeout_seconds", "Subagent timeout", "300", undefined, "number"),
            ]),
        ],
    },
    browser: {
        title: "Browser",
        description: "Your browsing, at home in your workspace.",
        groups: [
            group("Browsing", [
                input("web:defaulturl", "Start page", "about:blank"),
                select("web:defaultsearch", "Search engine", "Google", ["Google", "DuckDuckGo", "Bing", "Custom"]),
                toggle("web:openlinksinternally", "Open links inside KronOS"),
                select("deviceToolbar", "Device toolbar", "Desktop", ["Desktop", "Tablet", "Mobile"]),
            ]),
            group(
                "",
                [
                    link("Profiles & sessions", "browser-sessions", "Default"),
                    link("Site permissions", "browser-permissions"),
                    link("Import & passwords", "browser-import"),
                    link("Privacy & browsing data", "browser-privacy"),
                ],
                "Website permissions and browsing data belong to the selected browser profile."
            ),
        ],
    },
    "browser-sessions": {
        title: "Profiles & sessions",
        parent: "browser",
        groups: [
            group(
                "Profiles",
                [select("browserProfile", "Session profile", "Default", ["Default", "Work", "Personal", "Private"])],
                "Work and Personal keep separate cookies and website storage. Private sessions are temporary."
            ),
        ],
    },
    "browser-permissions": {
        title: "Site permissions",
        parent: "browser",
        description: "Permissions for example.com in the current profile.",
        groups: [
            group(
                "",
                ["Camera and microphone", "Location", "Notifications", "Read clipboard"].map((label) =>
                    select("permission." + label, label, "Default (blocked)", ["Default (blocked)", "Allow", "Block"])
                )
            ),
            group("General", [select("pageZoom", "Page zoom", "100%", ["75%", "90%", "100%", "110%", "125%", "150%"])]),
        ],
    },
    "browser-import": {
        title: "Import & passwords",
        parent: "browser",
        groups: [
            group(
                "Import bookmarks",
                [
                    select("importSource", "Import from", "Safari", ["Safari", "Arc", "Firefox", "Chrome"]),
                    { key: "bookmarks", label: "Choose bookmarks file", type: "file", accept: ".html,.htm" },
                ],
                "Choose an exported HTML bookmarks file."
            ),
            group(
                "Extensions",
                [
                    select("extensionProfile", "Browser profile", "Work", ["Work", "Personal"]),
                    { key: "extension", label: "Choose Chromium extension files", type: "file", multiple: true },
                ],
                "Safari and Firefox packages cannot be imported directly."
            ),
            group(
                "Passwords",
                [input("passwordManager", "Password manager", "Use your existing vault")],
                "Open your vault app to fill credentials, or use your system browser for password-manager autofill."
            ),
        ],
    },
    "browser-privacy": {
        title: "Privacy & browsing data",
        parent: "browser",
        groups: [
            group(
                "Current profile",
                [
                    select("privacyProfile", "Browser profile", "Default", ["Default", "Work", "Personal"]),
                    { key: "clearHistory", label: "Clear history", type: "action" },
                    { key: "clearStorage", label: "Clear cookies and storage", type: "action" },
                    { key: "cookies", label: "Import session cookies", type: "file", accept: ".json" },
                ],
                "Data actions are simulated in this preview."
            ),
        ],
    },
    widgets: {
        title: "Workspace & widgets",
        description: "A workspace that works the way you do.",
        groups: [
            group("Workspace", [
                select("app:layoutmode", "Workspace layout", "OS", ["OS", "Widgets", "Tabs", "Canvas"]),
                select("app:defaultnewblock", "New widget", "Browser", ["Browser", "Terminal", "Files", "Preview"]),
                select("app:focusfollowscursor", "Focus follows cursor", "Off", ["Off", "On"]),
                input("window:tilegapsize", "Space between widgets", "3", undefined, "number"),
            ]),
            group("Windows", [
                toggle("window:savelastwindow", "Restore last window"),
                toggle("window:confirmclose", "Confirm before closing"),
                toggle("window:fullscreenonlaunch", "Start in full screen", false),
            ]),
            group("Terminal", [
                select("term:cursor", "Cursor style", "Block", ["Block", "Bar", "Underline"]),
                toggle("term:cursorblink", "Blink cursor", false),
                toggle("term:copyonselect", "Copy on select"),
                toggle("term:bellindicator", "Bell indicator"),
                toggle("term:bellsound", "Bell sound", false),
            ]),
        ],
    },
    appearance: {
        title: "Appearance",
        description: "Set the mood for your workspace.",
        groups: [
            group("", [
                select("appearance", "Appearance", "Dark", ["System", "Light", "Dark"]),
                select("theme", "Theme", "KronOS", ["KronOS", "Graphite", "Midnight", "Warm paper"]),
                select("zoom", "Interface size", "100%", ["90%", "100%", "110%", "125%", "150%"]),
                select("sessionDensity", "Conversation density", "Comfortable", ["Comfortable", "Compact"]),
                toggle("translucency", "Translucency", false),
                toggle("backdrop", "Workspace backdrop", false),
            ]),
            group("Conversation", [
                toggle("reasoningCollapsed", "Collapse reasoning by default"),
                toggle("composerGestures", "Composer pop-out gestures"),
                select("embeds", "Embedded content", "Ask", ["Ask", "Allow", "Block"]),
            ]),
        ],
    },
    kronrender: {
        title: "KronRender",
        description: "Your image and media generation workspace.",
        groups: [
            group(
                "Generation",
                [
                    input("render.checkpoint", "Checkpoint", "Select a model"),
                    input("render.seed", "Seed", "0", undefined, "number"),
                    input("render.steps", "Steps", "20", undefined, "number"),
                    input("render.cfg", "Guidance scale", "8", undefined, "number"),
                    select("render.sampler", "Sampler", "Euler", ["Euler", "Euler ancestral", "DPM++ 2M"]),
                    input("render.width", "Width", "1024", undefined, "number"),
                    input("render.height", "Height", "1024", undefined, "number"),
                ],
                "These are workflow-level generation controls, brought together here for this design preview. Values depend on the selected workflow."
            ),
        ],
    },
    kronflow: {
        title: "KronFlow",
        description: "Give your automations a place to call home.",
        groups: [
            group(
                "Workflow defaults",
                [
                    select("flow.timezone", "Timezone", "America/New_York", [
                        "America/New_York",
                        "UTC",
                        "Europe/London",
                    ]),
                    input("flow.executionTimeout", "Execution timeout", "300", undefined, "number"),
                    select("flow.saveDataSuccessExecution", "Save successful executions", "All", ["All", "None"]),
                    select("flow.saveDataErrorExecution", "Save failed executions", "All", ["All", "None"]),
                    input("flow.errorWorkflow", "Error workflow", "None"),
                ],
                "Based on KronFlow’s n8n workflow settings. In the live app, these apply to each workflow."
            ),
        ],
    },
    connections: {
        title: "Providers & connections",
        description: "Connect Hermes to the models and services you use.",
        groups: [
            group(
                "Model providers",
                ["Nous Portal", "Anthropic", "OpenAI", "OpenRouter", "Gemini"].map((label) =>
                    input("provider." + label, label, "", "API key", "password")
                )
            ),
            group(
                "Custom endpoint",
                [input("customEndpoint.url", "Base URL", ""), input("customEndpoint.model", "Model ID", "")],
                "Preview only. Use sample values rather than real credentials."
            ),
        ],
    },
    notifications: {
        title: "Notifications",
        groups: [
            group("Agent notifications", [
                toggle("notificationComplete", "Task completed"),
                toggle("notificationApproval", "Approval requested"),
                toggle("notificationSound", "Notification sound", false),
            ]),
        ],
    },
};
export const Navigation = [
    {
        title: "",
        entries: [
            ["appearance", "Appearance", "palette"],
            ["personalization", "Personalization", "sliders"],
            ["notifications", "Notifications", "bell"],
        ],
    },
    {
        title: "KronOS Agent",
        entries: [
            ["model", "Model & reasoning", "sparkles"],
            ["memory", "Memory & context", "brain"],
            ["voice", "Voice & language", "wave"],
            ["tools", "Tools & permissions", "shield"],
            ["delegation", "Delegation", "users"],
            ["connections", "Providers & connections", "plug"],
        ],
    },
    {
        title: "Workspace",
        entries: [
            ["browser", "Browser", "globe"],
            ["widgets", "Workspace & widgets", "layout"],
            ["kronrender", "KronRender", "photo"],
            ["pen", "Pen.dev", "pen"],
            ["kronflow", "KronFlow", "flow"],
        ],
    },
];
