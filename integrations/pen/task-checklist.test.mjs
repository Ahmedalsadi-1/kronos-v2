import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const source = readFileSync(new URL("./shell-host.js", import.meta.url), "utf8");
test("task checklist expands independently and keeps live progress while open", () => {
    const dom = new JSDOM('<div><div data-kronos-pen-workers="chat"></div></div>', { pretendToBeVisual: true });
    const { window } = dom;
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    vm.runInNewContext(source, { window, document: window.document });
    const events = [];
    const shell = window.createKronosPenShell({ ipc: { handleNotification() {} } }, (event) => events.push(event), window.document);
    try {
        const row = { id: "main", goal: "Compare restaurants", status: "running", blockId: "browser" };
        const todos = [
            { content: "Find restaurants", status: "completed" },
            { content: "Compare menus", status: "in_progress" },
            { content: "Discard duplicate", status: "cancelled" },
        ];
        shell.setAgentWorkers("chat", [row]);
        const progress = window.document.querySelector("[data-agent-progress]");
        assert.equal(progress.hidden, true);
        shell.setAgentWorkers("chat", [{ ...row, todos }]);
        assert.equal(progress.hidden, false);
        assert.match(progress.textContent, /1 \/ 2/);
        progress.click();
        const list = window.document.getElementById(progress.getAttribute("aria-controls"));
        assert.equal(list.hidden, false);
        assert.equal(list.children.length, 3);
        assert.equal(progress.getAttribute("aria-expanded"), "true");
        assert.equal(events.some((event) => event.type === "agent-activity-open"), false);
        shell.setAgentWorkers("chat", [{ ...row, status: "completed", todos: todos.map((todo) => todo.status === "in_progress" ? { ...todo, status: "completed" } : todo) }]);
        assert.equal(list.hidden, false);
        assert.match(progress.textContent, /2 \/ 2/);
        progress.click();
        assert.equal(list.hidden, true);
    } finally {
        shell.dispose();
        window.close();
    }
});
