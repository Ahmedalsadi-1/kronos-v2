// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { KronSettingsBrowserSetup } from "./kronsettings-browser-setup";

vi.mock("@/app/store/global", () => ({ getApi: vi.fn() }));
vi.mock("@hermes/components/ui/button", () => ({
    Button: ({ children, variant: _variant, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock("@hermes/app/settings/primitives", () => ({
    SettingsSection: ({ children }) => <section>{children}</section>,
    ListRow: ({ title, action }) => (
        <div>
            {title}
            {action}
        </div>
    ),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("imports validated bookmarks and reports a failed import without losing the retry action", async () => {
    const api = {
        getPlatform: () => "darwin" as const,
        browserMigration: vi
            .fn()
            .mockRejectedValueOnce(new Error("Import unavailable"))
            .mockResolvedValue({ imported: 1 }),
    };
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
        await act(async () => root.render(<KronSettingsBrowserSetup api={api} />));
        const input = host.querySelector<HTMLInputElement>('input[type="file"]');
        const file = {
            name: "bookmarks.html",
            size: 100,
            text: async () => '<a href="https://example.com">Example</a><a href="javascript:alert(1)">Invalid</a>',
        };
        Object.defineProperty(input, "files", { configurable: true, value: [file] });
        await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
        expect(host.querySelector('[role="alert"]').textContent).toBe("Import unavailable");
        await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
        expect(api.browserMigration).toHaveBeenLastCalledWith({
            action: "bookmarks",
            bookmarks: [{ title: "Example", url: "https://example.com/" }],
        });
        expect(host.textContent).toContain("Imported 1 bookmark.");
        expect(host.querySelector('[role="alert"]')).toBeNull();
    } finally {
        await act(async () => root.unmount());
    }
});

it("lists extensions only for a ready Work or Personal browser guest", async () => {
    const api = {
        getPlatform: () => "linux" as const,
        browserMigration: vi.fn().mockResolvedValue({ extensions: [{ id: "one", name: "Research helper" }] }),
    };
    const host = document.createElement("div");
    const root = createRoot(host);
    const guests = [
        "persist:kronterm-work",
        "persist:kronterm-personal",
        "persist:hermes",
        "kronterm-private-example",
        "",
    ].map((partition, index) => {
        const guest = document.createElement("webview");
        guest.setAttribute("partition", partition);
        Object.assign(guest, { getWebContentsId: () => index + 1, getURL: () => "https://example.com/private/path" });
        document.body.append(guest);
        return guest;
    });
    try {
        await act(async () => root.render(<KronSettingsBrowserSetup api={api} />));
        const select = host.querySelector<HTMLSelectElement>('select[aria-label="Extension browser session"]');
        expect([...select.options].map((option) => option.value)).toEqual(["1", "2"]);
        expect([...select.options].map((option) => option.textContent)).toEqual([
            "Work · example.com",
            "Personal · example.com",
        ]);
        expect(api.browserMigration).toHaveBeenCalledWith({ action: "extensions", guestId: 1 });
        await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Remove Research helper"]').click());
        expect(api.browserMigration).toHaveBeenLastCalledWith({ action: "remove", guestId: 1, id: "one" });
        expect(host.textContent).toContain("Research helper removed.");
    } finally {
        await act(async () => root.unmount());
        guests.forEach((guest) => guest.remove());
    }
});
