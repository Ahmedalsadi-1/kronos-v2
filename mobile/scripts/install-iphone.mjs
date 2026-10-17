import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const run = (name, args) => execFileSync(name, args, { encoding: "utf8" }).trim();
try {
    const devices = run("idevice_id", ["-l"]).split("\n").filter(Boolean);
    if (process.argv.includes("--check")) {
        console.log(`USB iPhones: ${devices.length}`);
        console.log(`Developer directory: ${run("xcode-select", ["-p"])}`);
        console.log("A device-provisioned, signed KronTerm IPA is required. ipatool downloads published App Store apps only.");
        process.exit(devices.length ? 0 : 2);
    }
    const argument = process.argv[2];
    if (!argument || !argument.endsWith(".ipa")) throw new Error("Usage: node mobile/scripts/install-iphone.mjs /absolute/path/KronTerm.ipa [UDID]");
    const ipa = resolve(argument);
    if (!existsSync(ipa)) throw new Error("IPA file does not exist");
    const device = process.argv[3] ?? (devices.length === 1 ? devices[0] : undefined);
    if (!device || !devices.includes(device)) throw new Error("Connect and trust one iPhone, or specify its detected UDID");
    const entries = run("unzip", ["-Z1", ipa]).split("\n");
    const info = entries.filter((entry) => /^Payload\/[^/]+\.app\/Info\.plist$/.test(entry));
    if (info.length !== 1) throw new Error("IPA must contain exactly one application");
    const plist = execFileSync("unzip", ["-p", ipa, info[0]]);
    const bundle = execFileSync("/usr/bin/plutil", ["-extract", "CFBundleIdentifier", "raw", "-o", "-", "-"], { input: plist, encoding: "utf8" }).trim();
    if (bundle !== "dev.kronterm.iphone") throw new Error(`Unexpected app bundle: ${bundle}`);
    if (!entries.some((entry) => /^Payload\/[^/]+\.app\/embedded\.mobileprovision$/.test(entry))) throw new Error("Missing device provisioning profile");
    const result = spawnSync("ideviceinstaller", ["-u", device, "install", ipa], { stdio: "inherit" });
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
} catch (reason) { console.error(reason.message); process.exit(1); }
