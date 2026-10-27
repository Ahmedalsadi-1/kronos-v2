// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { loaded, codeToHtml } = vi.hoisted(() => ({ loaded: vi.fn(), codeToHtml: vi.fn() }));
vi.mock("shiki/bundle/web", () => {
    loaded();
    return { bundledLanguages: { typescript: {} }, codeToHtml };
});
vi.mock("@/app/element/copybutton", () => ({ CopyButton: () => null }));
vi.mock("@/app/element/iconbutton", () => ({ IconButton: () => null }));
vi.mock("@/util/util", () => ({
    cn: (...values: string[]) => values.filter(Boolean).join(" "),
    useAtomValueSafe: vi.fn(),
}));
vi.mock("streamdown", () => ({ Streamdown: () => null }));

import { Code } from "./streamdown";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("deferred code highlighting", () => {
    let root: ReturnType<typeof createRoot>;
    let container: HTMLDivElement;

    afterEach(async () => {
        if (root) await act(async () => root.unmount());
        container?.remove();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    function mount() {
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
    }

    it("does not load syntax grammars when imported or rendering inline code", async () => {
        expect(loaded).not.toHaveBeenCalled();
        mount();
        await act(async () => root.render(<Code>inline text</Code>));
        expect(container.textContent).toBe("inline text");
        expect(loaded).not.toHaveBeenCalled();
    });

    it("retains readable code while highlighting loads and uses the existing theme", async () => {
        let finish: (html: string) => void;
        codeToHtml.mockImplementationOnce(
            () =>
                new Promise<string>((resolve) => {
                    finish = resolve;
                })
        );
        mount();
        await act(async () => root.render(<Code className="language-typescript">const x = 1;</Code>));
        expect(container.textContent).toBe("const x = 1;");
        expect(container.querySelector("code").className).not.toContain("text-transparent");
        expect(codeToHtml).toHaveBeenCalledWith("const x = 1;", {
            lang: "typescript",
            theme: "github-dark-high-contrast",
        });
        await act(async () => finish('<pre><code><span class="token">const x = 1;</span></code></pre>'));
        expect(container.querySelector(".token")?.textContent).toBe("const x = 1;");
    });

    it("keeps unsupported languages readable", async () => {
        mount();
        await act(async () => root.render(<Code className="language-unknown">unrecognized code</Code>));
        expect(container.textContent).toBe("unrecognized code");
        expect(codeToHtml).not.toHaveBeenCalled();
    });

    it("ignores an older highlight that completes after a newer code update", async () => {
        vi.useFakeTimers();
        const finish: ((html: string) => void)[] = [];
        codeToHtml.mockImplementation(() => new Promise<string>((resolve) => finish.push(resolve)));
        mount();
        await act(async () => root.render(<Code className="language-typescript">old</Code>));
        await act(async () => root.render(<Code className="language-typescript">new</Code>));
        await act(async () => vi.advanceTimersByTimeAsync(300));
        expect(finish).toHaveLength(2);
        await act(async () => finish[1]("<pre><code><span>new</span></code></pre>"));
        await act(async () => finish[0]("<pre><code><span>old</span></code></pre>"));
        expect(container.textContent).toBe("new");
    });

    it("cancels pending throttled work when the code block unmounts", async () => {
        vi.useFakeTimers();
        codeToHtml.mockResolvedValue("<pre><code>first</code></pre>");
        mount();
        await act(async () => root.render(<Code className="language-typescript">first</Code>));
        await act(async () => root.render(<Code className="language-typescript">pending</Code>));
        await act(async () => root.render(null));
        await act(async () => vi.advanceTimersByTimeAsync(1000));
        expect(codeToHtml).toHaveBeenCalledOnce();
    });

    it("continues highlighting after StrictMode replays effects", async () => {
        vi.useFakeTimers();
        codeToHtml.mockResolvedValue('<pre><code><span class="token">strict code</span></code></pre>');
        mount();
        await act(async () =>
            root.render(
                <StrictMode>
                    <Code className="language-typescript">strict code</Code>
                </StrictMode>
            )
        );
        await act(async () => vi.advanceTimersByTimeAsync(300));
        expect(container.querySelector(".token")?.textContent).toBe("strict code");
    });
});
