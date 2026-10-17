import { describe, expect, it } from "vitest";
import { terminalAgentBackend, validateNotchExplorer } from "./native-notch";

describe("native notch state", () => {
    it("recognizes launched CLI agents without matching file names or echoed commands", () => {
        expect(terminalAgentBackend("opencode --model x")).toBe("opencode");
        expect(terminalAgentBackend("/usr/local/bin/claude")).toBe("claude");
        expect(terminalAgentBackend("env PROJECT=x hermes chat")).toBe("hermes");
        expect(terminalAgentBackend("echo claude")).toBeUndefined();
        expect(terminalAgentBackend("cat opencode.ts")).toBeUndefined();
    });
    it("accepts only bounded explorer rows published by the matching file island", () => {
        const entry = { path: "/project/app.tsx", name: "app.tsx", directory: false, depth: 1, expanded: false };
        const state = {
            blockId: "files",
            root: "/project",
            selected: entry.path,
            error: "",
            entries: [entry, { ...entry, depth: -1 }, { ...entry, path: 5 }],
        };
        expect(validateNotchExplorer(state, "other")).toBeUndefined();
        expect(validateNotchExplorer(state, "files").entries).toEqual([entry]);
        expect(validateNotchExplorer({ ...state, entries: Array(400).fill(entry) }, "files").entries).toHaveLength(300);
        expect(validateNotchExplorer({ ...state, root: null }, "files")).toBeUndefined();
    });
});
