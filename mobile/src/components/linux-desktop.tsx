import { useEffect, useRef, useState } from "react";
import { V86 } from "v86";
import WasmUrl from "v86/build/v86.wasm?url";
import { phoneWidgetSurfaces } from "../lib/phone-widget-surfaces";

export function LinuxDesktop({ active, controlEnabled = true }: { active: boolean; controlEnabled?: boolean }) {
    const screen = useRef<HTMLDivElement>(null);
    const vm = useRef<V86 | undefined>(undefined);
    const generation = useRef(0);
    const activeRef = useRef(active);
    activeRef.current = active;
    const [phase, setPhase] = useState("idle");
    const [error, setError] = useState("");
    const keyboard = useRef<HTMLTextAreaElement>(null);
    const directPointer = useRef<{ x: number; y: number } | undefined>(undefined);
    const lastTap = useRef(0);
    const dragged = useRef(false);
    const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(clickTimer.current), []);
    useEffect(() => {
        if (phase !== "running") return;
        const publish = () => {
            const canvas = screen.current?.querySelector("canvas");
            phoneWidgetSurfaces.publish({
                id: "phone-desktop",
                kind: "app",
                localLinux: true,
                localWidget: "desktop",
                hostId: "local-linux",
                hostLabel: "This iPhone",
                hostColor: "#8b5cf6",
                title: "Linux desktop",
                subtitle: "Tiny Core · 128 MB",
                status: active ? "live" : "suspended",
                attention: "none",
                updatedAt: Date.now(),
                previewUrl:
                    canvas && canvas.width > 0 && canvas.style.display !== "none"
                        ? canvas.toDataURL("image/png")
                        : undefined,
                capabilities: ["focus"],
            });
        };
        publish();
        const timer = active ? setInterval(publish, 2_000) : undefined;
        return () => clearInterval(timer);
    }, [phase, active]);
    useEffect(() => () => phoneWidgetSurfaces.remove("phone-desktop"), []);
    const pointer = useRef<{ x: number; y: number } | undefined>(undefined);
    const mouse = (name: string, value: unknown) => {
        phoneWidgetSurfaces.markUsed("phone-desktop");
        (vm.current as (V86 & { bus: { send: (event: string, data: unknown) => void } }) | undefined)?.bus.send(
            name,
            value
        );
    };
    const click = (right = false) => {
        mouse("mouse-click", [!right, false, right]);
        mouse("mouse-click", [false, false, false]);
    };
    useEffect(
        () => () => {
            generation.current++;
            void vm.current?.destroy();
            vm.current = undefined;
        },
        []
    );
    useEffect(() => {
        const update = () => {
            if (!vm.current) return;
            if (active && document.visibilityState !== "hidden") void vm.current.run();
            else void vm.current.stop();
        };
        update();
        document.addEventListener("visibilitychange", update);
        return () => document.removeEventListener("visibilitychange", update);
    }, [active]);
    const start = async () => {
        if (vm.current || phase === "starting") return;
        const current = ++generation.current;
        setPhase("starting");
        setError("");
        try {
            const buffer = async (path: string) => {
                const response = await fetch(new URL(path, window.location.href));
                if (!response.ok) throw new Error(`Desktop asset unavailable: ${response.status}`);
                return response.arrayBuffer();
            };
            const [bios, vga, disk] = await Promise.all([
                buffer("/local-linux/seabios.bin"),
                buffer("/local-linux/vgabios.bin"),
                buffer("/local-linux/tinycore-11.iso"),
            ]);
            if (current !== generation.current) return;
            const guest = new V86({
                wasm_path: WasmUrl,
                bios: { buffer: bios },
                vga_bios: { buffer: vga },
                hda: { buffer: disk },
                memory_size: 128 * 1024 * 1024,
                vga_memory_size: 4 * 1024 * 1024,
                screen: { container: screen.current },
                disable_speaker: true,
                autostart: false,
                disable_keyboard: true,
                disable_mouse: true,
            });
            vm.current = guest;
            guest.add_listener("emulator-ready", () => {
                if (current !== generation.current) return;
                setPhase("running");
                if (activeRef.current && document.visibilityState !== "hidden") void guest.run();
            });
        } catch (reason) {
            if (current !== generation.current) return;
            setError(reason instanceof Error ? reason.message : String(reason));
            setPhase("idle");
            void vm.current?.destroy();
            vm.current = undefined;
        }
    };
    return (
        <div className="linux-tool-pane linux-desktop">
            {phase === "idle" && (
                <button type="button" onClick={() => void start()}>
                    Start desktop VM
                </button>
            )}
            {phase === "starting" && <p role="status">Loading desktop VM…</p>}
            {error && <p role="alert">{error}</p>}
            <div
                className="linux-desktop-screen"
                ref={screen}
                aria-label="Live Linux desktop display"
                onPointerDown={(event) => {
                    if (!controlEnabled || phase !== "running") return;
                    const canvas = screen.current?.querySelector("canvas");
                    if (!canvas || canvas.style.display === "none") return;
                    const rect = canvas.getBoundingClientRect();
                    const x = Math.max(
                        0,
                        Math.min(canvas.width, ((event.clientX - rect.left) * canvas.width) / rect.width)
                    );
                    const y = Math.max(
                        0,
                        Math.min(canvas.height, ((event.clientY - rect.top) * canvas.height) / rect.height)
                    );
                    const previous = directPointer.current ?? { x: canvas.width / 2, y: canvas.height / 2 };
                    mouse("mouse-delta", [x - previous.x, previous.y - y]);
                    mouse("mouse-absolute", [
                        event.clientX - rect.left,
                        event.clientY - rect.top,
                        rect.width,
                        rect.height,
                    ]);
                    directPointer.current = { x, y };
                    click();
                    keyboard.current?.focus({ preventScroll: true });
                }}
            >
                <div style={{ whiteSpace: "pre", font: "14px monospace", lineHeight: "14px" }} />
                <canvas style={{ display: "none" }} />
            </div>
            {phase === "running" && controlEnabled && (
                <>
                    <div
                        className="linux-trackpad"
                        role="group"
                        aria-label="Desktop touch trackpad"
                        onPointerDown={(event) => {
                            dragged.current = false;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            pointer.current = { x: event.clientX, y: event.clientY };
                        }}
                        onPointerMove={(event) => {
                            if (!pointer.current) return;
                            if (
                                Math.abs(event.clientX - pointer.current.x) +
                                    Math.abs(event.clientY - pointer.current.y) >
                                2
                            )
                                dragged.current = true;
                            mouse("mouse-delta", [
                                (event.clientX - pointer.current.x) * 3,
                                -(event.clientY - pointer.current.y) * 3,
                            ]);
                            pointer.current = { x: event.clientX, y: event.clientY };
                        }}
                        onPointerUp={() => {
                            pointer.current = undefined;
                        }}
                        onClick={() => {
                            if (dragged.current) return;
                            const now = Date.now();
                            if (now - lastTap.current < 320) {
                                clearTimeout(clickTimer.current);
                                click(true);
                                lastTap.current = 0;
                            } else {
                                lastTap.current = now;
                                clickTimer.current = setTimeout(() => click(), 320);
                            }
                        }}
                        onPointerCancel={() => {
                            pointer.current = undefined;
                        }}
                    >
                        Drag · tap to click · double-tap for right-click
                    </div>
                    <div className="linux-tool-buttons" onPointerDown={(event) => event.preventDefault()}>
                        <button type="button" onClick={() => click()}>
                            Click
                        </button>
                        <button type="button" onClick={() => click(true)}>
                            Right click
                        </button>
                    </div>
                    <textarea
                        ref={keyboard}
                        className="desktop-keyboard-bridge"
                        aria-label="Desktop input bridge"
                        defaultValue=" "
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={(event) => {
                            if ((event.nativeEvent as InputEvent).isComposing) return;
                            const value = event.currentTarget.value;
                            if (!value) void vm.current?.keyboard_send_scancodes([0x0e, 0x8e]);
                            else void vm.current?.keyboard_send_text(value.startsWith(" ") ? value.slice(1) : value);
                            event.currentTarget.value = " ";
                        }}
                        onKeyDown={(event) => {
                            const codes: Record<string, number[]> = {
                                Enter: [0x1c, 0x9c],
                                Backspace: [0x0e, 0x8e],
                                Tab: [0x0f, 0x8f],
                                Escape: [0x01, 0x81],
                                ArrowUp: [0xe0, 0x48, 0xe0, 0xc8],
                                ArrowDown: [0xe0, 0x50, 0xe0, 0xd0],
                            };
                            if (codes[event.key]) {
                                event.preventDefault();
                                void vm.current?.keyboard_send_scancodes(codes[event.key]);
                            }
                        }}
                    />
                    <div className="linux-tool-buttons" onPointerDown={(event) => event.preventDefault()}>
                        <button type="button" onClick={() => keyboard.current?.focus({ preventScroll: true })}>
                            Keyboard
                        </button>
                        <button type="button" onClick={() => vm.current?.keyboard_send_scancodes([0x1c, 0x9c])}>
                            Enter
                        </button>
                        <button type="button" onClick={() => vm.current?.keyboard_send_scancodes([0x0f, 0x8f])}>
                            Tab
                        </button>
                        <button type="button" onClick={() => vm.current?.keyboard_send_scancodes([0x01, 0x81])}>
                            Esc
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
