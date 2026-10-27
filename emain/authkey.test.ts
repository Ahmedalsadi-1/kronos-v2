// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import {
    AuthKey,
    configureAuthKeyRequestInjection,
    grantManagedRuntimeRequests,
    isManagedRuntimeFrame,
    revokeManagedRuntimeRequests,
} from "./authkey";
const hooks = vi.hoisted(() => ({ handler: null as any }));
vi.mock("electron", () => ({ ipcMain: { on: vi.fn() } }));
vi.mock("../frontend/util/endpoints", () => ({
    getWebServerEndpoint: () => "http://127.0.0.1:9010",
    getWSServerEndpoint: () => "ws://127.0.0.1:9010",
}));

it("limits the upstream owner capability to registered renderers and strips it from redirects", () => {
    const session = {
        webRequest: {
            onBeforeSendHeaders: (_filter: any, handler: any) => {
                hooks.handler = handler;
            },
        },
    } as unknown as Electron.Session;
    configureAuthKeyRequestInjection(session);
    grantManagedRuntimeRequests("http://127.0.0.1:9012", "X-OpenMausBot-Desktop-Owner", "test-capability", 42);
    expect(isManagedRuntimeFrame("http://127.0.0.1:9012/kronterm-setup", 42)).toBe(true);
    expect(isManagedRuntimeFrame("http://127.0.0.1:9012/kronterm-app?group=one", 42)).toBe(true);
    expect(isManagedRuntimeFrame("http://127.0.0.1:9012/kronterm-setup", 99)).toBe(false);
    expect(isManagedRuntimeFrame("http://127.0.0.1:9012/other", 42)).toBe(false);
    expect(isManagedRuntimeFrame("https://example.com/kronterm-setup", 42)).toBe(false);
    const request = (url: string, id: number, headers: Record<string, string> = {}) => {
        let result: any;
        hooks.handler({ url, webContentsId: id, requestHeaders: headers }, (next: any) => {
            result = next.requestHeaders;
        });
        return result;
    };
    expect(request("http://127.0.0.1:9012/api/groups", 42)["X-OpenMausBot-Desktop-Owner"]).toBe("test-capability");
    expect(request("http://127.0.0.1:9012/api/groups", 99)["X-OpenMausBot-Desktop-Owner"]).toBeUndefined();
    expect(
        request("https://example.com/redirect", 42, { "X-OpenMausBot-Desktop-Owner": "test-capability" })[
            "X-OpenMausBot-Desktop-Owner"
        ]
    ).toBeUndefined();
    expect(request("http://127.0.0.1:9010/api/health", 42)["X-AuthKey"]).toBe(AuthKey);
    revokeManagedRuntimeRequests("http://127.0.0.1:9012");
    expect(request("http://127.0.0.1:9012/api/groups", 42)["X-OpenMausBot-Desktop-Owner"]).toBeUndefined();
});
