import { JSDOM } from "jsdom";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { GuestLogin } from "../guest-login";
import { runPrivateGuestCommand } from "../private-guest-command";
import { GuestBrowser, GuestFiles, guestPython } from "./guest-commands";
const exec = promisify(execFile);
const input = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

it("passes arbitrary file text as data and reads the exact guest file in pages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "guest-files-"));
    try {
        const path = join(dir, "quoted ' file.txt");
        const text = "$(touch /should-never-run) `echo no` ' \"\nhello";
        await exec("python3", ["-c", GuestFiles, input({ action: "write", path, text })]);
        const result = await exec("python3", ["-c", GuestFiles, input({ action: "read", path })]);
        expect(JSON.parse(result.stdout).text).toBe(text);
        expect(guestPython(GuestFiles, { action: "write", path, text })).not.toContain(text);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

it("uses the guest-only CDP transport for browser state and navigation", async () => {
    let port = 0;
    const methods: string[] = [];
    let expression: string;
    const paths: string[] = [];
    const server = createServer((_req, res) =>
        res.end(
            JSON.stringify([
                {
                    type: "page",
                    url: "devtools://devtools/bundled/inspector.html",
                    webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/inspector`,
                },
                {
                    type: "page",
                    url: "http://localhost:5173",
                    webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/fixture`,
                },
            ])
        )
    );
    const sockets = new WebSocketServer({ server });
    sockets.on("connection", (ws, request) => {
        paths.push(request.url ?? "");
        ws.on("message", (raw) => {
            const message = JSON.parse(raw.toString());
            methods.push(message.method);
            if (message.method === "Runtime.evaluate") expression = message.params.expression;
            ws.send(JSON.stringify({ id: message.id, result: { fixture: true } }));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as any).port;
    const source = GuestBrowser.replaceAll("9222", String(port));
    try {
        const state = await exec("python3", ["-c", source, input({ action: "state" })]);
        expect(JSON.parse(state.stdout).result.fixture).toBe(true);
        const { window } = new JSDOM('<form action="/login"><input type="email"><input type="password"></form>', {
            url: "https://example.com/login",
            runScripts: "outside-only",
        });
        try {
            window.document.body.innerText = "";
            const password = window.document.querySelector<HTMLInputElement>('input[type="password"]');
            vi.spyOn(password, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
            expect(JSON.parse(window.eval(expression)).signInOrigin).toBe("https://example.com");
            password.form.action = "https://other.example/login";
            expect(JSON.parse(window.eval(expression)).signInOrigin).toBeNull();
            password.form.action = "/register";
            password.autocomplete = "new-password";
            expect(JSON.parse(window.eval(expression)).signInOrigin).toBeNull();
        } finally {
            window.close();
        }
        await exec("python3", ["-c", source, input({ action: "navigate", url: "https://example.com" })]);
        expect(methods).toEqual(["Runtime.evaluate", "Page.navigate"]);
        expect(paths).toEqual(["/devtools/page/fixture", "/devtools/page/fixture"]);
    } finally {
        for (const ws of sockets.clients) ws.terminate();
        sockets.close();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});

it("detects login providers and activates the current same-origin control through the private bridge", async () => {
    let port: number;
    let currentUrl = "https://example.com/login";
    const origin = "https://example.com";
    const server = createServer((_request, res) => {
        res.end(
            JSON.stringify([
                {
                    type: "page",
                    url: "https://other.example/login",
                    webSocketDebuggerUrl: `ws://127.0.0.1:${port}/other`,
                },
                { type: "page", url: currentUrl, webSocketDebuggerUrl: `ws://127.0.0.1:${port}/target` },
            ])
        );
    });
    const { window } = new JSDOM(
        "<button>Continue with Apple</button><button hidden>Continue with GitHub</button><button disabled>Continue with Google</button>",
        { url: currentUrl, runScripts: "outside-only" }
    );
    vi.spyOn(window.Element.prototype, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
    const clicked = vi.fn();
    window.document.querySelector("button").addEventListener("click", clicked);
    const paths: string[] = [];
    const methods: string[] = [];
    const sockets = new WebSocketServer({ server });
    sockets.on("connection", (ws, request) => {
        paths.push(request.url);
        ws.on("message", (raw) => {
            const { id, method, params } = JSON.parse(raw.toString());
            methods.push(method);
            try {
                const value = method === "Runtime.evaluate" ? window.eval(params.expression) : undefined;
                ws.send(JSON.stringify({ id, result: { result: { value } } }));
            } catch {
                ws.send(JSON.stringify({ id, result: { exceptionDetails: {} } }));
            }
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
    const run = (action: string, provider?: string) =>
        runPrivateGuestCommand(
            "python3",
            ["-c", GuestLogin.replaceAll("9222", String(port))],
            JSON.stringify({ origin, action, provider })
        );
    try {
        expect(JSON.parse(await run("inspect"))).toEqual({
            phase: "ready",
            status: "required",
            passwordVisible: false,
            registration: false,
            signUpAvailable: false,
            providers: ["apple"],
        });
        expect(methods).toEqual(["Runtime.evaluate"]);
        expect(clicked).not.toHaveBeenCalled();
        await expect(run("provider", "github")).rejects.toThrow("Secure browser operation failed");
        expect(clicked).not.toHaveBeenCalled();
        expect(JSON.parse(await run("provider", "apple")).phase).toBe("needs-user");
        expect(clicked).toHaveBeenCalledOnce();
        expect(paths).toEqual(["/target", "/target", "/target"]);

        currentUrl = "https://example.com/workspace";
        window.history.replaceState(null, "", currentUrl);
        window.document.body.innerHTML = "<button>Sign out</button>";
        expect(JSON.parse(await run("inspect"))).toMatchObject({ status: "authenticated", providers: [] });
        window.document.body.innerHTML = "<p>Public content</p>";
        expect(JSON.parse(await run("inspect"))).toMatchObject({ status: "unknown", providers: [] });
    } finally {
        window.close();
        for (const ws of sockets.clients) ws.terminate();
        sockets.close();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});
