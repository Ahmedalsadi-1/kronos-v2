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
    it("picks the innermost Android element and leaves password text out of its context", async () => {
        const f = fixture();
        const service = new AndroidSimulatorService({
            sdk,
            run: async (binary, args) =>
                args.includes("cat")
                    ? Buffer.from(
                          '<hierarchy><node package="com.example" bounds="[0,0][720,1600]"><node class="android.widget.EditText" resource-id="password" password="true" text="private-value" bounds="[100,100][400,200]"/></node></hierarchy>'
                      )
                    : f.run(binary, args),
        });
        const selection = await service.pickElement("android-avd:Pixel_8", 0.25, 0.1, 720, 1600);
        expect(selection).toMatchObject({ role: "android.widget.EditText", id: "password" });
        expect(JSON.stringify(selection)).not.toContain("private-value");
        const dump = f.commands.find((args) => args.includes("uiautomator"));
        expect(f.commands.at(-1)).toEqual(["-s", "emulator-5554", "shell", "rm", "-f", dump.at(-1)]);
        expect(f.commands.some((args) => args.includes("input"))).toBe(false);
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

it("routes handset power and volume buttons through Android key events", async () => {
    const f = fixture();
    for (const [key, code] of [
        ["Power", "26"],
        ["VolumeUp", "24"],
        ["VolumeDown", "25"],
    ]) {
        await f.service.key("android-avd:Pixel_8", key);
        expect(f.commands.at(-1)).toEqual(["-s", "emulator-5554", "shell", "input", "keyevent", code]);
    }
});

it("shares overlapping ADB inventory and screenshot work without retaining frames", async () => {
    const f = fixture();
    const id = "android-avd:Pixel_8";
    const frames = await Promise.all([f.service.screenshot(id), f.service.screenshot(id), f.service.screenshot(id)]);
    expect(new Set(frames).size).toBe(1);
    expect(f.commands.filter((args) => args[0] === "devices")).toHaveLength(1);
    expect(f.commands.filter((args) => args.includes("screencap"))).toHaveLength(1);
    await f.service.screenshot(id);
    expect(f.commands.filter((args) => args.includes("screencap"))).toHaveLength(2);
});

it("starts a fresh screenshot across a control generation change", async () => {
    const f = fixture();
    const id = "android-avd:Pixel_8";
    await Promise.all([f.service.screenshot(id, 1), f.service.screenshot(id, 2)]);
    expect(f.commands.filter((args) => args.includes("screencap"))).toHaveLength(2);
});

it("polls the selected boot serial without repeating SDK inventory", async () => {
    const f = fixture(false);
    let checks = 0;
    const service = new AndroidSimulatorService({
        sdk,
        launch: f.launch,
        sleep: async () => {},
        run: async (binary, args) => {
            if (args.includes("sys.boot_completed")) return Buffer.from(++checks === 3 ? "1" : "0");
            return f.run(binary, args);
        },
    });
    expect((await service.boot("android-avd:Pixel_8")).serial).toBe("emulator-5554");
    expect(checks).toBe(3);
    expect(f.commands.filter((args) => args[0] === "-list-avds")).toHaveLength(1);
    expect(f.commands.filter((args) => args[0] === "devices")).toHaveLength(2);
});

it("counts slow ADB work toward the boot deadline", async () => {
    const f = fixture(false);
    let elapsed = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const service = new AndroidSimulatorService({
        sdk,
        launch: f.launch,
        bootTimeoutMs: 2000,
        sleep: async () => {},
        run: async (binary, args) => {
            if (args.includes("sys.boot_completed")) {
                elapsed += 2500;
                return Buffer.from("0");
            }
            return f.run(binary, args);
        },
    });
    try {
        await expect(service.boot("android-avd:Pixel_8")).rejects.toThrow("did not finish booting");
        expect(elapsed).toBe(2500);
    } finally {
        clock.mockRestore();
    }
});

it("does not reuse an overlapping pre-input capture for the after-image", async () => {
    const f = fixture();
    let release: (data: Buffer) => void;
    let captures = 0;
    const service = new AndroidSimulatorService({
        sdk,
        run: async (binary, args) => {
            if (args.includes("screencap") && ++captures === 1)
                return new Promise((resolve) => {
                    release = resolve;
                });
            return f.run(binary, args);
        },
    });
    await service.discover();
    const before = service.screenshot("android-avd:Pixel_8");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await service.tap("android-avd:Pixel_8", 0.5, 0.5);
    await service.screenshot("android-avd:Pixel_8");
    expect(captures).toBe(2);
    release(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]));
    await before;
});
