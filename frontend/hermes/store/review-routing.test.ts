import { atom } from "nanostores";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ embedded: true, reveal: vi.fn(), dispatch: vi.fn(), list: vi.fn() }));
vi.mock("@hermes/lib/kronterm-host", () => ({ isKronTermWidgetHost: () => state.embedded }));
vi.mock("@hermes/lib/persisted", () => ({ Codecs: {}, persistentAtom: (_key: string, value: unknown) => atom(value) }));
vi.mock("@hermes/lib/desktop-git", () => ({
    desktopGit: () => ({ review: { list: state.list, shipInfo: async () => ({ ghReady: false, pr: null }) } }),
}));
vi.mock("@hermes/components/pane-shell/tree/store", () => ({
    isPaneVisible: () => false,
    revealTreePane: state.reveal,
}));
vi.mock("@hermes/components/pane-shell", () => ({ PANE_TOGGLE_REVEAL_EVENT: "reveal" }));
vi.mock("@hermes/hooks/use-media-query", () => ({ matchesQuery: () => false }));
vi.mock("@hermes/lib/excluded-paths", () => ({ isExcludedPath: () => false }));
vi.mock("@hermes/lib/oneshot", () => ({ requestOneShot: vi.fn() }));
vi.mock("./coding-status", () => ({ refreshRepoStatus: vi.fn(), repoStatusForCwd: vi.fn() }));
vi.mock("./pull-requests", () => ({ stampSessionPrBranch: vi.fn() }));
vi.mock("./session", () => ({
    $busy: atom(false),
    $currentCwd: atom("/repo"),
    $selectedStoredSessionId: atom(null),
    $sessions: atom([]),
}));
vi.mock("./workspace-events", () => ({ $workspaceChangeTick: atom(0) }));

import { $reviewScopeCwd, closeReview, openReview, revealReview, toggleReview } from "./review";

beforeEach(() => {
    vi.stubGlobal("window", { dispatchEvent: state.dispatch, addEventListener: vi.fn() });
    vi.stubGlobal(
        "CustomEvent",
        class {
            detail: unknown;
            constructor(
                public type: string,
                options: { detail: unknown }
            ) {
                this.detail = options.detail;
            }
        }
    );
    closeReview();
    state.embedded = true;
    state.dispatch.mockClear();
    state.reveal.mockClear();
    state.list.mockResolvedValue({ files: [] });
});

describe("detached Review routing", () => {
    it.each([openReview, toggleReview, revealReview])("launches the native widget with the tile's worktree", (open) => {
        open(" /repo/worktree ");
        expect($reviewScopeCwd.get()).toBe("/repo/worktree");
        expect(state.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({ type: "kronterm:open-review", detail: { scopeCwd: "/repo/worktree" } })
        );
        expect(state.reveal).not.toHaveBeenCalled();
    });

    it("keeps the tree pane in standalone Hermes", () => {
        state.embedded = false;
        revealReview();
        expect(state.dispatch).not.toHaveBeenCalled();
        expect(state.reveal).toHaveBeenCalledWith("review");
    });
});
