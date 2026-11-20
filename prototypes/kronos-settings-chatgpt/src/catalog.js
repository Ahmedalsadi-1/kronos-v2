// Copyright 2026, KronOS.
import { brandText, publicKey } from "./branding";
import Configuration from "./configuration.json";
import Environment from "./environment-fields.json";
import FlowFields from "./flow-fields.json";
import Ui from "./hermes-ui.json";
import InterfaceFields from "./interface-fields.json";
import Metadata from "./interface-metadata.json";
import CanvasFields from "./pen-fields.json";
import RenderFields from "./render-fields.json";
import { Pages as BasePages } from "./settings";
export const ConfigFields = [...Configuration, ...RenderFields, ...FlowFields, ...Environment];
const clone = (value) => JSON.parse(JSON.stringify(value));
export const Pages = clone(BasePages);
const title = (value) => value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const group = (title, rows, note, collapsed = false) => ({ title, rows, note, collapsed });
const toggle = (key, label, value = true) => ({ key, label, value, type: "toggle" });
const text = (key, label, value = "", type = "text") => ({ key, label, value, type });
const action = (key, label, description) => ({ key, label, type: "action", description });
const link = (label, target) => ({ key: target, label, type: "link", target });
const byKey = new Map(Configuration.map((f) => [f.key, f]));
const aliases = {
    modelContextLength: "model_context_length",
    customInstructions: "agent.system_prompt",
    reasoningDisplay: "display.show_reasoning",
    "model.provider": null,
};
for (const page of Object.values(Pages))
    for (const g of page.groups)
        for (const row of g.rows) {
            const actual = byKey.get(aliases[row.key] || row.key);
            if (!actual) continue;
            const friendlyLabel = row.label;
            Object.assign(row, actual, { label: friendlyLabel || actual.label });
        }
const personality = Pages.personalization.groups[0].rows[0];
personality.options = [
    "",
    "helpful",
    "concise",
    "technical",
    "creative",
    "teacher",
    "kawaii",
    "catgirl",
    "pirate",
    "shakespeare",
    "surfer",
    "noir",
    "uwu",
    "philosopher",
    "hype",
];
personality.type = "select";
Pages.pen = {
    title: "Design canvas",
    description: "Precision, navigation, playback, and export.",
    groups: [...new Set(CanvasFields.map((f) => f.group))].map((name) =>
        group(
            name,
            CanvasFields.filter((f) => f.group === name).map((f) => ({
                ...f,
                source: "Canvas",
                type: f.kind === "boolean" ? "toggle" : f.kind === "enum" ? "select" : "number",
                value:
                    f.kind === "boolean"
                        ? !["showPixelGrid", "scrollWheelZoom", "invertZoomDirection"].includes(f.key)
                        : f.kind === "enum"
                          ? f.options[0].label
                          : f.key === "bigNudge"
                            ? 10
                            : 1,
                options: f.options?.map((o) => o.label),
            }))
        )
    ),
};
ConfigFields.push(...Pages.pen.groups.flatMap((group) => group.rows).map((row) => ({ ...row, category: row.group })));
const generation = Pages.kronrender.groups;
Pages.kronrender.groups = [
    group(
        "Runtime",
        [
            text("KRONOS_RENDER_ROOT", "Runtime source folder"),
            text("KRONOS_RENDER_HOME", "Runtime data folder"),
            text("KRONOS_RENDER_PYTHON", "Python executable"),
        ],
        "Managed runtime paths. These fields preview environment configuration; changes do not restart the engine.",
        true
    ),
    ...generation,
    ...[...new Set(RenderFields.map((field) => field.category))].map((category) =>
        group(
            category,
            RenderFields.filter((field) => field.category === category),
            undefined,
            true
        )
    ),
];
Pages.kronflow.groups = [
    group(
        "Workflow settings",
        FlowFields,
        "These settings belong to the selected workflow. Live execution and credentials require the connected runtime."
    ),
];
Pages.billing = {
    title: "Billing & usage",
    description: "Your account, subscriptions, credits, and usage.",
    groups: [
        group("Account", [], "Connect your account in KronOS to see your plan, credits, usage, and payment methods."),
        group(
            "Preferences",
            [
                toggle("billing.showCost", "Show usage cost in conversations"),
                toggle("billing.creditAlerts", "Low-credit notifications"),
            ],
            "This preview does not connect to billing or process payments."
        ),
    ],
};
Pages.user = {
    title: "User settings",
    description: "Your profile and preferences, in one place.",
    groups: [
        group(
            "Profile",
            [text("account.name", "Name"), text("account.email", "Email address", "", "email")],
            "Edit your preview profile. Your name and email appear in the sidebar."
        ),
        group("Preferences", [
            {
                key: "account.language",
                label: "Language",
                type: "select",
                value: "English",
                options: ["English", "Arabic", "Spanish", "French", "German", "Japanese"],
            },
            text("account.timezone", "Timezone", "America/New_York"),
        ]),
        group("Your workspace", [
            link("Appearance & themes", "appearance"),
            link("Personalization", "personalization"),
            link("Notifications", "notifications"),
            link("Browser profiles", "browser-sessions"),
            link("Billing & usage", "billing"),
        ]),
        group(
            "Your data",
            [
                action(
                    "export-preview",
                    "Export preview settings",
                    "Download a JSON backup of your preview preferences."
                ),
                action("clear-profile", "Clear preview profile", "Remove your name and email from this preview."),
            ],
            "This standalone preview is not connected to KronOS sign-in. Profile edits are stored in this browser only."
        ),
    ],
};
Pages.gateway = {
    title: "Gateway",
    description: "Manage how the desktop connects to Hermes.",
    groups: [
        group(
            "Connection",
            [
                {
                    key: "gateway.mode",
                    label: "Connection mode",
                    value: "Local",
                    type: "select",
                    options: ["Local", "Remote URL", "SSH tunnel"],
                },
                text("gateway.url", "Gateway URL", "http://127.0.0.1:8642"),
                text("gateway.token", "Access token", "", "password"),
                text("gateway.sshHost", "SSH host"),
                text("gateway.sshUser", "SSH user"),
                text("gateway.sshPort", "SSH port", 22, "number"),
            ],
            "Connection fields are editable samples. No gateway is contacted from this preview."
        ),
    ],
};
Pages.sessions = {
    title: "Sessions & history",
    description: "Projects, archived conversations, and session behavior.",
    groups: [
        group("Conversations", [
            text("sessions.defaultProject", "Default project folder"),
            toggle("sessions.autoArchive", "Auto-archive sessions", false),
            text("sessions.archiveDays", "Archive after days", 30, "number"),
        ]),
        group("Archives", [], "Archived sessions will appear here when connected to the desktop runtime."),
    ],
};
Pages.skills = {
    title: "Skills & MCP",
    description: "Manage what your agent can do.",
    groups: [
        group("Capabilities", [
            link("Enabled toolsets", "tools"),
            link("MCP server configuration", "advanced"),
            link("Plugins", "plugins"),
        ]),
        group(
            "Installed skills",
            [],
            "Installed skills and live MCP server status come from the connected Hermes runtime. This preview includes their configuration fields below."
        ),
    ],
};
Pages.plugins = { title: "Plugins", description: "Agent extensions, loading behavior, and hooks.", groups: [] };
Pages.computers = {
    title: "Computers & sandbox",
    description: "Virtual desktops and isolated execution.",
    groups: [
        group(
            "Computer providers",
            [
                toggle("computer.qemu.enabled", "Ubuntu VM provider"),
                toggle("computer.container.enabled", "Container desktop provider", false),
            ],
            "Provider availability is sample state. This preview does not start or change computers."
        ),
    ],
};
Pages.shortcuts = {
    title: "Keyboard shortcuts",
    description: "The actual built-in Hermes shortcut catalog.",
    groups: [...new Set(Metadata.shortcuts.map((s) => s.category))].map((category) =>
        group(
            title(category),
            Metadata.shortcuts
                .filter((s) => s.category === category)
                .map((s) => text("shortcut." + s.id, s.label, s.defaults.join(" / "))),
            undefined,
            true
        )
    ),
};
Pages.keys = {
    title: "Keys & environment",
    description: "Provider, tool, messaging, and integration configuration.",
    groups: [...new Set(Environment.map((f) => f.category))].map((category) =>
        group(
            title(category),
            Environment.filter((f) => f.category === category).map((f) => ({ ...f, value: "" })),
            undefined,
            true
        )
    ),
};
Pages.about = {
    title: "About & updates",
    description: "KronOS workspace preferences and update behavior.",
    groups: [group("Configuration", [link("All configuration", "configuration"), link("Keys & environment", "keys")])],
};
Pages.advanced = {
    title: "Advanced",
    description: "Runtime settings for agents, tools, and connections.",
    groups: [
        group("", [
            link("All configuration", "configuration"),
            link("Keys & environment", "keys"),
            link("Gateway", "gateway"),
        ]),
    ],
};
Pages.notifications.groups = [
    group("Desktop notifications", [
        toggle("notifications.enabled", "Enable notifications"),
        ...Object.entries(Metadata.notifications.kinds).map(([key, copy]) => ({
            ...toggle("notifications." + key, copy.label),
            description: copy.description,
        })),
    ]),
    group("Sound", [text("notifications.sound", "Completion sound", "1", "number")]),
];
const mapping = {
    model: ["model", "auxiliary", "fallback", "fallback_providers"],
    personalization: ["display", "human_delay"],
    memory: ["memory", "compression", "context"],
    voice: ["tts", "stt", "voice", "wake_word"],
    tools: [
        "approvals",
        "security",
        "terminal",
        "tool_output",
        "code_execution",
        "checkpoints",
        "proxy",
        "command_allowlist",
        "file_read_max_chars",
        "toolsets",
    ],
    delegation: ["delegation"],
    browser: ["web", "browser"],
    widgets: ["app", "tab", "widget", "preview", "window", "editor", "markdown"],
    appearance: [],
    gateway: ["gateway", "connections"],
    sessions: ["session", "sessions", "max_live_sessions", "max_concurrent_sessions"],
    skills: ["skills", "mcp"],
    plugins: ["plugins"],
    computers: ["sandbox", "computer_use"],
    connections: ["providers", "credential_pool_strategies", "auth"],
    about: ["autoupdate", "updates", "telemetry"],
    advanced: [],
};
const assigned = new Set();
for (const [pageId, prefixes] of Object.entries(mapping)) {
    const page = Pages[pageId];
    const existing = new Set(page.groups.flatMap((g) => g.rows.map((r) => r.key)));
    const fields = Configuration.filter((f) => prefixes.includes(f.key.split(/[.:]/)[0]));
    fields.forEach((f) => assigned.add(f.key));
    for (const category of [
        ...new Set(fields.filter((f) => !existing.has(f.key)).map((f) => f.source + " / " + f.category)),
    ]) {
        const rows = fields.filter((f) => !existing.has(f.key) && f.source + " / " + f.category === category);
        if (rows.length) page.groups.push(group(title(category.split(" / ")[1]), rows, undefined, true));
    }
}
const remaining = Configuration.filter((f) => !assigned.has(f.key));
for (const category of [...new Set(remaining.map((f) => f.category))])
    Pages.advanced.groups.push(
        group(
            title(category),
            remaining.filter((f) => f.category === category),
            undefined,
            true
        )
    );

// Interface preferences live outside the agent YAML schema; keep their own source inventory.
const InterfaceDestinations = {
    appearance: "appearance",
    "terminal-font-setting": "appearance",
    pet: "pets",
    "quick-entry": "quick-entry",
    config: "advanced",
    gateway: "gateway",
    connections: "connection-registry",
    model: "model",
    notifications: "notifications",
    sessions: "sessions",
    about: "about",
    browser: "browser",
    "workspace-tool": "widgets",
    "custom-endpoints": "custom-endpoints",
};
const select = (key, label, value, options, description) => ({
    key,
    label,
    value,
    options,
    description,
    type: "select",
});
Pages.pets = {
    title: "KronPets",
    description: "A companion for your workspace.",
    groups: [
        group(
            "Companion",
            [
                toggle("pet.enabled", "Show companion", false),
                text("pet.selected", "Active companion"),
                text("pet.name", "Companion name"),
                action("pet.export", "Export companion"),
                action("pet.remove", "Remove companion"),
            ],
            "Companion galleries and installation status are supplied by the connected KronOS desktop."
        ),
    ],
};
Pages["quick-entry"] = { title: "KronQuick", description: "Reach your agent from anywhere.", groups: [] };
Pages["connection-registry"] = {
    title: "KronConnections",
    description: "Manage local, remote, cloud, and SSH agent sources.",
    groups: [
        group(
            "Connection registry",
            [{ ...text("ui.connections", "Registered connections", []), type: "json", value: [] }],
            "Connection records support name, kind, URL, authentication mode, SSH host, and identity file. Live connection tests require the desktop runtime."
        ),
    ],
};
Pages["custom-endpoints"] = {
    title: "KronEndpoints",
    description: "Connect custom model services.",
    groups: [
        group("Endpoint", [
            text("endpoint.name", "Name"),
            text("endpoint.url", "Base URL"),
            text("endpoint.model", "Model ID"),
            text("endpoint.key", "API key", "", "password"),
            select("endpoint.auth", "Authentication", "API key", ["API key", "None"]),
            select("endpoint.api", "API protocol", "OpenAI compatible", ["OpenAI compatible", "Anthropic compatible"]),
        ]),
        group("Saved endpoints", [{ ...text("ui.customEndpoints", "Endpoint registry", []), type: "json", value: [] }]),
    ],
};
Pages.connections.groups.unshift(
    group("Providers", [
        link("Accounts", "provider-accounts"),
        link("API keys", "keys"),
        link("Custom endpoints", "custom-endpoints"),
        link("Connection registry", "connection-registry"),
    ])
);
Pages["provider-accounts"] = {
    title: "KronAccounts",
    description: "Model accounts and provider authentication.",
    groups: [
        group(
            "Provider accounts",
            [{ ...text("ui.providerAccounts", "Account registry", []), type: "json", value: [] }],
            "Actual connected accounts and authentication options are supplied by the desktop runtime."
        ),
        group(
            "Provider catalog",
            Ui.PROVIDER_GROUPS.filter(
                (item, index, list) => list.findIndex((value) => value.name === item.name) === index
            ).map((item) => text("providerAccount." + item.prefix, item.name, ""))
        ),
    ],
};
Pages.skills.groups.push(
    group(
        "Skill and server registries",
        [
            { ...text("ui.skills", "Installed skills", []), type: "json", value: [] },
            { ...text("ui.mcp", "MCP servers", {}), type: "json", value: {} },
        ],
        "The preview starts with empty collections rather than inventing installed skills or connected servers."
    )
);
Pages.plugins.groups.unshift(
    group(
        "Plugin registry",
        [{ ...text("ui.plugins", "Installed plugins", []), type: "json", value: [] }],
        "Installed plugin settings depend on the connected runtime."
    )
);
Pages.model.groups.push(
    group(
        "Model routing",
        [{ ...text("ui.modelReferences", "Model reference slots", []), type: "json", value: [] }],
        "Reference slots support provider, model, reasoning effort, and enabled state.",
        true
    )
);
Pages.delegation.groups.push(
    group(
        "Specialist routing",
        [
            { ...text("ui.delegationProfiles", "Specialist profiles", []), type: "json", value: [] },
            { ...text("ui.delegationRoutes", "Model routes", []), type: "json", value: [] },
        ],
        undefined,
        true
    )
);
Pages.sessions.groups.push(
    group(
        "Archived conversations",
        [{ ...text("ui.archivedSessions", "Archived sessions", []), type: "json", value: [] }],
        "Live session lists, restore, and deletion require the connected desktop."
    )
);
Pages.gateway.groups.push(
    group(
        "Remote sources",
        [
            { ...text("ui.cloudOrganizations", "Cloud organizations", []), type: "json", value: [] },
            { ...text("ui.cloudAgents", "Cloud agents", []), type: "json", value: [] },
        ],
        undefined,
        true
    )
);
const InterfaceTypes = {
    Language: {
        type: "select",
        value: "English",
        options: ["English", "Arabic", "Spanish", "French", "German", "Japanese"],
    },
    "Interface font": { type: "select", value: "System", options: ["System", "Mono"] },
    "Button style": { type: "select", value: "Default", options: ["Default", "Flat", "Outlined"] },
    "UI Scale": { type: "select", value: "100%", options: ["90%", "100%", "110%", "125%", "150%", "175%"] },
    "Session List Density": { type: "select", value: "Comfortable", options: ["Compact", "Comfortable", "Detailed"] },
    "Window Translucency": { type: "toggle", value: false },
    "Tool Call Display": { type: "select", value: "Product", options: ["Product", "Technical"] },
    "Inline Embeds": { type: "select", value: "Ask", options: ["Ask", "Always", "Off"] },
    "Automatic updates": { type: "toggle", value: true },
    "Completion Sound": { type: "number", value: 1, min: 1, max: 14 },
    Authentication: { type: "select", value: "Token", options: ["Token", "Account sign-in"] },
    Size: { type: "number", value: 1, min: 0.5, max: 3 },
    "Max preview / image load size": { type: "number", value: 16, min: 1 },
    "Archive after": { type: "number", value: 30, min: 1 },
};
for (const field of InterfaceFields) Object.assign(field, InterfaceTypes[field.label] || {});
for (const category of [...new Set(InterfaceFields.map((field) => field.category))]) {
    const pageId = InterfaceDestinations[category] || "advanced";
    const rows = InterfaceFields.filter((field) => field.category === category).map((field) =>
        /token|password|api key/i.test(field.label) ? { ...field, type: "password", secret: true } : field
    );
    Pages[pageId].groups.push(group("Desktop controls", rows, undefined, true));
    ConfigFields.push(...rows);
}
Pages.appearance.groups.push(
    group(
        "Interface styling",
        [
            select("ui.interfaceFont", "Interface font", "System", ["System", "Mono"]),
            select("ui.buttonStyle", "Button style", "Default", ["Default", "Flat", "Outlined"]),
            select("ui.toolDisplay", "Tool call display", "Product", ["Product", "Technical"]),
            select("ui.inlineEmbeds", "Inline embeds", "Ask", ["Ask", "Always", "Off"]),
            text("ui.terminalFont", "Terminal font"),
            text("ui.themeExtension", "Theme extension ID"),
            action("ui.themeInstall", "Import theme"),
            link("Companion settings", "pets"),
            link("Quick entry", "quick-entry"),
        ],
        undefined,
        true
    )
);

Pages.shortcuts.groups.push(
    group(
        "Fixed shortcuts",
        (Metadata.readonlyShortcuts || []).map((shortcut) => ({
            key: "shortcut.fixed." + shortcut.id,
            label: shortcut.label,
            value: shortcut.keys.join(" / "),
            type: "readonly",
        })),
        undefined,
        true
    )
);
Pages.memory.groups.push(
    group(
        "Memory provider configuration",
        [
            { ...text("ui.memoryProviderConfig", "Provider options", {}), type: "json", value: {} },
            text("ui.memoryProviderToken", "Provider access token", "", "password"),
        ],
        "Provider-specific fields are discovered from the selected provider in the connected desktop.",
        true
    )
);
Pages.billing.groups.push(
    group(
        "Credit preferences",
        [
            toggle("ui.billing.autoRefill", "Automatic credit refill", false),
            text("ui.billing.refillThreshold", "Auto-refill threshold", 0, "number"),
            text("ui.billing.reloadTo", "Auto-refill reload-to amount", 0, "number"),
            action("ui.billing.paymentMethods", "Manage payment methods"),
            action("ui.billing.plans", "Manage subscription"),
            action("ui.billing.usage", "View usage and credits"),
        ],
        "Amounts here are preview values. Billing actions use the connected account and are not submitted from this preview.",
        true
    )
);

const ServiceNames = {
    slack: "Slack",
    discord: "Discord",
    telegram: "Telegram",
    mattermost: "Mattermost",
    matrix: "Matrix",
};
for (const [key, name] of Object.entries(ServiceNames))
    Pages["integration-" + key] = {
        title: name,
        description: `Configure the ${name} integration.`,
        groups: [
            group(
                "Connection and behavior",
                Configuration.filter((field) => field.source === "Hermes" && field.key.startsWith(key + "."))
            ),
            group(
                "Credentials",
                Environment.filter((field) => field.key.toLowerCase().startsWith(key))
            ),
        ],
    };
Pages.integrations = {
    title: "Integrations",
    description: "Connect your models, apps, services, and workspace tools.",
    groups: [
        group("Models & providers", [
            link("Provider accounts", "provider-accounts"),
            link("API keys & environment", "keys"),
            link("Custom endpoints", "custom-endpoints"),
        ]),
        group(
            "Apps & messaging",
            Object.keys(ServiceNames).map((key) => link(ServiceNames[key], "integration-" + key))
        ),
        group("Agent connections", [
            link("Connections", "connection-registry"),
            link("Gateway", "gateway"),
            link("Skills & MCP", "skills"),
            link("Plugins", "plugins"),
        ]),
        group("Workspace tools", [
            link("KronVoice", "voice"),
            link("KronRender", "kronrender"),
            link("KronCanvas", "pen"),
            link("KronFlow", "kronflow"),
        ]),
    ],
};
Pages.configuration = {
    title: "All configuration",
    description: `${ConfigFields.length.toLocaleString()} fields across Hermes, desktop, integrations, canvas, and environment.`,
    catalog: true,
    groups: [...new Set(ConfigFields.map((f) => f.source + " / " + f.category))].map((category) =>
        group(
            category,
            ConfigFields.filter((f) => f.source + " / " + f.category === category),
            undefined,
            true
        )
    ),
};
export const Navigation = [
    {
        title: "",
        entries: [
            ["user", "User settings", "users"],
            ["billing", "Billing & usage", "plug"],
            ["appearance", "Appearance & themes", "palette"],
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
            ["gateway", "Gateway", "plug"],
            ["skills", "Skills & MCP", "sparkles"],
            ["plugins", "Plugins", "plug"],
            ["sessions", "Sessions & history", "brain"],
        ],
    },
    {
        title: "Workspace",
        entries: [
            ["browser", "Browser", "globe"],
            ["widgets", "Workspace & widgets", "layout"],
            ["computers", "Computers & sandbox", "layout"],
            ["kronrender", "KronRender", "photo"],
            ["pen", "Design canvas", "pen"],
            ["kronflow", "KronFlow", "flow"],
        ],
    },
    {
        title: "More",
        entries: [
            ["shortcuts", "Keyboard shortcuts", "sliders"],
            ["keys", "Keys & environment", "plug"],
            ["advanced", "Advanced", "sliders"],
            ["configuration", "All configuration", "layout"],
            ["about", "About & updates", "sparkles"],
        ],
    },
];

const PageNames = {
    user: "Profile",
    billing: "Billing & usage",
    appearance: "Appearance & themes",
    personalization: "Personalization",
    notifications: "Notifications",
    model: "Models & reasoning",
    memory: "Memory & context",
    voice: "KronVoice",
    tools: "Tools & permissions",
    delegation: "Delegation",
    connections: "Providers",
    gateway: "Gateway",
    skills: "Skills & MCP",
    plugins: "Plugins",
    sessions: "Sessions & history",
    browser: "Browser",
    widgets: "Workspace & widgets",
    computers: "Computers & sandbox",
    kronrender: "KronRender",
    pen: "KronCanvas",
    kronflow: "KronFlow",
    shortcuts: "Keyboard shortcuts",
    keys: "Keys & environment",
    advanced: "Advanced",
    configuration: "All settings",
    about: "About & updates",
    pets: "Desktop companion",
    "quick-entry": "Quick entry",
    "provider-accounts": "Provider accounts",
    "custom-endpoints": "Custom endpoints",
    "connection-registry": "Connections",
    integrations: "Integrations",
    "browser-sessions": "Browser profiles",
    "browser-permissions": "Site permissions",
    "browser-import": "Import & passwords",
    "browser-privacy": "Privacy & browsing data",
};
for (const [id, page] of Object.entries(Pages)) {
    page.title = PageNames[id] || brandText(page.title);
    page.description = brandText(page.description);
    for (const section of page.groups) {
        section.title = brandText(section.title);
        section.note = brandText(section.note);
        for (const row of section.rows) {
            row.label = brandText(row.label);
            row.description = brandText(row.description);
            row.displayKey = publicKey(row);
        }
    }
}
Navigation.splice(
    0,
    Navigation.length,
    {
        title: "",
        entries: [
            ["user", "Profile", "users"],
            ["appearance", "Appearance & themes", "palette"],
            ["personalization", "Personalization", "sliders"],
            ["notifications", "Notifications", "bell"],
        ],
    },
    {
        title: "Agent",
        entries: [
            ["model", "Models & reasoning", "sparkles"],
            ["memory", "Memory & context", "brain"],
            ["voice", "KronVoice", "wave"],
            ["tools", "Tools & permissions", "shield"],
            ["delegation", "Delegation", "users"],
            ["sessions", "Sessions & history", "brain"],
            ["pets", "Desktop companion", "sparkles"],
            ["quick-entry", "Quick entry", "sliders"],
        ],
    },
    {
        title: "Integrations",
        entries: [
            ["integrations", "Integrations", "plug"],
            ["connections", "Providers", "plug"],
            ["connection-registry", "Connections", "plug"],
            ["gateway", "Gateway", "plug"],
            ["skills", "Skills & MCP", "sparkles"],
            ["plugins", "Plugins", "plug"],
        ],
    },
    {
        title: "Workspace",
        entries: [
            ["browser", "Browser", "globe"],
            ["widgets", "Workspace & widgets", "layout"],
            ["computers", "Computers & sandbox", "layout"],
            ["kronrender", "KronRender", "photo"],
            ["pen", "KronCanvas", "pen"],
            ["kronflow", "KronFlow", "flow"],
        ],
    },
    {
        title: "More",
        entries: [
            ["shortcuts", "Keyboard shortcuts", "sliders"],
            ["keys", "Keys & environment", "plug"],
            ["configuration", "All settings", "layout"],
            ["advanced", "Advanced", "sliders"],
            ["billing", "Billing & usage", "plug"],
            ["about", "About & updates", "sparkles"],
        ],
    }
);
for (const nav of Navigation) for (const entry of nav.entries) entry[1] = Pages[entry[0]].title;
for (const page of Object.values(Pages))
    for (const section of page.groups)
        for (const row of section.rows) if (row.target) row.label = Pages[row.target].title;
export const SearchIndex = [
    ...new Map(
        Object.entries(Pages)
            .filter(([id]) => id !== "configuration")
            .flatMap(([id, p]) =>
                p.groups.flatMap((g) =>
                    g.rows.map((r) => [
                        r.key,
                        {
                            id,
                            key: r.key,
                            label: r.label || g.title,
                            page: p.title,
                            text: `${r.key} ${r.displayKey} ${r.label} ${p.title} ${g.title} ${r.description || ""}`.toLowerCase(),
                        },
                    ])
                )
            )
    ).values(),
];

export const SecretKeys = new Set(
    Object.values(Pages).flatMap((page) =>
        page.groups.flatMap((group) =>
            group.rows.filter((row) => row.type === "password" || row.secret).map((row) => row.key)
        )
    )
);
export function persistedPreview(values) {
    return Object.fromEntries(Object.entries(values).filter(([key]) => !SecretKeys.has(key)));
}
