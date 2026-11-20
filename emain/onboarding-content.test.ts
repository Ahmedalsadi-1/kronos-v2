import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
    handle: vi.fn(),
    permission: vi.fn(),
    request: vi.fn(),
    fetch: vi.fn(async () => new Response("fixture")),
}));
const partition = {
    protocol: { handle: mock.handle },
    setPermissionRequestHandler: mock.permission,
    webRequest: { onBeforeRequest: mock.request },
};
vi.mock("electron", () => ({
    app: { isPackaged: true },
    net: { fetch: mock.fetch },
    session: { fromPartition: () => partition },
}));
vi.mock("./emain-platform", () => ({ getElectronAppBasePath: () => "/fixture/dist" }));
let root: string;

afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    vi.clearAllMocks();
    vi.resetModules();
});

it("serves the shared welcome and assets with a restrictive CSP, and registers a session once", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "kronos-onboarding-"));
    await mkdir(path.join(root, "aside-demo/states"), { recursive: true });
    await writeFile(path.join(root, "aside-demo/index.html"), "welcome");
    await writeFile(path.join(root, "aside-demo/states/logo.svg"), "logo");
    const { prepareOnboardingSession, OnboardingEntry } = await import("./onboarding-content");
    await prepareOnboardingSession(root, "signin");
    await prepareOnboardingSession(root, "signin");
    expect(mock.handle).toHaveBeenCalledTimes(1);
    const serve = mock.handle.mock.calls[0][1];
    const welcome = await serve({ url: OnboardingEntry + "?signin=1" });
    expect(welcome.status).toBe(200);
    expect(welcome.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    const asset = await serve({ url: new URL("states/logo.svg", OnboardingEntry).href });
    expect(asset.status).toBe(200);
});

it("blocks other origins, unlisted files, and symlinks outside the onboarding directory", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "kronos-onboarding-"));
    await mkdir(path.join(root, "aside-demo/states"), { recursive: true });
    await symlink(os.tmpdir(), path.join(root, "aside-demo/states/escape.png"));
    const { prepareOnboardingSession, OnboardingEntry } = await import("./onboarding-content");
    await prepareOnboardingSession(root, "signin");
    const serve = mock.handle.mock.calls[0][1];
    for (const url of [
        "http://untrusted.invalid/aside-demo/",
        OnboardingEntry + "private.json",
        OnboardingEntry + "states/escape.png",
    ]) {
        expect((await serve({ url })).status).toBe(404);
    }
    expect(mock.fetch).not.toHaveBeenCalled();
    const intercept = mock.request.mock.calls[0][0];
    const callback = vi.fn();
    intercept({ url: "https://untrusted.invalid" }, callback);
    expect(callback).toHaveBeenCalledWith({ cancel: true });
});
