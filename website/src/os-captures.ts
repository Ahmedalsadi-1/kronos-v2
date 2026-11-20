type ProductCapture = {
    file: string;
    label: string;
    width: number;
    height: number;
    status?: string;
    kind?: "video";
    poster?: string;
    clipId?: string;
};

const Captures = {
    overview: {
        file: "01-canvas-overview.png",
        label: "Terminal, browser, and a connected computer on the KronOS canvas",
        width: 1606,
        height: 1312,
    },
    iphone: {
        file: "02-iphone-and-web.png",
        label: "An iPhone simulator alongside the KronOS browser",
        width: 1606,
        height: 1312,
        status: "Labs preview",
    },
    devices: {
        file: "03-canvas-and-devices.png",
        label: "Browser, terminal, and a connected device arranged on Canvas",
        width: 1530,
        height: 1050,
    },
    web: {
        file: "04-web-workspace.png",
        label: "The KronOS browser beside the agent panel",
        width: 1530,
        height: 1050,
    },
    history: {
        file: "05-agent-history.png",
        label: "Agent chat history and workspace navigation",
        width: 1530,
        height: 1050,
    },
    voice: {
        file: "06-voice-workspace.png",
        label: "Optional voice input listening beside the browser",
        width: 1530,
        height: 1050,
        status: "Experimental",
    },
    canvas: {
        file: "07-orbit-canvas.png",
        label: "A complete design project arranged on the KronOS canvas",
        width: 1530,
        height: 1050,
    },
    agentCanvas: {
        file: "08-orbit-agent-canvas.png",
        label: "KronOS Agent working with selected designs on Canvas",
        width: 1530,
        height: 1050,
    },
} satisfies Record<string, ProductCapture>;

function makeClip(clipId: string, label: string, status?: string): ProductCapture {
    return {
        kind: "video",
        clipId,
        file: `clips/${clipId}.mp4`,
        poster: `clips/posters/${clipId}.jpg`,
        label,
        width: 1280,
        height: 720,
        status,
    };
}

const Clips = {
    A01: makeClip("A01", "Start a task with KronOS Agent"),
    A02: makeClip("A02", "Preview a tab, then split the view"),
    A03: makeClip("A03", "Keep chat beside a connected sandbox desktop"),
    A04: makeClip("A04", "Use a browser and map inside the sandbox"),
    A05: makeClip("A05", "Find a frame and pull back to the canvas"),
    A06: makeClip("A06", "Annotate a result in the browser"),
    A07: makeClip("A07", "Draw shapes, add text, and connect design ideas"),
    A08: makeClip("A08", "Give the agent a task and inspect terminal verification"),
    A09: makeClip("A09", "iPhone and Android experiments in the workspace", "Labs preview"),
    A10: makeClip("A10", "A view of parallel workspaces, including experimental devices", "Includes Labs devices"),
    B01: makeClip("B01", "A walkthrough of the KronOS canvas"),
    B02: makeClip("B02", "Zoom into the browser on a connected computer"),
    B03: makeClip("B03", "Navigate the canvas and locate project frames"),
    B04: makeClip("B04", "Preview a design in the browser"),
    B05: makeClip("B05", "Agent work, code, and a localhost preview together"),
    B06: makeClip("B06", "Pull back and arrange your workspace"),
    B07: makeClip("B07", "Inspect the browser preview and return to the workspace"),
    B08: makeClip("B08", "Inspect agent tools and configuration"),
};

export const ProductCaptures: Record<string, ProductCapture> = {
    "workspace-hero": Clips.A01,
    "os-desktop": Clips.A01,
    canvas: Clips.A05,
    design: Clips.A07,
    tabs: Clips.A02,
    "agent-workspace": Clips.A08,
    "connected-workflow": Clips.B06,
    "workspace-canvas": Clips.B01,
    "workspace-canvas-detail-1": Clips.B03,
    "workspace-canvas-detail-2": Captures.devices,
    "workspace-canvas-detail-3": Clips.B04,
    "agent-detail-1": Captures.history,
    "agent-detail-2": Clips.B05,
    "agent-detail-3": Clips.B08,
    "agent-detail-4": Clips.A10,
    terminal: Clips.B02,
    "terminal-detail-1": Clips.A08,
    "browser-automation": Clips.A06,
    "browser-automation-detail-1": Clips.B02,
    "browser-automation-detail-2": Captures.devices,
    "browser-automation-detail-3": Clips.B07,
    "sandbox-vms": Clips.A04,
    "sandbox-vms-detail-1": Clips.A03,
    voice: Captures.voice,
    "voice-detail-1": Captures.voice,
    "labs-iphone": Clips.A09,
};
