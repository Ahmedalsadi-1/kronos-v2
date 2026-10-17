import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { V86 } from "v86";

const bytes = async (path) => {
    const value = await readFile(new URL(path, import.meta.url));
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
};
const [wasm, bios, vga, linux] = await Promise.all([
    bytes("../node_modules/v86/build/v86.wasm"),
    bytes("../public/local-linux/seabios.bin"),
    bytes("../public/local-linux/vgabios.bin"),
    bytes("../public/local-linux/linux.bin"),
]);
const vm = new V86({
    wasm_fn: async (imports) => (await WebAssembly.instantiate(wasm, imports)).instance.exports,
    bios: { buffer: bios }, vga_bios: { buffer: vga }, bzimage: { buffer: linux },
    memory_size: 64 * 1024 * 1024, vga_memory_size: 2 * 1024 * 1024,
    cmdline: "console=ttyS0 tsc=reliable random.trust_cpu=on",
    filesystem: {}, disable_keyboard: true, disable_mouse: true, disable_speaker: true, autostart: true,
});
let output = "";
let sent = false;
const timeout = setTimeout(async () => {
    console.error(output.slice(-4000));
    await vm.destroy();
    process.exit(1);
}, 120_000);
await new Promise((resolve) => {
    vm.add_listener("serial0-output-byte", (byte) => {
        output += String.fromCharCode(byte);
        if (!sent && output.endsWith("~% ")) {
            sent = true;
            vm.serial0_send("uname -a; cd /mnt; sh -c 'printf isolated-output' > .kron-output 2>&1; r=$?; head -c 65536 .kron-output > .kron-bounded; cat .kron-bounded; printf '\\nEXIT:%s\\n' \"$r\"; printf 'KRON%s\\n' 'TERM_BOOT_OK'\n");
        }
        if (sent && output.includes("KRONTERM_BOOT_OK")) resolve();
    });
});
clearTimeout(timeout);
assert.match(output, /Linux \(none\) 6\.8/);
assert.match(output, /isolated-output\r?\nEXIT:0/);
assert.doesNotMatch(output, /mount:.*(?:failed|No such|not found)/);
console.log(output.slice(-1500));
await vm.stop();
const snapshot = await vm.save_state();
console.log(`Local Linux boot and command passed. Snapshot: ${snapshot.byteLength} bytes.`);
await vm.destroy();
