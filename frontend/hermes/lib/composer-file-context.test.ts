import { requestComposerInsertRefs } from "@hermes/app/chat/composer/focus";
import { expect, it, vi } from "vitest";
import { attachPathToComposer } from "./composer-file-context";

vi.mock("@hermes/app/chat/composer/focus", () => ({ requestComposerInsertRefs: vi.fn() }));

it("attaches files and folders with paths relative to the current workspace", () => {
    attachPathToComposer("/repo/src/app.ts", "/repo");
    expect(requestComposerInsertRefs).toHaveBeenLastCalledWith(["@file:src/app.ts"]);
    attachPathToComposer("/repo/src", "/repo", true);
    expect(requestComposerInsertRefs).toHaveBeenLastCalledWith(["@folder:src"]);
});

it("does not insert a reference for an empty path", () => {
    vi.mocked(requestComposerInsertRefs).mockClear();
    attachPathToComposer("", "/repo", true);
    expect(requestComposerInsertRefs).not.toHaveBeenCalled();
});
