// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserAccessibilitySnapshot } from "../emain/browser/browser-accessibility";
import {
    browserObservationScript,
    browserTargetPointScript,
    browserWaitConditionScript,
} from "../frontend/app/store/browser-observation";
import { sendPointerDrag } from "../frontend/app/store/pointer-drag";

const directory = mkdtempSync(join(tmpdir(), "kron-browser-tools-smoke-"));
app.setPath("userData", join(directory, "profile"));
const fixture = join(directory, "fixture.html");
writeFileSync(
    fixture,
    `<!doctype html><html><body style="margin:24px">
<button id="click" onclick="document.querySelector('#result').textContent='clicked'">Activate control</button>
<output id="result">waiting</output><input id="text" aria-label="Message">
<div id="shadow"></div><canvas id="drawing" aria-label="Drawing area" width="400" height="200" style="display:block;margin-top:20px;border:1px solid"></canvas>
<script>
const shadow=document.querySelector('#shadow').attachShadow({mode:'open'});
shadow.innerHTML='<button id="inner">Shadow control</button>';
shadow.querySelector('button').onclick=()=>document.querySelector('#result').textContent='shadow clicked';
window.strokePoints=0;window.pressed=false;
const drawing=document.querySelector('#drawing');
drawing.onpointerdown=e=>{window.pressed=true;drawing.setPointerCapture(e.pointerId)};
drawing.onpointermove=e=>{if(e.buttons===1&&window.pressed)window.strokePoints++};
drawing.onpointerup=()=>window.pressed=false;
</script></body></html>`
);

async function run() {
    app.dock?.hide();
    const win = new BrowserWindow({
        width: 1000,
        height: 700,
        show: false,
        webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    try {
        await win.loadFile(fixture);
        const guest = win.webContents;
        const dom = await guest.executeJavaScript(browserObservationScript(250));
        const ax = await browserAccessibilitySnapshot(guest);
        assert.ok(ax.some((el) => el.name === "Activate control"));
        assert.ok(dom.some((el) => el.name === "Shadow control"));
        async function click(name: string) {
            const target = dom.find((el) => el.name === name);
            assert.ok(target, name);
            const point = await guest.executeJavaScript(browserTargetPointScript(target.ref));
            assert.ok(point, `target point: ${name}`);
            guest.focus();
            guest.sendInputEvent({ type: "mouseMove", ...point });
            guest.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
            guest.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 });
            await guest.executeJavaScript(
                "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))"
            );
        }
        await click("Activate control");
        assert.equal(await guest.executeJavaScript("document.querySelector('#result').textContent"), "clicked");
        await click("Shadow control");
        assert.equal(await guest.executeJavaScript("document.querySelector('#result').textContent"), "shadow clicked");
        const field = dom.find((el) => el.name === "Message");
        await click("Message");
        await guest.insertText("transport verified");
        assert.equal(await guest.executeJavaScript("document.querySelector('#text').value"), "transport verified");
        const rect = await guest.executeJavaScript(
            "(()=>{const r=document.querySelector('#drawing').getBoundingClientRect();return {x:r.x,y:r.y}})()"
        );
        await sendPointerDrag(
            (event) => guest.sendInputEvent(event),
            { x: rect.x + 20, y: rect.y + 30 },
            { x: rect.x + 240, y: rect.y + 120 }
        );
        const stroke = await guest.executeJavaScript("({points:window.strokePoints,pressed:window.pressed})");
        assert.ok(stroke.points >= 12, JSON.stringify(stroke));
        assert.equal(stroke.pressed, false);
        await guest.executeJavaScript("document.querySelector('#text').remove()");
        assert.equal(await guest.executeJavaScript(browserWaitConditionScript(field.ref, "hidden")), true);
        const screenshot = await guest.capturePage(undefined, { stayHidden: true, stayAwake: true });
        assert.equal(screenshot.isEmpty(), false);
        process.stdout.write(
            JSON.stringify({
                passed: true,
                checks: [
                    "Chromium accessibility",
                    "shadow snapshot and click",
                    "native page click",
                    "native text insertion",
                    "paced canvas drag",
                    "removed-target wait",
                    "viewport capture",
                ],
                strokePoints: stroke.points,
            }) + "\n"
        );
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
app.on("will-quit", () => rmSync(directory, { recursive: true, force: true }));
