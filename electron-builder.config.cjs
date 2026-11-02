const { Arch } = require("electron-builder");
const pkg = require("./package.json");
const fs = require("fs");
const path = require("path");

const windowsShouldSign = !!process.env.SM_CODE_SIGNING_CERT_SHA1_HASH;

/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
const config = {
    appId: pkg.build.appId,
    productName: pkg.productName,
    executableName: pkg.productName,
    artifactName: "${productName}-${platform}-${arch}-${version}.${ext}",
    generateUpdatesFilesForAllChannels: true,
    npmRebuild: false,
    nodeGypRebuild: false,
    electronCompile: false,
    beforePack: async (context) => {
        if (context.electronPlatformName !== "darwin") return;
        const { execFile } = require("node:child_process");
        const { promisify } = require("node:util");
        await promisify(execFile)(process.execPath, ["scripts/build-desktop-picker.mjs", Arch[context.arch]], {
            cwd: context.packager.projectDir,
        });
        await promisify(execFile)(
            process.execPath,
            ["scripts/build-desktop-picker.mjs", Arch[context.arch], "background-computer"],
            {
                cwd: context.packager.projectDir,
            }
        );
        await promisify(execFile)(
            process.execPath,
            ["scripts/build-desktop-picker.mjs", Arch[context.arch], "background-display"],
            { cwd: context.packager.projectDir }
        );
    },
    files: [
        {
            from: "./dist",
            to: "./dist",
            filter: [
                "**/*",
                "!bin/*",
                "bin/wavesrv.${arch}*",
                "bin/wsh*",
                "!tsunamiscaffold/**/*",
                "!mcp-kron-term/**/*",
            ],
        },
        {
            from: ".",
            to: ".",
            filter: ["package.json"],
        },
        "!node_modules", // We don't need electron-builder to package in Node modules as Vite has already bundled any code that our program is using.
    ],
    extraResources: [
        {
            from: "integrations/openmausbot/upstream",
            to: "openmausbot",
            filter: [
                "dist/**/*",
                "dist-server/**/*",
                "LICENSE",
                "NOTICE",
                "LICENSING.md",
                "third_party/**/*",
                "package.json",
                "skills/**/*",
            ],
        },
        { from: "scripts/import-workflow-pack.py", to: "workflow-packs/import-workflow-pack.py" },
        {
            from: "emain/linux-desktop/upstream",
            to: "licenses/linux-desktop",
            filter: ["**/LICENSE*", "**/SOURCE.md", "**/NOTICE.md"],
        },
        {
            from: "emain/device-simulator",
            to: "licenses/device-simulator",
            filter: ["**/LICENSE", "**/SOURCE.md", "**/NOTICE.md"],
        },
        {
            from: "node_modules/serve-sim",
            to: "serve-sim",
            filter: ["dist/**/*", "bin/**/*", "package.json", "LICENSE*"],
        },
        {
            from: "dist/native",
            to: "native",
            filter: ["desktop-picker", "background-computer", "background-display"],
        },
        {
            from: "native",
            to: "native",
            filter: ["desktop-picker.swift", "desktop-picker"],
        },
        {
            from: "dist/tsunamiscaffold",
            to: "tsunamiscaffold",
        },
        {
            from: "dist/mcp-kron-term",
            to: "mcp-kron-term",
            filter: ["dist/**/*", "package.json"],
        },
        {
            from: "agents/hermes/plugins/advanced-delegation",
            to: "hermes-plugins/advanced-delegation",
            filter: ["**/*", "!tests/**", "!**/__pycache__/**"],
        },
        {
            from: "agents/hermes/plugins/orgo-computer",
            to: "hermes-plugins/orgo-computer",
            filter: ["**/*", "!tests/**", "!**/__pycache__/**"],
        },
        {
            from: "agents/hermes/computer-kit",
            to: "hermes-computer-kit",
            filter: ["**/*", "!**/__pycache__/**"],
        },
        {
            from: "dist/hermes-plugins",
            to: "hermes-plugins",
            filter: ["**/*"],
        },
        {
            from: "agents/kronoscode",
            to: "agents/kronoscode",
            filter: ["bin/kronoscode", "LICENSE", "README.md"],
        },
        {
            from: "agents/kronterm-agent",
            to: "agents/kronterm-agent",
            filter: ["bin/kronterm-agent", "README.md"],
        },
        {
            from: ".agents/skills",
            to: "kronterm-skills",
            filter: ["**/*"],
        },
    ],
    directories: {
        output: "make",
    },
    asarUnpack: [
        "dist/bin/**/*", // wavesrv and wsh binaries
        "dist/schema/**/*", // schema files for Monaco editor
    ],
    mac: {
        target: [
            {
                target: "zip",
                arch: ["arm64", "x64"],
            },
            {
                target: "dmg",
                arch: ["arm64", "x64"],
            },
        ],
        category: "public.app-category.developer-tools",
        minimumSystemVersion: "10.15.0",
        mergeASARs: true,
        singleArchFiles: "**/dist/bin/wavesrv.*",
        entitlements: "build/entitlements.mac.plist",
        entitlementsInherit: "build/entitlements.mac.plist",
        extendInfo: {
            NSContactsUsageDescription: "A CLI application running in Wave wants to use your contacts.",
            NSRemindersUsageDescription: "A CLI application running in Wave wants to use your reminders.",
            NSLocationWhenInUseUsageDescription:
                "A CLI application running in Wave wants to use your location information while active.",
            NSLocationAlwaysUsageDescription:
                "A CLI application running in Wave wants to use your location information, even in the background.",
            NSCameraUsageDescription: "A CLI application running in Wave wants to use the camera.",
            NSMicrophoneUsageDescription: "A CLI application running in Wave wants to use your microphone.",
            NSCalendarsUsageDescription: "A CLI application running in Wave wants to use Calendar data.",
            NSLocationUsageDescription: "A CLI application running in Wave wants to use your location information.",
            NSAppleEventsUsageDescription: "A CLI application running in Wave wants to use AppleScript.",
        },
    },
    linux: {
        artifactName: "${name}-${platform}-${arch}-${version}.${ext}",
        category: "TerminalEmulator",
        executableName: pkg.name,
        target: ["zip", "deb", "rpm", "snap", "AppImage", "pacman"],
        synopsis: pkg.description,
        description: null,
        desktop: {
            entry: {
                Name: pkg.productName,
                Comment: pkg.description,
                Keywords: "developer;terminal;emulator;",
                Categories: "Development;Utility;",
            },
        },
        executableArgs: ["--enable-features", "UseOzonePlatform", "--ozone-platform-hint", "auto"], // Hint Electron to use Ozone abstraction layer for native Wayland support
    },
    deb: {
        afterInstall: "build/deb-postinstall.tpl",
    },
    win: {
        target: ["nsis", "msi", "zip"],
        signtoolOptions: windowsShouldSign && {
            signingHashAlgorithms: ["sha256"],
            publisherName: "Command Line Inc",
            certificateSubjectName: "Command Line Inc",
            certificateSha1: process.env.SM_CODE_SIGNING_CERT_SHA1_HASH,
        },
    },
    appImage: {
        license: "LICENSE",
    },
    snap: {
        base: "core22",
        confinement: "classic",
        allowNativeWayland: true,
        artifactName: "${name}_${version}_${arch}.${ext}",
    },
    rpm: {
        // this should remove /usr/lib/.build-id/ links which can conflict with other electron apps like slack
        fpm: ["--rpm-rpmbuild-define", "_build_id_links none"],
    },
    publish: {
        provider: "generic",
        url: "https://dl.waveterm.dev/releases-w2",
    },
    afterPack: (context) => {
        // This is a workaround to restore file permissions to the wavesrv binaries on macOS after packaging the universal binary.
        if (context.electronPlatformName === "darwin" && context.arch === Arch.universal) {
            const packageBinDir = path.resolve(
                context.appOutDir,
                `${pkg.productName}.app/Contents/Resources/app.asar.unpacked/dist/bin`
            );

            // Reapply file permissions to the wavesrv binaries in the final app package
            fs.readdirSync(packageBinDir, {
                recursive: true,
                withFileTypes: true,
            })
                .filter((f) => f.isFile() && f.name.startsWith("wavesrv"))
                .forEach((f) => fs.chmodSync(path.resolve(f.parentPath ?? f.path, f.name), 0o755)); // 0o755 corresponds to -rwxr-xr-x
        }
    },
};

module.exports = config;
