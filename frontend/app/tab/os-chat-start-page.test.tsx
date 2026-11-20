// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { OSChatStartPage } from "./os-chat-start-page";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
    for (const dispose of cleanup.splice(0).reverse()) await dispose();
});
async function setup(query: string, chat = vi.fn(async () => {})) {
    const env = globalThis as any;
    const prior = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const browser = vi.fn(async (_value: string) => {});
    const onQuery = vi.fn();
    const searchIntent = vi.fn();
    await act(async () =>
        root.render(
            <OSChatStartPage
                active
                query={query}
                onQuery={onQuery}
                onBrowser={browser}
                onChat={chat}
                onTool={vi.fn()}
                onLaunch={vi.fn()}
                onChanges={vi.fn()}
                destinations={[]}
                pending={false}
                onSearchIntent={searchIntent}
            />
        )
    );
    cleanup.push(async () => {
        await act(async () => root.unmount());
        host.remove();
        env.IS_REACT_ACT_ENVIRONMENT = prior;
    });
    const enter = () =>
        act(async () => {
            host.querySelector("textarea").dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
            );
        });
    const choose = async (label: string) =>
        act(async () =>
            [...host.querySelectorAll<HTMLButtonElement>(".os-chat-start-actions button")]
                .find((button) => button.textContent.includes(label))
                .click()
        );
    return { host, browser, chat, onQuery, searchIntent, enter, choose };
}

it("keeps tools and actions hidden before typing while retaining launcher tiles", async () => {
    const { host } = await setup("");
    expect(host.querySelector(".os-chat-start-actions")).toBeNull();
    expect(host.querySelector(".os-chat-start-tools")).toBeNull();
    expect(host.querySelectorAll(".os-chat-start-launchers button")).toHaveLength(6);
});

it("sends a task once and retains its draft on submission failure", async () => {
    let reject: (error: Error) => void;
    const chat = vi.fn(
        () =>
            new Promise<void>((_resolve, no) => {
                reject = no;
            })
    );
    const { host, enter, onQuery, browser, searchIntent } = await setup("keep this draft", chat);
    await enter();
    await enter();
    expect(chat).toHaveBeenCalledExactlyOnceWith("keep this draft", false);
    expect(browser).not.toHaveBeenCalled();
    expect(searchIntent).not.toHaveBeenCalled();
    await act(async () => reject(new Error("Gateway unavailable")));
    expect(host.querySelector('[role="alert"]').textContent).toBe("Gateway unavailable");
    expect(onQuery).not.toHaveBeenCalled();
    expect(host.querySelector("textarea").value).toBe("keep this draft");
});

it("navigates local URLs and only requests remote suggestions after selecting Search", async () => {
    const { enter, browser } = await setup("http://localhost:3000");
    await enter();
    expect(browser).toHaveBeenCalledExactlyOnceWith("http://localhost:3000");
    const search = await setup("coffee brewing");
    await search.choose("Search on Google");
    expect(search.searchIntent).toHaveBeenLastCalledWith(true);
    expect(search.browser).toHaveBeenLastCalledWith("https://www.google.com/search?q=coffee%20brewing");
});

it("routes Ask in Canvas through the real chat handoff with the Canvas flag", async () => {
    const { choose, enter, chat, onQuery } = await setup("Design a dashboard");
    await choose("Ask in Canvas");
    expect(chat).toHaveBeenCalledExactlyOnceWith("Design a dashboard", true);
    expect(onQuery).toHaveBeenCalledExactlyOnceWith("");
});

it("opens the keyboard-selected action with Enter and keeps Shift+Enter for multiline input", async () => {
    const { host, enter, chat } = await setup("Make a diagram");
    const input = host.querySelector("textarea");
    await act(async () => {
        input.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true })
        );
    });
    expect(chat).not.toHaveBeenCalled();
    await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    expect(host.querySelector('.os-chat-start-actions button[aria-pressed="true"]').textContent).toContain(
        "Ask in Canvas"
    );
    await enter();
    expect(chat).toHaveBeenCalledExactlyOnceWith("Make a diagram", true);
});
