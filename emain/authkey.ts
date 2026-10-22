// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ipcMain } from "electron";
import { getWebServerEndpoint, getWSServerEndpoint } from "../frontend/util/endpoints";

const AuthKeyHeader = "X-AuthKey";
export const WaveAuthKeyEnv = "WAVETERM_AUTH_KEY";
export const AuthKey = crypto.randomUUID();
const RequestGrants = new Map<string, { header: string; value: string; senders: Set<number> }>();
let RequestSession: Electron.Session;

export function grantManagedRuntimeRequests(origin: string, header: string, value: string, senderId: number) {
    const grant = RequestGrants.get(origin) ?? { header, value, senders: new Set<number>() };
    grant.senders.add(senderId);
    RequestGrants.set(origin, grant);
    if (RequestSession) configureAuthKeyRequestInjection(RequestSession);
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
        if (grant?.senders.has(details.webContentsId)) details.requestHeaders[grant.header] = grant.value;
        callback({ requestHeaders: details.requestHeaders });
    });
}
