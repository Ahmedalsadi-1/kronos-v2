// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { blockComponentModelMap } from "@/app/store/global-atoms";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { controlWorkspaceSurface, getWorkspaceSurfaceModeProvider } from "@/app/tab/workspace-surface-runtime";
import { stringToBase64 } from "@/util/util";

export async function runSmoke(runtime: any, report: any, persist: () => void) {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let attempt = 0; attempt < 30; attempt++) {
        if (getWorkspaceSurfaceModeProvider(runtime.init.tabId)) break;
        await wait(1000);
    }
    const provider = getWorkspaceSurfaceModeProvider(runtime.init.tabId);
    if (!provider) {
        report.checks.shell = { pass: false, error: "OS surface provider not mounted" };
        persist();
        return;
    }
    report.checks.shell = { pass: provider.snapshot().presentation === "os", snapshot: provider.snapshot() };
    for (const input of [
        { action: "os.app.launch", view: "term" },
        { action: "os.app.launch", view: "web" },
        { action: "os.window.arrange", position: "tile" },
    ] as const) {
        try {
            const result = await controlWorkspaceSurface(runtime.init.tabId, input);
            report.checks[input.action + ("view" in input ? `:${input.view}` : "")] = result;
            await wait(1500);
        } catch (error) {
            report.checks[input.action] = { pass: false, error: String(error) };
        }
        persist();
    }
    const terminalEntry = [...blockComponentModelMap.entries()].find(
        ([, component]) => (component.viewModel as any).termRef?.current?.terminal
    );
    if (terminalEntry) {
        try {
            const [blockId, component] = terminalEntry;
            const model = component.viewModel as any;
            const terminal = model.termRef.current.terminal;
            await RpcApi.SetMetaCommand(TabRpcClient, { oref: `block:${blockId}`, meta: { controller: "shell" } });
            report.checks.terminalSetup =
                "Explicit shell controller metadata supplied; OS launcher created a terminal without a controller.";
            await RpcApi.ControllerResyncCommand(TabRpcClient, {
                tabid: runtime.init.tabId,
                blockid: blockId,
                rtopts: { termsize: { rows: 25, cols: 80 } },
            });
            await wait(1000);
            const marker = "KRONTERM_" + crypto.randomUUID().replaceAll("-", "");
            // Splitting the marker prevents terminal echo from satisfying the output assertion.
            const command = `printf '%s%s\\n' '${marker.slice(0, 12)}' '${marker.slice(12)}'\r`;
            await RpcApi.ControllerInputCommand(TabRpcClient, {
                blockid: blockId,
                inputdata64: stringToBase64(command),
            });
            let found = false;
            for (let attempt = 0; attempt < 20; attempt++) {
                await wait(500);
                const buffer = terminal.buffer.active;
                for (let row = 0; row < buffer.length; row++) {
                    if (buffer.getLine(row)?.translateToString(true).trim() === marker) found = true;
                }
                if (found) break;
            }
            report.checks.terminalOutput = { pass: found, blockId };
            await controlWorkspaceSurface(runtime.init.tabId, { action: "os.window.minimize", blockid: blockId });
            await wait(500);
            await controlWorkspaceSurface(runtime.init.tabId, { action: "os.window.restore", blockid: blockId });
            await wait(500);
            report.checks.terminalIdentity = {
                pass: (component.viewModel as any).termRef.current?.terminal === terminal,
            };
        } catch (error) {
            report.checks.terminalOutput = { pass: false, error: String(error) };
        }
    } else report.checks.terminalOutput = { pass: false, error: "No live terminal instance" };
    const browser = document.querySelector("kronterm-webview") as any;
    if (browser) {
        try {
            await browser.loadURL("http://127.0.0.1:14291/");
            await wait(2000);
            await browser.executeJavaScript("document.getElementById('probe').click()");
            report.checks.browserInteraction = { status: "dispatched; verify browser-proof.json from fixture server" };
        } catch (error) {
            report.checks.browserInteraction = { pass: false, error: String(error) };
        }
    }
    report.agentControl = {
        kind: "deterministic typed surface actions; no LLM session",
        snapshot: getWorkspaceSurfaceModeProvider(runtime.init.tabId)?.snapshot(),
    };
    persist();
    (window as any).prototypeControl = (input: any) => controlWorkspaceSurface(runtime.init.tabId, input);
}
