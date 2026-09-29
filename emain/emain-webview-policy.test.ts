// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { applyWebviewAttachPolicy } from "./emain-webview-policy";

type Prefs = Parameters<typeof applyWebviewAttachPolicy>[0];

const AllowedPreload = "/Applications/KronTerm.app/Contents/Resources/app.asar/preload/preload-webview.cjs";

describe("applyWebviewAttachPolicy", () => {
    it("keeps the sanctioned webview preload given as a path or file URL", () => {
        const asPath: Prefs = { preload: AllowedPreload };
        const asUrl: Prefs = { preloadURL: "file://" + AllowedPreload };
        expect(applyWebviewAttachPolicy(asPath, {}, [AllowedPreload])).toEqual({ allow: true });
        expect(applyWebviewAttachPolicy(asUrl, {}, [AllowedPreload]).strippedPreload).toBeUndefined();
        expect(asPath.preload).toBe(AllowedPreload);
        expect(asUrl.preloadURL).toBe("file://" + AllowedPreload);
    });

    it("strips an unknown preload, including traversal toward the allowed one", () => {
        const prefs: Prefs = { preload: "/tmp/evil.js" };
        const traversal: Prefs = {
            preload: AllowedPreload.replace("preload-webview.cjs", "../preload/../../evil.cjs"),
        };
        expect(applyWebviewAttachPolicy(prefs, {}, [AllowedPreload])).toEqual({
            allow: true,
            strippedPreload: "/tmp/evil.js",
        });
        expect(prefs.preload).toBeUndefined();
        applyWebviewAttachPolicy(traversal, {}, [AllowedPreload]);
        expect(traversal.preload).toBeUndefined();
    });

    it("forces node integration off and isolation on regardless of requested values", () => {
        const prefs: Prefs = {
            nodeIntegration: true,
            nodeIntegrationInSubFrames: true,
            nodeIntegrationInWorker: true,
            contextIsolation: false,
            webSecurity: false,
            allowRunningInsecureContent: true,
            webviewTag: true,
        };
        applyWebviewAttachPolicy(prefs, {}, [AllowedPreload]);
        expect(prefs).toEqual({
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            nodeIntegrationInWorker: false,
            contextIsolation: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: false,
        });
    });

    it("rejects partitions reserved for the plugin host", () => {
        expect(applyWebviewAttachPolicy({}, { partition: "persist:plugin:acme.tools" }, []).allow).toBe(false);
        expect(applyWebviewAttachPolicy({}, { partition: "plugin:acme.tools" }, []).allow).toBe(false);
    });

    it("allows existing browser and Hermes preview partitions", () => {
        for (const partition of ["", "persist:hermes-preview", "persist:work", "custom-session"]) {
            expect(applyWebviewAttachPolicy({}, { partition }, []).allow).toBe(true);
        }
    });
});
