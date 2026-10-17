import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LocalLinuxPanel } from "./local-linux-panel";
vi.mock("../lib/local-linux", () => ({
    localLinux: {
        subscribe: () => () => {},
        getSnapshot: () => state,
        readFile: vi.fn().mockResolvedValue("<h1>Actual guest file</h1>"),
    },
}));
vi.mock("./linux-code-tools", () => ({ LinuxCodeTools: () => <div>Code sandbox</div> }));
vi.mock("./linux-desktop", () => ({ LinuxDesktop: () => <div>Desktop runtime</div> }));
const state = { phase: "running", ready: true, output: "Linux guest console", error: "" };
it("switches browser-style tabs and isolates guest HTML from app origin", async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
        await act(async () => root.render(<LocalLinuxPanel onBack={vi.fn()} />));
        expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Terminal");
        await act(async () => container.querySelector<HTMLButtonElement>("#linux-tab-browser")!.click());
        expect(container.querySelector<HTMLDivElement>("#linux-pane-terminal")!.hidden).toBe(true);
        await act(async () =>
            Array.from(container.querySelectorAll("button"))
                .find((b) => b.textContent === "Open preview")!
                .click()
        );
        const frame = container.querySelector<HTMLIFrameElement>('iframe[title="Linux HTML preview"]')!;
        expect(frame.getAttribute("sandbox")).toBe("");
        expect(frame.srcdoc).toContain("Actual guest file");
        expect(frame.srcdoc).toContain("default-src 'none'");
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});
