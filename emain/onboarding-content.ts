// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { app, net, session, type Session } from "electron";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getElectronAppBasePath } from "./emain-platform";

export const OnboardingEntry = "http://kronos-setup.invalid/aside-demo/";
const PreviewFiles = /^\/(aside-demo\/states\/[a-z0-9-]+\.(png|gif|svg|woff2)|aside-screens\/[a-z0-9-]+\.png)$/;
const PreviewCsp =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
    "img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const PreparedSessions = new WeakSet<Session>();

export function getOnboardingRoot() {
    return app.isPackaged
        ? path.join(process.resourcesPath, "onboarding")
        : path.resolve(getElectronAppBasePath(), "../assets/onboarding");
}

export async function prepareOnboardingSession(previewRoot: string, partition: string) {
    const files = await realpath(previewRoot);
    const previewSession = session.fromPartition(partition);
    if (PreparedSessions.has(previewSession)) return previewSession;
    previewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    previewSession.webRequest.onBeforeRequest((request, callback) => {
        callback({ cancel: new URL(request.url).origin !== new URL(OnboardingEntry).origin });
    });
    previewSession.protocol.handle("http", async (request) => {
        const url = new URL(request.url);
        const entry = url.pathname === new URL(OnboardingEntry).pathname;
        if (url.origin !== new URL(OnboardingEntry).origin || (!entry && !PreviewFiles.test(url.pathname))) {
            return new Response(null, { status: 404 });
        }
        try {
            const file = await realpath(path.join(files, entry ? "aside-demo/index.html" : url.pathname.slice(1)));
            if (!file.startsWith(files + path.sep)) return new Response(null, { status: 404 });
            const response = await net.fetch(pathToFileURL(file).href);
            const headers = new Headers(response.headers);
            headers.set("Content-Security-Policy", PreviewCsp);
            return new Response(response.body, { status: response.status, headers });
        } catch {
            return new Response(null, { status: 404 });
        }
    });
    PreparedSessions.add(previewSession);
    return previewSession;
}
