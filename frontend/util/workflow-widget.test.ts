import { expect, it } from "vitest";
import { workflowWidgetParameters } from "./workflow-widget";

it("normalizes a browser link group and rejects unsafe schemes before configuring a node", () => {
    expect(
        workflowWidgetParameters("web", {
            operation: "browser_open_links",
            urls: " https://example.com\n\nhttps://example.org ",
        })
    ).toMatchObject({ urls: "https://example.com\nhttps://example.org" });
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "https://user:password@example.com", "invalid"])
        expect(() => workflowWidgetParameters("web", { operation: "browser_open_links", urls: url })).toThrow();
    expect(() =>
        workflowWidgetParameters("term", { operation: "browser_open_links", urls: "https://example.com" })
    ).toThrow("supported");
});
it("keeps VM actions separate from host input and requires an exact VM target", () => {
    expect(() => workflowWidgetParameters("sandbox", { operation: "widget_type", text: "ls" })).toThrow(
        "sandbox actions"
    );
    expect(() => workflowWidgetParameters("sandbox", { operation: "sandbox_exec", text: "pwd" })).toThrow(
        "Choose a sandbox"
    );
    expect(
        workflowWidgetParameters("sandbox", {
            operation: "sandbox_run_task",
            text: "Inspect files",
            computerId: "linux-1",
        })
    ).toMatchObject({ operation: "sandbox_run_task", text: "Inspect files", computerId: "linux-1" });
});
