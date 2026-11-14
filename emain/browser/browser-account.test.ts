// @vitest-environment jsdom
import type { WebContents } from "electron";
import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";
import { browserAccount } from "./browser-account";

const preferences = vi.hoisted(() => ({ list: vi.fn(() => []), remember: vi.fn() }));
vi.mock("../login-preferences-store", () => ({ getLoginPreferences: () => preferences }));

function guestFixture(markup: string, url: string, storagePath = "/fake/browser-profile") {
    const { window } = new JSDOM(markup, { url, runScripts: "outside-only" });
    vi.spyOn(window.Element.prototype, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
    const execute = vi.fn(async (script: string) => window.eval(script));
    const guest = {
        getURL: () => window.location.href,
        session: { storagePath },
        executeJavaScript: execute,
    } as unknown as WebContents;
    return { window, guest, execute };
}

it("offers only visible website controls and opens sign-up without submitting a registration form", async () => {
    const page = "https://example.com/login";
    const { window, guest, execute } = guestFixture(
        '<button>Continue with GitHub</button><button hidden>Continue with Apple</button><a href="/signup">Create an account</a>',
        page
    );
    try {
        const signUp = vi.fn((event) => event.preventDefault());
        window.document.querySelector("a").addEventListener("click", signUp);
        expect(await browserAccount(guest, { guestId: 1, action: "inspect" })).toMatchObject({
            status: "required",
            providers: ["github"],
            signUpAvailable: true,
            registration: false,
        });
        expect(signUp).not.toHaveBeenCalled();
        await expect(
            browserAccount(guest, { guestId: 1, action: "signup", page: "https://example.com/old" })
        ).rejects.toThrow("page changed");
        await browserAccount(guest, { guestId: 1, action: "signup", page });
        expect(signUp).toHaveBeenCalledOnce();
        expect(execute).toHaveBeenLastCalledWith(expect.any(String), true);

        window.history.replaceState(null, "", "/signup");
        window.document.body.innerHTML = '<form><input type="password"><button>Create an account</button></form>';
        const submit = vi.fn((event) => event.preventDefault());
        window.document.querySelector("form").addEventListener("submit", submit);
        expect(await browserAccount(guest, { guestId: 1, action: "inspect" })).toMatchObject({
            status: "required",
            registration: true,
            signUpAvailable: false,
        });
        await expect(
            browserAccount(guest, { guestId: 1, action: "signup", page: "https://example.com/signup" })
        ).rejects.toThrow("no longer available");
        expect(submit).not.toHaveBeenCalled();
    } finally {
        window.close();
    }
});

it("reuses an authenticated browser and remembers only an explicit label in its persistent profile", async () => {
    preferences.remember.mockClear();
    const { window, guest } = guestFixture(
        '<button>Sign out</button><a href="/signup">Sign up</a>',
        "https://example.com/home"
    );
    try {
        expect(await browserAccount(guest, { guestId: 1, action: "inspect" })).toMatchObject({
            status: "authenticated",
            canRemember: true,
        });
        expect(preferences.remember).not.toHaveBeenCalled();
        await expect(
            browserAccount(guest, {
                guestId: 1,
                action: "remember",
                origin: "https://wrong.example",
                account: "Work",
            })
        ).rejects.toThrow("original site");
        await browserAccount(guest, { guestId: 1, action: "remember", origin: "https://example.com", account: "Work" });
        expect(preferences.remember).toHaveBeenCalledExactlyOnceWith(
            {
                origin: "https://example.com",
                computerId: expect.stringMatching(/^browser:[a-f0-9]{64}$/),
                account: "Work",
                policy: "ask",
            },
            true
        );
    } finally {
        window.close();
    }
});
