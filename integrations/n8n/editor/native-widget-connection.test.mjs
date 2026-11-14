import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchNativeWidgetConnection } from "./native-widget-connection.mjs";

test("drops an output connection on the exact live widget while preserving workflow scope", async () => {
    const previous = globalThis.window;
    const events = [];
    globalThis.window = { dispatchEvent: event => events.push(event) };
    try {
        const event = { target: { closest: selector => selector === ".os-window[data-block-id]" ? { getAttribute: () => "browser-1" } : null } };
        assert.equal(dispatchNativeWidgetConnection(event, { tabId: "tab", workflowId: "flow" }, { handleType: "source" }), true);
        await Promise.resolve();
        assert.equal(events[0].type, "kronterm:workflow-insert-widget");
        assert.equal(events[0].detail.blockId, "browser-1");
        assert.equal(events[0].detail.workflowId, "flow");
        assert.equal(dispatchNativeWidgetConnection(event, { tabId: "tab", workflowId: "flow" }, { handleType: "target" }), false);
        assert.equal(dispatchNativeWidgetConnection({ target: { closest: () => null } }, { tabId: "tab", workflowId: "flow" }, { handleType: "source" }), false);
    } finally { globalThis.window = previous; }
});
