import { describe, expect, it, vi } from "vitest";
import { AndroidRunner, AndroidSimulatorService } from "./android-simulator-service";

const sdk = { sdkRoot: "/sdk", adb: "/sdk/adb", emulator: "/sdk/emulator", avdmanager: "/sdk/avdmanager" };
function fixture(booted = true) {
    const commands: string[][] = [];
    let active = booted;
    const run: AndroidRunner = vi.fn(async (_binary, args) => {
        commands.push(args);
        if (args[0] === "-list-avds") {
            return Buffer.from("Pixel_8\nINFO    | discovery\n");
        }
        if (args[0] === "devices") {
            return Buffer.from(`List of devices attached\n${active ? "emulator-5554 device model:Pixel\n" : ""}`);
        }
        if (args.includes("name")) {
            return Buffer.from("Pixel_8\nOK\n");
        }
        if (args.includes("sys.boot_completed")) {
            return Buffer.from("1\n");
        }
        if (args.includes("size")) {
            return Buffer.from("Physical size: 1080x2400\nOverride size: 720x1600\n");
        }
        if (args.includes("screencap")) {
            return Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
        }
        return Buffer.from("");
    });
    const launch = vi.fn(async () => {
        active = true;
    });
    return { commands, run, launch, service: new AndroidSimulatorService({ sdk, run, launch, sleep: async () => {} }) };
}

describe("Android simulator service using Orca source", () => {
    it("includes shutdown AVDs without booting them", async () => {
        const f = fixture(false);
        expect(await f.service.discover()).toEqual([
            {
                id: "android-avd:Pixel_8",
                name: "Pixel_8",
                avdName: "Pixel_8",
                status: "shutdown",
                runtime: "Android emulator",
            },
        ]);
        expect(f.launch).not.toHaveBeenCalled();
    });
    it("maps a real running AVD once and clamps normalized pixel edges", async () => {
        const f = fixture();
        expect(await f.service.discover()).toHaveLength(1);
        await f.service.tap("android-avd:Pixel_8", 1, 0.5);
        expect(f.commands.at(-1)).toEqual(["-s", "emulator-5554", "shell", "input", "tap", "719", "800"]);
    });
    it("rejects invalid coordinates before invoking adb", async () => {
        const f = fixture();
        await expect(f.service.tap("android-avd:Pixel_8", NaN, 0)).rejects.toThrow("Coordinates");
        expect(f.commands).toHaveLength(0);
    });
    it("starts the selected headless AVD and deduplicates concurrent launch requests", async () => {
        const f = fixture(false);
        const [a, b] = await Promise.all([
            f.service.boot("android-avd:Pixel_8"),
            f.service.boot("android-avd:Pixel_8"),
        ]);
        expect(a.serial).toBe("emulator-5554");
        expect(b).toEqual(a);
        expect(f.launch).toHaveBeenCalledOnce();
        expect(f.launch).toHaveBeenCalledWith(sdk.emulator, [
            "-avd",
            "Pixel_8",
            "-no-window",
            "-no-boot-anim",
            "-memory",
            "1536",
            "-cores",
            "2",
        ]);
    });
    it("does not launch an arbitrary renderer-provided AVD name", async () => {
        const f = fixture(false);
        await expect(f.service.boot("android-avd:injected")).rejects.toThrow("no longer exists");
        expect(f.launch).not.toHaveBeenCalled();
    });
    it("returns binary screenshots and routes swipe/home/back to the selected serial", async () => {
        const f = fixture();
        expect(await f.service.screenshot("android-avd:Pixel_8")).toMatch(/^data:image\/png;base64,/);
        await f.service.swipe("android-avd:Pixel_8", 0, 0, 1, 1);
        expect(f.commands.at(-1)).toEqual([
            "-s",
            "emulator-5554",
            "shell",
            "input",
            "swipe",
            "0",
            "0",
            "719",
            "1599",
            "300",
        ]);
        await f.service.button("android-avd:Pixel_8", "back");
        expect(f.commands.at(-1)?.slice(-2)).toEqual(["keyevent", "4"]);
    });
    it("quotes text for adb's remote shell instead of executing shell metacharacters", async () => {
        const f = fixture();
        await f.service.type("android-avd:Pixel_8", "it's $(evil); okay");
        expect(f.commands.at(-1)?.at(-1)).toBe("'it'\\''s%s$(evil);%sokay'");
        await expect(f.service.type("android-avd:Pixel_8", "line\nbreak")).rejects.toThrow("ASCII");
    });
    it("reuses recent inventory across live frames and invalidates it on shutdown", async () => {
        const f = fixture();
        await f.service.screenshot("android-avd:Pixel_8");
        await f.service.screenshot("android-avd:Pixel_8");
        expect(f.commands.filter((args) => args[0] === "-list-avds")).toHaveLength(1);
        await f.service.shutdown("android-avd:Pixel_8");
        expect(f.commands.at(-1)).toEqual(["-s", "emulator-5554", "emu", "kill"]);
        await f.service.screenshot("android-avd:Pixel_8");
        expect(f.commands.filter((args) => args[0] === "-list-avds")).toHaveLength(2);
    });
    it("fails boot readiness and invalid screenshots honestly", async () => {
        const f = fixture(false);
        const service = new AndroidSimulatorService({
            sdk,
            run: f.run,
            launch: async () => {},
            sleep: async () => {},
            bootTimeoutMs: 1000,
        });
        await expect(service.boot("android-avd:Pixel_8")).rejects.toThrow("did not finish booting");
        const bad = new AndroidSimulatorService({
            sdk,
            run: async (binary, args) => (args.includes("screencap") ? Buffer.from("bad") : f.run(binary, args)),
        });
        await f.launch();
        await expect(bad.screenshot("android-avd:Pixel_8")).rejects.toThrow("invalid screenshot");
    });
});

it("sends editing keys through ADB and rejects unsupported key strings", async () => {
    const f = fixture();
    await f.service.key("android-avd:Pixel_8", "Backspace");
    expect(f.commands.at(-1)).toEqual(["-s", "emulator-5554", "shell", "input", "keyevent", "67"]);
    const count = f.commands.length;
    await expect(f.service.key("android-avd:Pixel_8", "$(bad)")).rejects.toThrow("Unsupported");
    expect(f.commands).toHaveLength(count);
});

it("reuses the display size for repeated taps and swipes", async () => {
    const f = fixture();
    await f.service.tap("android-avd:Pixel_8", 0.5, 0.5);
    await f.service.tap("android-avd:Pixel_8", 0.6, 0.6);
    await f.service.swipe("android-avd:Pixel_8", 0.5, 0.8, 0.5, 0.2);
    expect(f.commands.filter((args) => args.includes("size"))).toHaveLength(1);
});
