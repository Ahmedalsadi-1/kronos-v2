import { clipboard, dialog, ipcMain, nativeImage, net, session, webContents, type WebContents } from "electron";
import type { BrowserAccountCommand } from "../../frontend/types/browser-account";
import type { BrowserGrabRect, BrowserGrabScreenshot } from "../../frontend/types/browser-grab";
import { GRAB_BUDGET } from "../../frontend/types/browser-grab";
import { MigrationBrowsers, type BrowserMigrationCommand } from "../../frontend/types/browser-migration";
import { browserNavigationSnapshot } from "../../frontend/types/browser-navigation";
import type { BrowserSessionsCommand } from "../../frontend/types/browser-sessions";
import type { BrowserSiteSettingsCommand } from "../../frontend/types/browser-site-settings";
import { browserAccessibilitySnapshot } from "./browser-accessibility";
import { browserAccount } from "./browser-account";
import { BrowserGrabSessionController } from "./browser-grab-session-controller";
import {
    getExtensionProfile,
    importBrowserBookmarks,
    importBrowserExtension,
    listMigratedExtensions,
    openExternalPasswordManager,
    removeMigratedExtension,
} from "./browser-migration";
import { manageBrowserSessions } from "./browser-sessions";
import { readBrowserSiteSettings } from "./browser-site-settings";
import { buildGuestOverlayScript } from "./grab-guest-script";

export function ownedBrowserGuest(sender: WebContents, guestId: unknown): WebContents {
    if (!Number.isInteger(guestId) || sender.isDestroyed()) throw new Error("Browser guest unavailable");
    const guest = webContents.fromId(guestId as number);
    if (!guest || guest.isDestroyed() || guest.getType() !== "webview" || guest.hostWebContents?.id !== sender.id) {
        throw new Error("Browser guest does not belong to this window");
    }
    return guest;
}

export async function captureBrowserScreenshot(
    guest: WebContents,
    rect?: BrowserGrabRect
): Promise<BrowserGrabScreenshot> {
    const viewport = await guest.executeJavaScript("({width:innerWidth,height:innerHeight})");
    if (
        !Number.isFinite(viewport?.width) ||
        !Number.isFinite(viewport?.height) ||
        viewport.width <= 0 ||
        viewport.height <= 0
    ) {
        throw new Error("Browser viewport unavailable");
    }
    const selected = rect ?? { x: 0, y: 0, width: viewport.width, height: viewport.height };
    if (
        ![selected.x, selected.y, selected.width, selected.height].every(Number.isFinite) ||
        selected.width <= 0 ||
        selected.height <= 0
    ) {
        throw new Error("Invalid screenshot bounds");
    }
    // Remove picker chrome and mask sensitive controls before copying any pixels.
    await guest.executeJavaScript(`(() => {
        const host = window.__krontermGrab?.host;
        if (host) host.style.visibility = 'hidden';
        document.querySelectorAll('input[type=password],input[autocomplete*=password],[data-private],[data-sensitive]').forEach(el => {
            const r = el.getBoundingClientRect(); const mask = document.createElement('div');
            mask.dataset.krontermCaptureMask = ''; mask.style.cssText = 'position:fixed;z-index:2147483647;background:#171717;pointer-events:none;';
            Object.assign(mask.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
            document.documentElement.appendChild(mask);
        });
    })()`);
    try {
        const image = await guest.capturePage(undefined, { stayHidden: true, stayAwake: true });
        if (image.isEmpty()) throw new Error("Browser screenshot unavailable");
        const size = image.getSize();
        const sx = size.width / viewport.width,
            sy = size.height / viewport.height;
        const left = Math.max(0, Math.min(size.width, Math.floor(selected.x * sx)));
        const top = Math.max(0, Math.min(size.height, Math.floor(selected.y * sy)));
        const right = Math.max(left, Math.min(size.width, Math.ceil((selected.x + selected.width) * sx)));
        const bottom = Math.max(top, Math.min(size.height, Math.ceil((selected.y + selected.height) * sy)));
        if (right <= left || bottom <= top) throw new Error("Element outside browser viewport");
        const cropped = image.crop({ x: left, y: top, width: right - left, height: bottom - top });
        const png = cropped.toPNG();
        if (png.length > GRAB_BUDGET.screenshotMaxBytes) throw new Error("Screenshot exceeds 2 MB limit");
        return {
            mimeType: "image/png",
            dataUrl: `data:image/png;base64,${png.toString("base64")}`,
            width: Math.round((right - left) / sx),
            height: Math.round((bottom - top) / sy),
        };
    } finally {
        if (!guest.isDestroyed())
            await guest
                .executeJavaScript(
                    `(() => {
            const host=window.__krontermGrab?.host;if(host)host.style.visibility='';
            document.querySelectorAll('[data-kronterm-capture-mask]').forEach(el=>el.remove());
        })()`
                )
                .catch(() => {});
    }
}

export function parseBrowserCookies(json: unknown): Electron.CookiesSetDetails[] {
    if (typeof json !== "string" || json.length > 1_000_000) throw new Error("Cookie file exceeds 1 MB limit");
    const value = JSON.parse(json);
    const rows = Array.isArray(value) ? value : value?.cookies;
    if (!Array.isArray(rows) || rows.length > 500) throw new Error("Expected at most 500 JSON cookies");
    return rows.map((row) => {
        if (
            !row ||
            typeof row.name !== "string" ||
            typeof row.value !== "string" ||
            row.name.length > 512 ||
            row.value.length > 16_384
        )
            throw new Error("Invalid cookie");
        const domain = typeof row.domain === "string" ? row.domain.replace(/^\./, "") : "";
        const url = new URL(
            typeof row.url === "string"
                ? row.url
                : `${row.secure === false ? "http" : "https"}://${domain}${row.path || "/"}`
        );
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
            throw new Error("Invalid cookie origin");
        return {
            url: url.toString(),
            name: row.name,
            value: row.value,
            ...(typeof row.domain === "string" && !row.hostOnly ? { domain: row.domain } : {}),
            path: typeof row.path === "string" ? row.path : "/",
            secure: row.secure !== false,
            httpOnly: row.httpOnly === true,
            ...(["unspecified", "no_restriction", "lax", "strict"].includes(row.sameSite)
                ? { sameSite: row.sameSite }
                : {}),
            ...(Number.isFinite(row.expirationDate) ? { expirationDate: row.expirationDate } : {}),
        };
    });
}

export function registerBrowserToolsIpc(isTrusted: (sender: WebContents) => boolean): void {
    ipcMain.handle("browser-sessions", (event, input: BrowserSessionsCommand) => {
        if (!isTrusted(event.sender)) throw new Error("Untrusted browser caller");
        return manageBrowserSessions(event.sender, input);
    });
    ipcMain.handle("browser-migration", async (event, command: BrowserMigrationCommand) => {
        const sender = event.sender;
        const frame = event.senderFrame;
        const trusted = () => !sender.isDestroyed() && frame != null && frame === sender.mainFrame && isTrusted(sender);
        if (!trusted()) throw new Error("Untrusted browser caller");
        if (command?.action === "bookmarks") return { imported: await importBrowserBookmarks(command.bookmarks) };
        if (command?.action === "password-manager") {
            return { canceled: !(await openExternalPasswordManager(trusted)) };
        }
        if (command?.action !== "extensions" && command?.action !== "install" && command?.action !== "remove") {
            throw new Error("Unknown browser migration action.");
        }
        const guest = ownedBrowserGuest(sender, command.guestId);
        const profile = getExtensionProfile(guest.session);
        if (!profile) throw new Error("Switch to the Work or Personal browser profile to use extensions.");
        if (command.action === "install") {
            if (typeof command.browser !== "string" || !Object.hasOwn(MigrationBrowsers, command.browser)) {
                throw new Error("Unknown source browser.");
            }
            const installed = await importBrowserExtension(
                profile,
                command.browser,
                () => trusted() && !guest.isDestroyed() && guest.hostWebContents?.id === sender.id
            );
            return {
                installed: installed ?? undefined,
                canceled: installed == null,
                extensions: listMigratedExtensions(profile),
            };
        }
        if (command.action === "remove") {
            if (typeof command.id !== "string" || !/^[a-p]{32}$/.test(command.id))
                throw new Error("Invalid extension ID.");
            await removeMigratedExtension(profile, command.id);
        }
        return { extensions: listMigratedExtensions(profile) };
    });
    ipcMain.handle("browser-import-extension", async (event, guestId: unknown) => {
        if (!isTrusted(event.sender)) throw new Error("Untrusted browser caller");
        const guest = ownedBrowserGuest(event.sender, guestId);
        const profile = guest.session;
        if (!profile.isPersistent() || profile === session.defaultSession || profile === event.sender.session) {
            throw new Error("Switch to the Work or Personal browser profile to import extensions.");
        }
        const selected = await dialog.showOpenDialog({
            title: "Import unpacked Chrome extension",
            buttonLabel: "Import Extension",
            properties: ["openDirectory"],
        });
        if (selected.canceled || !selected.filePaths[0]) return null;
        ownedBrowserGuest(event.sender, guestId);
        const extension = await profile.extensions.loadExtension(selected.filePaths[0]);
        return extension.name;
    });
    ipcMain.handle("browser-search-suggestions", async (event, value: unknown) => {
        if (!isTrusted(event.sender)) throw new Error("Untrusted browser caller");
        if (typeof value !== "string" || value.length > 100) return [];
        const query = value.trim();
        if (query.length < 3 || /[/:@\\]/.test(query)) return [];
        const url = new URL("https://duckduckgo.com/ac/");
        url.searchParams.set("q", query);
        try {
            const response = await net.fetch(url.href, {
                credentials: "omit",
                redirect: "error",
                signal: AbortSignal.timeout(2500),
            });
            if (!response.ok) return [];
            const rows: unknown = await response.json();
            if (!Array.isArray(rows)) return [];
            return [
                ...new Set(
                    rows.flatMap((row) => {
                        const phrase = row?.phrase;
                        return typeof phrase === "string" && phrase.length <= 120 && phrase.trim()
                            ? [phrase.trim()]
                            : [];
                    })
                ),
            ].slice(0, 5);
        } catch {
            return [];
        }
    });
    ipcMain.handle("browser-site-settings", (event, input: BrowserSiteSettingsCommand) => {
        if (!isTrusted(event.sender)) throw new Error("Untrusted browser caller");
        return readBrowserSiteSettings(ownedBrowserGuest(event.sender, input?.guestId), input, event.sender);
    });
    ipcMain.handle("browser-account", (event, input: BrowserAccountCommand) => {
        if (!isTrusted(event.sender)) throw new Error("Untrusted browser caller");
        return browserAccount(ownedBrowserGuest(event.sender, input?.guestId), input);
    });
    ipcMain.handle("browser-accessibility-snapshot", async (event, guestId: unknown) => {
        if (!isTrusted(event.sender)) throw new Error("Untrusted browser caller");
        return browserAccessibilitySnapshot(ownedBrowserGuest(event.sender, guestId));
    });
    ipcMain.handle("browser-navigation-history", async (event, guestId: unknown, restore: unknown) => {
        if (!isTrusted(event.sender)) throw new Error("Untrusted browser caller");
        const guest = ownedBrowserGuest(event.sender, guestId);
        if (restore != null) {
            const snapshot = browserNavigationSnapshot(restore);
            if (!snapshot) throw new Error("Invalid browser navigation history");
            // Electron accepts restoration only before the guest has loaded its first page.
            // A remounted notch may already own a live guest; preserve its current history.
            if (!guest.getURL()) await guest.navigationHistory.restore(snapshot);
        }
        const entries = guest.navigationHistory.getAllEntries();
        const activeIndex = guest.navigationHistory.getActiveIndex();
        const start = Math.max(0, Math.min(activeIndex - 30, entries.length - 60));
        return browserNavigationSnapshot({ entries: entries.slice(start, start + 60), index: activeIndex - start });
    });
    const sessions = new BrowserGrabSessionController();
    const generations = new Map<number, number>();
    ipcMain.handle("browser-grab", async (event, input) => {
        if (!isTrusted(event.sender)) throw new Error("Untrusted browser caller");
        const guest = ownedBrowserGuest(event.sender, input?.guestId);
        if (typeof input?.opId !== "string" || input.opId.length > 128) throw new Error("Invalid operation ID");
        const key = `${event.sender.id}:${guest.id}`;
        const generation = (generations.get(guest.id) ?? 0) + 1;
        generations.set(guest.id, generation);
        sessions.cancelGrabOp(key, "user");
        let navigated = false;
        const navigation = (_event: unknown, _url: unknown, _inPlace: unknown, mainFrame: boolean) => {
            if (mainFrame) navigated = true;
        };
        guest.on("did-start-navigation", navigation);
        try {
            await guest.executeJavaScript(buildGuestOverlayScript("arm"));
        } finally {
            guest.off("did-start-navigation", navigation);
        }
        if (generations.get(guest.id) !== generation) return { opId: input.opId, kind: "cancelled", reason: "user" };
        if (navigated) {
            await guest.executeJavaScript(buildGuestOverlayScript("teardown")).catch(() => {});
            return { opId: input.opId, kind: "cancelled", reason: "navigation" };
        }
        return sessions.awaitGrabSelection(key, input.opId, guest);
    });
    ipcMain.handle("browser-cancel-grab", async (event, guestId) => {
        if (!isTrusted(event.sender)) throw new Error("Untrusted browser caller");
        const guest = ownedBrowserGuest(event.sender, guestId);
        generations.set(guest.id, (generations.get(guest.id) ?? 0) + 1);
        sessions.cancelGrabOp(`${event.sender.id}:${guest.id}`, "user");
        await guest.executeJavaScript(buildGuestOverlayScript("teardown")).catch(() => {});
    });
    ipcMain.handle("capture-browser-page", async (event, input) => {
        if (!isTrusted(event.sender)) throw new Error("Untrusted browser caller");
        return captureBrowserScreenshot(ownedBrowserGuest(event.sender, input?.guestId), input?.rect);
    });
    ipcMain.handle("copy-browser-image", (event, dataUrl) => {
        if (!isTrusted(event.sender)) throw new Error("Untrusted browser caller");
        if (
            typeof dataUrl !== "string" ||
            dataUrl.length > 4_000_000 ||
            !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)
        )
            throw new Error("Invalid PNG image");
        const image = nativeImage.createFromDataURL(dataUrl);
        if (image.isEmpty()) throw new Error("Empty screenshot");
        clipboard.writeImage(image);
        return true;
    });
    ipcMain.handle("import-browser-cookies", async (event, input) => {
        if (!isTrusted(event.sender)) throw new Error("Untrusted browser caller");
        const guest = ownedBrowserGuest(event.sender, input?.guestId);
        const cookies = parseBrowserCookies(input?.cookiesJson);
        for (const cookie of cookies) await guest.session.cookies.set(cookie);
        return { count: cookies.length };
    });
}
