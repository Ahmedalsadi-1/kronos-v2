// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { app, dialog, session, shell, type Session } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
    MaxImportedBookmarks,
    normalizeMigrationBookmark,
    type MigrationBookmark,
    type MigrationBrowser,
} from "../../frontend/types/browser-migration";
import { getWaveConfigDir } from "../emain-platform";

const ExtensionProfiles = ["work", "personal"] as const;
type ExtensionProfile = (typeof ExtensionProfiles)[number];

let bookmarkWrites = Promise.resolve();
const extensionOperations = new Set<ExtensionProfile>();

function extensionDirectory(profile: ExtensionProfile) {
    return path.join(app.getPath("userData"), "browser-extensions", profile);
}

function extensionSession(profile: ExtensionProfile) {
    return session.fromPartition("persist:kronterm-" + profile);
}

export function getExtensionProfile(browserSession: Session) {
    return ExtensionProfiles.find((profile) => extensionSession(profile) === browserSession);
}

export function browserBookmarksDirectory() {
    return path.join(getWaveConfigDir(), "bookmarks");
}

export function importBrowserBookmarks(rows: unknown) {
    if (!Array.isArray(rows) || rows.length > MaxImportedBookmarks) throw new Error("Invalid bookmark import.");
    const bookmarks = rows.flatMap((row) => {
        const bookmark = normalizeMigrationBookmark(row?.url, row?.title);
        return bookmark ? [bookmark] : [];
    });
    const operation = bookmarkWrites.then(() => saveBrowserBookmarks(bookmarks));
    bookmarkWrites = operation.then(
        () => {},
        () => {}
    );
    return operation;
}

async function saveBrowserBookmarks(bookmarks: MigrationBookmark[]) {
    const directory = browserBookmarksDirectory();
    const destination = path.join(directory, "kronos-imported.json");
    const temporary = destination + "." + randomUUID() + ".tmp";
    await mkdir(directory, { recursive: true });
    const existing = await readFile(destination, "utf8").catch((error) => {
        if (error.code === "ENOENT") return "{}";
        throw error;
    });
    const entries = JSON.parse(existing);
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error("Invalid stored bookmarks.");
    let imported = 0;
    for (const bookmark of bookmarks) {
        const id = "import-" + createHash("sha256").update(bookmark.url).digest("hex");
        if (Object.hasOwn(entries, id)) continue;
        entries[id] = bookmark;
        imported++;
    }
    if (!imported) return 0;
    try {
        await writeFile(temporary, JSON.stringify(entries, null, 4) + "\n", { mode: 0o600, flag: "wx" });
        await rename(temporary, destination);
    } finally {
        await rm(temporary, { force: true });
    }
    return imported;
}

export async function restoreBrowserExtensions() {
    await Promise.all(
        ExtensionProfiles.map(async (profile) => {
            const root = extensionDirectory(profile);
            const folders = await readdir(root, { withFileTypes: true }).catch(() => []);
            for (const folder of folders) {
                if (!folder.isDirectory() || !/^[a-f0-9]{64}$/.test(folder.name)) continue;
                try {
                    await extensionSession(profile).extensions.loadExtension(path.join(root, folder.name));
                } catch {
                    console.warn("A saved browser extension could not be restored for the " + profile + " profile.");
                }
            }
        })
    );
}

function defaultExtensionPath(browser: MigrationBrowser) {
    if (browser === "chrome" && process.platform === "win32" && process.env.LOCALAPPDATA) {
        return path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data", "Default", "Extensions");
    }
    if (browser === "chrome" && process.platform === "linux") {
        const config = process.env.XDG_CONFIG_HOME || path.join(app.getPath("home"), ".config");
        return path.join(config, "google-chrome", "Default", "Extensions");
    }
    if (process.platform !== "darwin") return undefined;
    const applicationSupport = path.join(app.getPath("home"), "Library", "Application Support");
    if (browser === "arc") return path.join(applicationSupport, "Arc", "User Data", "Default", "Extensions");
    if (browser === "chrome") return path.join(applicationSupport, "Google", "Chrome", "Default", "Extensions");
    return undefined;
}

export async function importBrowserExtension(
    profile: ExtensionProfile,
    browser: MigrationBrowser,
    isCurrent: () => boolean
) {
    if (extensionOperations.has(profile)) throw new Error("An extension import is already open for this profile.");
    extensionOperations.add(profile);
    try {
        const selection = await dialog.showOpenDialog({
            title: "Select the extension version folder containing manifest.json",
            buttonLabel: "Import Extension",
            properties: ["openDirectory"],
            defaultPath: defaultExtensionPath(browser),
        });
        if (selection.canceled || !isCurrent()) return null;
        const source = selection.filePaths[0];
        const manifestFile = path.join(source, "manifest.json");
        const manifestInfo = await lstat(manifestFile).catch(() => null);
        if (!manifestInfo?.isFile() || manifestInfo.size > 1024 * 1024) {
            throw new Error("Select an unpacked Chromium extension folder containing manifest.json.");
        }
        const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
        if (typeof manifest?.name !== "string" || typeof manifest?.version !== "string") {
            throw new Error("Invalid Chromium extension manifest.");
        }
        const confirmation = await dialog.showMessageBox({
            type: "warning",
            title: "Import browser extension",
            message: "Allow this extension in your " + profile + " browser profile?",
            detail:
                manifest.name.slice(0, 200) +
                " • " +
                manifest.version.slice(0, 40) +
                "\nExtensions can access web pages and data according to their permissions.",
            buttons: ["Cancel", "Import"],
            defaultId: 0,
            cancelId: 0,
        });
        if (confirmation.response !== 1 || !isCurrent()) return null;

        const id = createHash("sha256").update(source).digest("hex");
        const root = extensionDirectory(profile);
        const destination = path.join(root, id);
        const extensions = extensionSession(profile).extensions;
        const loaded = extensions.getAllExtensions().find((extension) => extension.path === destination);
        if (loaded) return loaded.name;
        await mkdir(root, { recursive: true, mode: 0o700 });
        const staging = path.join(root, "." + randomUUID());
        let saved = false;
        try {
            await cp(source, staging, {
                recursive: true,
                filter: async (entry) => {
                    if (entry === path.join(source, "_metadata")) return false;
                    const info = await lstat(entry);
                    if (!info.isFile() && !info.isDirectory()) {
                        throw new Error("Extension folders may only contain regular files and folders.");
                    }
                    return true;
                },
            });
            if (!isCurrent()) return null;
            await rename(staging, destination);
            saved = true;
            const extension = await extensions.loadExtension(destination);
            return extension.name;
        } catch (error) {
            if (saved) await rm(destination, { recursive: true, force: true });
            throw error;
        } finally {
            await rm(staging, { recursive: true, force: true });
        }
    } finally {
        extensionOperations.delete(profile);
    }
}

export function listMigratedExtensions(profile: ExtensionProfile) {
    return extensionSession(profile)
        .extensions.getAllExtensions()
        .filter((extension) => path.dirname(extension.path) === extensionDirectory(profile))
        .map(({ id, name }) => ({ id, name }));
}

export async function removeMigratedExtension(profile: ExtensionProfile, id: string) {
    if (extensionOperations.has(profile)) throw new Error("An extension change is already in progress.");
    extensionOperations.add(profile);
    try {
        const extensions = extensionSession(profile).extensions;
        const extension = extensions.getExtension(id);
        const root = extensionDirectory(profile);
        if (!extension || path.dirname(extension.path) !== root) return;
        const removed = path.join(root, "." + randomUUID());
        await rename(extension.path, removed);
        extensions.removeExtension(id);
        await rm(removed, { recursive: true, force: true }).catch((error) => {
            console.warn("Could not clean up a removed browser extension", error.code);
        });
    } finally {
        extensionOperations.delete(profile);
    }
}

export async function openExternalPasswordManager(isCurrent: () => boolean) {
    if (process.platform !== "darwin") throw new Error("Use your password manager in your system browser.");
    const selection = await dialog.showOpenDialog({
        title: "Choose your password manager",
        defaultPath: "/Applications",
        buttonLabel: "Open Password Manager",
        properties: ["openFile"],
        filters: [{ name: "macOS application", extensions: ["app"] }],
    });
    if (selection.canceled || !isCurrent()) return false;
    const selected = selection.filePaths[0];
    if (!selected || path.extname(selected) !== ".app") throw new Error("Select an installed macOS application.");
    const error = await shell.openPath(selected);
    if (error) throw new Error("Could not open the selected password manager.");
    return true;
}
