import { V86 } from "v86";
import FallbackWasmUrl from "v86/build/v86-fallback.wasm?url";
import WasmUrl from "v86/build/v86.wasm?url";
import { listGuestFiles, readGuestText, writeGuestFiles } from "./local-linux-files";
import { LocalLinuxReadyMarker, type LocalLinuxRequest, type LocalLinuxResponse } from "./local-linux-protocol";

let vm: V86 | undefined;
let ready = false;
let desiredRunning = true;
let tail = "";
let output = "";
let outputTimer: ReturnType<typeof setTimeout> | undefined;
let assetBaseURL = "";
const workerScope = self as unknown as {
    postMessage: (message: LocalLinuxResponse, transfers: Transferable[]) => void;
};
const reply = (message: LocalLinuxResponse, transfers: Transferable[] = []) =>
    workerScope.postMessage(message, transfers);
const flushOutput = () => {
    if (output) reply({ type: "output", text: output });
    output = "";
    outputTimer = undefined;
};
const fetchBuffer = async (url: string) => {
    const response = await fetch(new URL(url, assetBaseURL).href);
    if (!response.ok) throw new Error(`Local Linux asset unavailable (${response.status})`);
    return response.arrayBuffer();
};

async function start(snapshot?: ArrayBuffer): Promise<void> {
    if (vm) return;
    reply({ type: "phase", phase: "starting", ready: false });
    const [bios, vga, linux] = await Promise.all([
        fetchBuffer("/local-linux/seabios.bin"),
        fetchBuffer("/local-linux/vgabios.bin"),
        fetchBuffer("/local-linux/linux.bin"),
    ]);
    vm = new V86({
        wasm_fn: async (imports) => {
            try {
                return (await WebAssembly.instantiate(await fetchBuffer(WasmUrl), imports)).instance.exports;
            } catch {
                return (await WebAssembly.instantiate(await fetchBuffer(FallbackWasmUrl), imports)).instance.exports;
            }
        },
        bios: { buffer: bios },
        vga_bios: { buffer: vga },
        bzimage: { buffer: linux },
        memory_size: 64 * 1024 * 1024,
        vga_memory_size: 2 * 1024 * 1024,
        cmdline: "console=ttyS0 tsc=reliable random.trust_cpu=on",
        filesystem: {},
        autostart: false,
        disable_keyboard: true,
        disable_mouse: true,
        disable_speaker: true,
    });
    let initializedGuest = false;
    vm.add_listener("serial0-output-byte", (byte) => {
        const char = String.fromCharCode(byte);
        output += char;
        tail = (tail + char).slice(-2048);
        outputTimer ??= setTimeout(flushOutput, 40);
        if (!snapshot && !initializedGuest && tail.endsWith("~% ")) {
            initializedGuest = true;
            vm!.serial0_send("cd /mnt && printf 'KRON%s\\n' 'TERM_VM_READY'\n");
        }
        if (!ready && tail.includes(LocalLinuxReadyMarker)) {
            ready = true;
            reply({ type: "phase", phase: desiredRunning ? "running" : "paused", ready: true });
        }
    });
    await new Promise<void>((resolve) => vm!.add_listener("emulator-ready", () => resolve()));
    if (snapshot) {
        await vm.restore_state(snapshot);
        ready = true;
    }
    if (desiredRunning) await vm.run();
    if (snapshot || !desiredRunning) reply({ type: "phase", phase: desiredRunning ? "running" : "paused", ready });
}

let operations = Promise.resolve();
onmessage = ({ data }: MessageEvent<LocalLinuxRequest>) => {
    if (data.type === "pause") desiredRunning = false;
    if (data.type === "resume") desiredRunning = true;
    operations = operations.then(async () => {
        try {
            if (data.type === "start") {
                assetBaseURL = data.assetBaseURL;
                await start(data.snapshot);
            } else {
                if (!vm) throw new Error("Local Linux has not started");
                switch (data.type) {
                    case "input":
                        if (!ready || !vm.is_running()) throw new Error("Resume Local Linux before sending input");
                        vm.serial_send_bytes(0, new TextEncoder().encode(data.text));
                        break;
                    case "pause":
                        await vm.stop();
                        reply({ type: "phase", phase: "paused", ready });
                        break;
                    case "resume":
                        await vm.run();
                        reply({ type: "phase", phase: ready ? "running" : "starting", ready });
                        break;
                    case "save": {
                        if (!ready) throw new Error("Wait for Linux to finish booting before saving");
                        const running = vm.is_running();
                        await vm.stop();
                        const buffer = await vm.save_state();
                        if (running && desiredRunning) await vm.run();
                        flushOutput();
                        reply({ type: "result", id: data.id, snapshot: buffer }, [buffer]);
                        return;
                    }
                    case "write-files":
                        if (!ready) throw new Error("Linux is still booting");
                        await writeGuestFiles(vm, data.files);
                        break;
                    case "list-files":
                        if (!ready) throw new Error("Linux is still booting");
                        reply({ type: "result", id: data.id, entries: listGuestFiles(vm, data.path) });
                        return;
                    case "read-file": {
                        const content = await readGuestText(vm, data.path);
                        reply({ type: "result", id: data.id, content });
                        return;
                    }
                }
            }
            reply({ type: "result", id: data.id });
        } catch (reason) {
            reply({ type: "error", id: data.id, message: reason instanceof Error ? reason.message : String(reason) });
        }
    });
};
addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    reply({ type: "error", message: event.reason instanceof Error ? event.reason.message : String(event.reason) });
    event.preventDefault();
});
