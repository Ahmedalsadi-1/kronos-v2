import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const Here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contents = path.join(Here, ".runtime/KronTermTauriPrototype.app/Contents");
await mkdir(path.join(contents, "MacOS"), { recursive: true });
await copyFile(
    path.join(Here, "src-tauri/target/release/kronterm-tauri-os"),
    path.join(contents, "MacOS/kronterm-tauri-os")
);
await writeFile(
    path.join(contents, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>kronterm-tauri-os</string>
<key>CFBundleIdentifier</key><string>dev.kronterm.tauri-prototype</string>
<key>CFBundleName</key><string>KronTerm Tauri Prototype</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>`
);
console.log(path.dirname(contents));
