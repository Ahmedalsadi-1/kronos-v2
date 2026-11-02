// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ipcMain } from "electron";
import { getWebServerEndpoint, getWSServerEndpoint } from "../frontend/util/endpoints";

const AuthKeyHeader = "X-AuthKey";
export const WaveAuthKeyEnv = "WAVETERM_AUTH_KEY";
export const AuthKey = crypto.randomUUID();
const RequestGrants = new Map<
    string,
    { header: string; value: string; senders: Set<number>; socketHeaders?: Record<string, string> }
>();
let RequestSession: Electron.Session;

export function grantManagedRuntimeRequests(
    origin: string,
    header: string,
    value: string,
    senderId: number,
    socketHeaders?: Record<string, string>
) {
    const grant = RequestGrants.get(origin) ?? { header, value, senders: new Set<number>(), socketHeaders: undefined };
    grant.senders.add(senderId);
    if (socketHeaders) grant.socketHeaders = socketHeaders;
    RequestGrants.set(origin, grant);
    if (RequestSession) configureAuthKeyRequestInjection(RequestSession);
}

export function refreshManagedRuntimeSocketHeaders(origin: string, headers: Record<string, string>) {
    const grant = RequestGrants.get(origin);
    if (grant) grant.socketHeaders = headers;
}

export function revokeManagedRuntimeSender(senderId: number) {
    for (const [origin, grant] of RequestGrants) {
        grant.senders.delete(senderId);
        if (!grant.senders.size) RequestGrants.delete(origin);
    }
}

export function revokeManagedRuntimeRequests(origin: string) {
    RequestGrants.delete(origin);
}

export function isManagedRuntimeFrame(url: string, senderId: number): boolean {
    try {
        const target = new URL(url);
        return (
            RequestGrants.get(target.origin)?.senders.has(senderId) === true &&
            ["/kronterm-setup", "/kronterm-app"].includes(target.pathname)
        );
    } catch {
        return false;
    }
}

ipcMain.on("get-auth-key", (event) => {
    event.returnValue = AuthKey;
});

export function configureAuthKeyRequestInjection(session: Electron.Session) {
    RequestSession = session;
    const filter: Electron.WebRequestFilter = {
        urls: ["<all_urls>"],
    };
    session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        const origin = new URL(details.url).origin;
        for (const key of Object.keys(details.requestHeaders)) {
            if (key.toLowerCase() === "x-openmausbot-desktop-owner") delete details.requestHeaders[key];
        }
        if (
            details.url.startsWith(`${getWebServerEndpoint()}/`) ||
            details.url.startsWith(`${getWSServerEndpoint()}/`)
        ) {
            details.requestHeaders[AuthKeyHeader] = AuthKey;
        }
        const grant = RequestGrants.get(origin);
        if (grant?.senders.has(details.webContentsId)) {
            details.requestHeaders[grant.header] = grant.value;
            if (details.resourceType === "webSocket" && new URL(details.url).pathname === "/rest/push") {
                for (const name of Object.keys(grant.socketHeaders ?? {})) {
                    for (const key of Object.keys(details.requestHeaders)) {
                        if (key.toLowerCase() === name.toLowerCase()) delete details.requestHeaders[key];
                    }
                    details.requestHeaders[name] = grant.socketHeaders[name];
                }
            }
        }
        callback({ requestHeaders: details.requestHeaders });
    });
}
