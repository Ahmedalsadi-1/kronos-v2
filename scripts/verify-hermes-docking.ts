import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const profile = mkdtempSync(join(tmpdir(), "kron-hermes-docking-"));
app.setPath("userData", profile);

async function run() {
    app.dock?.hide();
    const win = new BrowserWindow({
        width: 1200,
        height: 820,
        show: false,
        webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, backgroundThrottling: false },
    });
    const output = join(process.cwd(), "output/hermes-docking");
    mkdirSync(output, { recursive: true });
    const page = win.webContents;
    page.on("console-message", (event) => process.stderr.write(event.message + "\n"));
    const frame = () =>
        page.executeJavaScript("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    try {
        await win.loadURL("http://127.0.0.1:7007/?preview=hermes-docking");
        await page.executeJavaScript(`new Promise((resolve, reject) => {
            const until = Date.now() + 30000;
            const check = () => document.querySelector('[data-hermes-chat-mount] textarea') ? resolve(true) : Date.now() > until ? reject(new Error(document.body.innerText.slice(0, 1200))) : setTimeout(check, 100);
            check();
        })`);
        await frame();
        const capture = async (name: string) => {
            await new Promise<void>((resolve) => {
                page.once("paint", () => resolve());
                page.invalidate();
                setTimeout(resolve, 1000);
            });
            writeFileSync(
                join(output, name),
                (await page.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()
            );
        };
        await capture("hud.png");
        await page.executeJavaScript(
            "window.dockingFixtureInput = document.querySelector('textarea'); window.dockingFixtureInput.focus()"
        );
        const results = [];
        for (const mode of ["widgets", "tabs", "canvas", "os"]) {
            await page.executeJavaScript(
                `(() => { const select = document.querySelector('select'); select.value = ${JSON.stringify(mode)}; select.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('header > button').click(); })()`
            );
            await frame();
            const result = await page.executeJavaScript(`({
                mode: document.querySelector('[data-workspace-presentation]').dataset.workspacePresentation,
                sameComposer: document.querySelector('textarea') === window.dockingFixtureInput,
                draft: document.querySelector('textarea').value,
                mounts: document.querySelectorAll('[data-hermes-chat-mount]').length,
                radii: [...document.querySelectorAll('[data-hermes-app], [data-hermes-app] *')].map(el => getComputedStyle(el).borderRadius),
                overflow: document.documentElement.scrollWidth > innerWidth,
                docked: !!document.querySelector('#preview-chat-panel textarea')
            })`);
            assert.equal(result.mode, mode);
            assert.equal(result.sameComposer, true);
            assert.equal(result.mounts, 1);
            assert.equal(result.draft, "Inspect the current workspace");
            assert.equal(result.docked, true);
            assert.equal(result.overflow, false);
            assert.ok(
                result.radii.every((radius: string) => radius === "0px"),
                JSON.stringify(result.radii)
            );
            results.push({ mode, passed: true });
            if (mode === "os") await capture("os-panel.png");
            await page.executeJavaScript("document.querySelector('header > button').click()");
            await frame();
        }
        win.setContentSize(480, 720);
        await frame();
        await page.executeJavaScript("document.querySelector('header > button').click()");
        await frame();
        assert.equal(await page.executeJavaScript("document.documentElement.scrollWidth > innerWidth"), false);
        await capture("narrow-panel.png");
        process.stdout.write(JSON.stringify({ passed: true, fixture: true, results, output }) + "\n");
    } finally {
        win.destroy();
    }
}

app.whenReady()
    .then(run)
    .then(() => app.quit())
    .catch((error) => {
        process.stderr.write(String(error.stack ?? error) + "\n");
        app.exit(1);
    });
app.on("will-quit", () => rmSync(profile, { recursive: true, force: true }));
