import { globalStore } from "@/app/store/jotaiStore";
import {
    browserSelectionContext,
    browserSelectionPrompt,
    type SelectionContextDepth,
} from "@/app/view/hermes/selection-context";
import { getApi } from "@/store/global";
import { atom, type PrimitiveAtom } from "jotai";
import type { BrowserGrabPayload } from "../../../types/browser-grab";
import { formatBrowserSelectionDraft } from "./browser-annotations";
import { stageBrowserSelectionInChat } from "./browser-chat-selection";
import { getBrowserResearchStore } from "./browser-research-store";

export type BrowserGrabIntent = "grab" | "annotate" | "style";
export type BrowserSelectionSettings = {
    includeScreenshot: boolean;
    depth: SelectionContextDepth;
    destination: "current" | "new";
};
export function formatBrowserGrab(payload: BrowserGrabPayload): string {
    return JSON.stringify(payload, null, 2);
}

export class BrowserGrabController {
    readonly researchOpen = atom(false);
    readonly intent = atom(null) as PrimitiveAtom<BrowserGrabIntent>;
    readonly selection = atom(null) as PrimitiveAtom<BrowserGrabPayload>;
    readonly error = atom("");
    readonly message = atom("");
    readonly settings = atom<BrowserSelectionSettings>({
        includeScreenshot: false,
        depth: "compact",
        destination: "current",
    });
    private generation = 0;
    private guestId: number;
    constructor(
        readonly blockId: string,
        private guest: () => Electron.WebviewTag
    ) {}

    acceptGuestSelection(guestId: number, intent: BrowserGrabIntent, payload: BrowserGrabPayload, comment = ""): void {
        const guest = this.guest();
        if (!guest) return;
        try {
            if (guest.getWebContentsId() !== guestId) return;
        } catch {
            return;
        }
        this.generation++;
        this.guestId = guestId;
        window.dispatchEvent(new Event("kronterm:workspace-picker-deactivate"));
        globalStore.set(this.error, "");
        globalStore.set(this.intent, comment ? null : intent);
        globalStore.set(this.selection, payload);
        if (comment.trim()) this.stageAnnotation(payload, comment, "change");
    }

    async setIntent(intent: BrowserGrabIntent): Promise<void> {
        const generation = ++this.generation;
        const previousId = this.guestId;
        globalStore.set(this.intent, intent);
        globalStore.set(this.selection, null);
        globalStore.set(this.error, "");
        if (previousId)
            await getApi()
                .browserCancelGrab(previousId)
                .catch(() => {});
        if (generation !== this.generation) return;
        try {
            const guest = this.guest();
            if (guest?.executeJavaScript) {
                const ready = await guest
                    .executeJavaScript(
                        `window.__KRONTERM_BROWSER_ELEMENT_TOOL__?.setIntent(${JSON.stringify(intent)}) === true`
                    )
                    .catch(() => false);
                if (generation !== this.generation) return;
                if (ready) {
                    if (intent === "annotate") guest.focus();
                    return;
                }
            }
            if (!intent) return;
            this.guestId = guest?.getWebContentsId();
            if (!this.guestId) throw new Error("Wait for the browser page to load before selecting");
            await this.arm(generation);
        } catch (error) {
            this.fail(generation, error);
        }
    }

    private fail(generation: number, error: unknown): void {
        if (generation !== this.generation) return;
        globalStore.set(this.error, error instanceof Error ? error.message : "Browser selection failed");
        globalStore.set(this.intent, null);
    }

    private async arm(generation: number): Promise<void> {
        if (generation !== this.generation || !globalStore.get(this.intent)) return;
        const guestId = this.guestId;
        const opId = crypto.randomUUID();
        const result = await getApi().browserGrab({ guestId, opId });
        if (generation !== this.generation || result.opId !== opId || this.guest()?.getWebContentsId() !== guestId)
            return;
        if (result.kind === "error") throw new Error(result.reason);
        if (result.kind === "cancelled") {
            globalStore.set(this.intent, null);
            return;
        }
        const payload = result.payload;
        globalStore.set(this.selection, payload);
    }

    saveResearchFinding(note: string): void {
        const payload = globalStore.get(this.selection);
        if (!payload) throw new Error("Select page text before saving a finding");
        getBrowserResearchStore().capture(this.blockId, payload, note);
        globalStore.set(this.message, "Finding saved to research notebook");
        globalStore.set(this.researchOpen, true);
    }

    async copyContext(payload = globalStore.get(this.selection), generation = this.generation): Promise<void> {
        if (!payload) return;
        if (generation !== this.generation) return;
        await navigator.clipboard.writeText(
            JSON.stringify(browserSelectionContext(payload, globalStore.get(this.settings).depth), null, 2)
        );
        globalStore.set(this.message, "Element context copied");
    }

    async sendToHermes(comment: string): Promise<void> {
        const payload = globalStore.get(this.selection);
        if (!payload || !comment.trim()) return;
        const generation = this.generation;
        const guestId = this.guestId;
        const settings = globalStore.get(this.settings);
        const screenshot = settings.includeScreenshot
            ? await getApi().captureBrowserPage({ guestId, rect: payload.target.rectViewport })
            : null;
        if (!this.currentSelection(generation, guestId, payload)) return;
        if (settings.includeScreenshot && !screenshot?.dataUrl)
            throw new Error("Element screenshot is unavailable. Retry or turn off Include screenshot.");
        await getApi().sendHermesSelection({
            text: browserSelectionPrompt(payload, comment, settings.depth, this.blockId),
            target: settings.destination,
            ...(screenshot ? { images: [{ filename: "browser-selection.png", dataUrl: screenshot.dataUrl }] } : {}),
        });
        await this.setIntent(null);
        globalStore.set(this.message, "Selection queued for Hermes");
    }

    async copyScreenshot(): Promise<void> {
        const payload = globalStore.get(this.selection);
        if (!payload) return;
        const generation = this.generation;
        const guestId = this.guestId;
        const screenshot = await getApi().captureBrowserPage({
            guestId: this.guestId,
            rect: payload.target.rectViewport,
        });
        if (!this.currentSelection(generation, guestId, payload)) return;
        await getApi().copyBrowserImage(screenshot.dataUrl);
        globalStore.set(this.message, "Element screenshot copied");
    }

    private currentSelection(generation: number, guestId: number, payload: BrowserGrabPayload): boolean {
        return (
            generation === this.generation &&
            this.guest()?.getWebContentsId() === guestId &&
            globalStore.get(this.selection) === payload
        );
    }

    annotate(comment: string, intent: "fix" | "change" | "question" | "approve"): void {
        const payload = globalStore.get(this.selection);
        if (!payload || !comment.trim()) return;
        this.stageAnnotation(payload, comment, intent);
    }

    private stageAnnotation(
        payload: BrowserGrabPayload,
        comment: string,
        intent: "fix" | "change" | "question" | "approve"
    ): void {
        const generation = this.generation;
        const guestId = this.guestId;
        void (async () => {
            const screenshot = await getApi().captureBrowserPage({ guestId });
            if (!this.currentSelection(generation, guestId, payload)) return;
            if (!screenshot?.dataUrl) throw new Error("Could not capture the browser. Please retry the selection.");
            await stageBrowserSelectionInChat({
                target: "current",
                text: formatBrowserSelectionDraft(payload, comment, intent, this.blockId),
                images: [{ filename: "browser-selection.png", dataUrl: screenshot.dataUrl }],
            });
            if (!this.currentSelection(generation, guestId, payload)) return;
            globalStore.set(this.selection, null);
            globalStore.set(this.intent, null);
            globalStore.set(this.message, "Screenshot and browser context added to chat");
        })().catch((error) => this.fail(generation, error));
    }

    async rearm(): Promise<void> {
        globalStore.set(this.selection, null);
        const generation = this.generation;
        try {
            await this.arm(generation);
        } catch (error) {
            this.fail(generation, error);
        }
    }
}
