// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { atom, useAtomValue, type PrimitiveAtom } from "jotai";
import { Box, Gamepad2, RotateCcw, Scan, View } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./floating-island.css";
import {
    IslandDepots,
    IslandFlightKeys,
    newIslandFlight,
    stepIslandFlight,
    type FlightDirection,
    type IslandFlightMode,
    type IslandWind,
} from "./island-flight";
import gameControlsStyles from "./island-game-controls.css?inline";
import {
    DefaultIslandWind,
    isIslandWind,
    islandReplayDuration,
    MaxIslandReplaySteps,
    readIslandReplay,
    replayIslandFlight,
    WestLandingReplay,
    type IslandReplay,
    type IslandReplayStep,
} from "./island-replay";
import { disposeIsland, makeIslandScene } from "./island-scene";

export const FloatingIslandView = "floating-island";
export const FloatingIslandTitle = "Floating Island";
type CameraPreset = "orbit" | "top";

export const floatingIslandModels = atom(new Map<string, FloatingIslandModel>());

export class FloatingIslandModel implements ViewModel {
    viewType = FloatingIslandView;
    viewName = atom(FloatingIslandTitle);
    viewIcon = atom("gamepad");
    noPadding = atom(true);
    noHeader = atom(true);
    mode = atom<IslandFlightMode>("ready");
    deliveries = atom(0);
    wind = atom(DefaultIslandWind);
    windsockSelected = atom(false);
    savedReplay = atom(WestLandingReplay);
    recording = atom(false);
    replayTime = atom(undefined) as PrimitiveAtom<number | undefined>;
    replayPlaying = atom(false);
    compare = atom(false);
    flight = newIslandFlight();
    baselineFlight = newIslandFlight();
    recordedSteps: IslandReplayStep[] = [];
    recordingWind = DefaultIslandWind;
    camera = atom({ preset: "orbit" as CameraPreset });
    keys = new Map<string, FlightDirection>();
    draw: () => void;
    gameElement: HTMLCanvasElement;
    blockId: string;

    constructor({ blockId }: ViewModelInitType) {
        this.blockId = blockId;
        try {
            const saved = readIslandReplay(localStorage.getItem(`kronos:island:replay:${blockId}`));
            if (saved) globalStore.set(this.savedReplay, saved);
            const wind = JSON.parse(localStorage.getItem(`kronos:island:wind:${blockId}`) ?? "null") as IslandWind;
            if (isIslandWind(wind)) globalStore.set(this.wind, wind);
        } catch {
            // The current session can still record and replay when storage is unavailable.
        }
    }

    get viewComponent(): ViewComponent {
        return FloatingIsland;
    }

    pause() {
        if (globalStore.get(this.mode) === "playing") globalStore.set(this.mode, "paused");
        this.keys.clear();
    }

    play() {
        if (globalStore.get(this.replayTime) != null) {
            this.takeOver();
            return;
        }
        if (globalStore.get(this.mode) === "complete") this.reset();
        globalStore.set(this.mode, "playing");
        this.gameElement?.focus({ preventScroll: true });
    }

    reset() {
        globalStore.set(this.recording, false);
        this.leaveReplay();
        this.flight = newIslandFlight();
        this.keys.clear();
        globalStore.set(this.deliveries, 0);
        globalStore.set(this.mode, "ready");
        this.draw?.();
    }

    move(directions: ReadonlySet<FlightDirection>, seconds: number) {
        if (globalStore.get(this.mode) !== "playing") return;
        const delivered = this.flight.delivered;
        stepIslandFlight(this.flight, directions, seconds, globalStore.get(this.wind));
        if (globalStore.get(this.recording)) {
            this.recordedSteps.push({ directions: [...directions], seconds });
            if (this.recordedSteps.length >= MaxIslandReplaySteps) this.saveRecording();
        }
        if (delivered !== this.flight.delivered) {
            globalStore.set(this.deliveries, this.flight.delivered);
            if (this.flight.delivered === IslandDepots.length) {
                globalStore.set(this.mode, "complete");
                this.keys.clear();
            }
        }
        this.draw?.();
    }

    startRecording() {
        this.reset();
        this.recordedSteps = [];
        this.recordingWind = globalStore.get(this.wind);
        globalStore.set(this.recording, true);
        this.play();
    }

    saveRecording() {
        globalStore.set(this.recording, false);
        if (!this.recordedSteps.length) return;
        const replay: IslandReplay = { steps: this.recordedSteps, wind: this.recordingWind };
        globalStore.set(this.savedReplay, replay);
        try {
            localStorage.setItem(`kronos:island:replay:${this.blockId}`, JSON.stringify(replay));
        } catch {
            // The recording remains available for the current session.
        }
    }

    leaveReplay() {
        globalStore.set(this.replayPlaying, false);
        globalStore.set(this.replayTime, undefined);
        globalStore.set(this.compare, false);
    }

    takeOver() {
        this.leaveReplay();
        globalStore.set(this.mode, this.flight.delivered < IslandDepots.length ? "playing" : "complete");
        this.gameElement?.focus({ preventScroll: true });
    }

    seekReplay(seconds: number) {
        if (globalStore.get(this.replayTime) == null) {
            this.pause();
            if (globalStore.get(this.recording)) this.saveRecording();
        }
        const replay = globalStore.get(this.savedReplay);
        const duration = islandReplayDuration(replay);
        const time = Math.max(0, Math.min(seconds, duration));
        this.flight = replayIslandFlight(replay, time, globalStore.get(this.wind));
        this.baselineFlight = replayIslandFlight(replay, time, replay.wind);
        globalStore.set(this.deliveries, this.flight.delivered);
        globalStore.set(this.mode, "paused");
        globalStore.set(this.replayTime, time);
        if (time >= duration) globalStore.set(this.replayPlaying, false);
        this.draw?.();
    }

    updateWind(wind: IslandWind) {
        globalStore.set(this.wind, wind);
        try {
            localStorage.setItem(`kronos:island:wind:${this.blockId}`, JSON.stringify(wind));
        } catch {
            // Scene edits remain available for the current session.
        }
        const time = globalStore.get(this.replayTime);
        if (time != null) this.seekReplay(time);
        this.draw?.();
    }

    dispose() {
        globalStore.set(floatingIslandModels, (current) => {
            if (current.get(this.blockId) !== this) return current;
            const next = new Map(current);
            next.delete(this.blockId);
            return next;
        });
    }
}

function IslandViewport({ model, playable }: { model: FloatingIslandModel; playable: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pick = useRef<(x: number, y: number) => void>(null);
    const pointerStart = useRef<{ id: number; x: number; y: number }>(null);
    const [failed, setFailed] = useState(false);
    const compare = useAtomValue(model.compare);
    useEffect(() => {
        const canvas = canvasRef.current;
        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        } catch {
            setFailed(true);
            return;
        }

        const { scene, ship, beacons, windsock, fabric, selection } = makeIslandScene(playable);
        renderer.setClearColor(0, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
        const orbit = playable ? null : new OrbitControls(camera, canvas);
        const draw = () => {
            if (!canvas.clientWidth || !canvas.clientHeight) return;
            const comparing = globalStore.get(model.compare);
            const baseline = !playable && comparing;
            const wind = baseline ? globalStore.get(model.savedReplay).wind : globalStore.get(model.wind);
            windsock.position.set(wind.x, 0, wind.z);
            fabric.rotation.z = -0.65 * (1 - wind.strength / 1.5);
            selection.visible = !playable && !comparing && globalStore.get(model.windsockSelected);
            ship.visible = playable || baseline;
            if (ship.visible) {
                const { x, z, heading, delivered } = baseline ? model.baselineFlight : model.flight;
                ship.position.set(x, 0.68, z);
                ship.rotation.y = heading;
                beacons.forEach((beacon, index) => (beacon.visible = index === delivered));
            } else {
                beacons.forEach((beacon) => (beacon.visible = false));
            }
            renderer.render(scene, camera);
        };
        const pointCamera = () => {
            const gameCamera = playable || globalStore.get(model.compare);
            const top = !gameCamera && globalStore.get(model.camera).preset === "top";
            if (top) camera.position.set(0, 19, 0.01);
            else if (gameCamera) camera.position.set(0, 14.5, 10.5);
            else camera.position.set(9, 7, 12);
            const target = new THREE.Vector3(0, top || gameCamera ? -0.15 : -1.15, 0);
            camera.zoom = 1;
            camera.updateProjectionMatrix();
            if (orbit) {
                orbit.enabled = !gameCamera;
                orbit.target.copy(target);
                orbit.update();
            } else {
                camera.lookAt(target);
            }
            draw();
        };
        if (orbit) {
            orbit.enablePan = false;
            orbit.minZoom = 0.65;
            orbit.maxZoom = 2;
            orbit.addEventListener("change", draw);
            const ray = new THREE.Raycaster();
            pick.current = (x, y) => {
                if (globalStore.get(model.compare)) return;
                const rect = canvas.getBoundingClientRect();
                ray.setFromCamera(
                    new THREE.Vector2((2 * (x - rect.left)) / rect.width - 1, 1 - (2 * (y - rect.top)) / rect.height),
                    camera
                );
                const hit = ray.intersectObjects(scene.children, true)[0]?.object;
                const selected = hit === windsock || hit?.parent === windsock || hit?.parent?.parent === windsock;
                globalStore.set(model.windsockSelected, selected);
            };
        }
        const resize = () => {
            const { clientWidth: width, clientHeight: height } = canvas;
            if (!width || !height) return;
            const aspect = width / height;
            const halfHeight = Math.max(6.4, 7.3 / aspect);
            camera.left = -halfHeight * aspect;
            camera.right = halfHeight * aspect;
            camera.top = halfHeight;
            camera.bottom = -halfHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
            draw();
        };
        pointCamera();
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        const unsubscribe = playable ? undefined : globalStore.sub(model.camera, pointCamera);
        const offWind = globalStore.sub(model.wind, draw);
        let frame = 0;
        let last = 0;
        const tick = (now: number) => {
            const seconds = Math.min(0.05, (now - last) / 1000);
            if (last && globalStore.get(model.replayPlaying)) {
                model.seekReplay(globalStore.get(model.replayTime) + seconds);
            } else if (last && model.keys.size) {
                model.move(new Set(model.keys.values()), seconds);
            }
            last = now;
            frame = requestAnimationFrame(tick);
        };
        if (playable) {
            model.gameElement = canvas;
            model.draw = draw;
            const blur = () => model.keys.clear();
            window.addEventListener("blur", blur);
            frame = requestAnimationFrame(tick);
            return () => {
                window.removeEventListener("blur", blur);
                cancelAnimationFrame(frame);
                model.pause();
                globalStore.set(model.replayPlaying, false);
                model.draw = undefined;
                model.gameElement = undefined;
                offWind();
                observer.disconnect();
                disposeIsland(scene);
                renderer.dispose();
            };
        }
        const offCompare = globalStore.sub(model.compare, pointCamera);
        const offReplay = globalStore.sub(model.replayTime, draw);
        const offSelection = globalStore.sub(model.windsockSelected, draw);
        return () => {
            unsubscribe?.();
            offWind();
            offCompare();
            offReplay();
            offSelection();
            pick.current = null;
            observer.disconnect();
            orbit?.dispose();
            disposeIsland(scene);
            renderer.dispose();
        };
    }, [model, playable]);

    const keyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.code === "Space") {
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) return;
            if (globalStore.get(model.mode) === "playing") model.pause();
            else model.play();
            return;
        }
        if (Object.hasOwn(IslandFlightKeys, event.code)) {
            event.preventDefault();
            event.stopPropagation();
            model.keys.set(event.code, IslandFlightKeys[event.code as keyof typeof IslandFlightKeys]);
        }
    };

    const selectOnClick = (event: PointerEvent<HTMLCanvasElement>) => {
        const start = pointerStart.current;
        pointerStart.current = null;
        if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 4)
            pick.current?.(event.clientX, event.clientY);
    };

    return (
        <section className="floating-island-viewport" aria-label={playable ? "Island Courier" : "Island model"}>
            <h2>
                {compare
                    ? playable
                        ? "Current replay"
                        : "Saved replay"
                    : playable
                      ? "Island Courier"
                      : "Island model"}
            </h2>
            {failed && <p role="status">WebGL is unavailable.</p>}
            <canvas
                ref={canvasRef}
                hidden={failed}
                tabIndex={playable ? 0 : undefined}
                aria-label={playable ? "Island Courier playfield" : "Interactive 3D model of the island"}
                onKeyDown={playable ? keyDown : undefined}
                onKeyUp={playable ? (event) => model.keys.delete(event.code) : undefined}
                onBlur={playable ? () => model.keys.clear() : undefined}
                onPointerDown={
                    playable
                        ? undefined
                        : (event) => {
                              if (event.button === 0)
                                  pointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
                          }
                }
                onPointerUp={playable ? undefined : selectOnClick}
                onPointerCancel={playable ? undefined : () => (pointerStart.current = null)}
            />
        </section>
    );
}

export function FloatingIsland({ model }: { model: FloatingIslandModel }) {
    useEffect(() => {
        globalStore.set(floatingIslandModels, (current) => new Map(current).set(model.blockId, model));
        return () => model.dispose();
    }, [model]);
    return (
        <div className="floating-island">
            <IslandViewport model={model} playable={false} />
            <IslandViewport model={model} playable />
        </div>
    );
}

export function IslandModelTools({ model }: { model?: FloatingIslandModel }) {
    const camera = useAtomValue(model?.camera ?? DefaultCameraAtom);
    if (!model) return null;
    return (
        <div data-island-model-tools="" role="toolbar" aria-label="Island model controls">
            <button
                type="button"
                aria-label="Top view"
                title="Top view"
                aria-pressed={camera.preset === "top"}
                onClick={() => globalStore.set(model.camera, { preset: "top" })}
            >
                <Scan size={16} aria-hidden="true" />
            </button>
            <button
                type="button"
                aria-label="Reset model camera"
                title="Reset model camera"
                onClick={() => globalStore.set(model.camera, { preset: "orbit" })}
            >
                <View size={16} aria-hidden="true" />
            </button>
        </div>
    );
}

const DefaultCameraAtom = atom({ preset: "orbit" as CameraPreset });

export function IslandLauncher({ busy, onOpen }: { busy: boolean; onOpen: () => void }) {
    return (
        <button
            type="button"
            data-island-launcher=""
            aria-label="Open Floating Island"
            title="Open Floating Island"
            disabled={busy}
            onClick={onOpen}
        >
            <Box size={16} aria-hidden="true" />
        </button>
    );
}

const DirectionButtons = [
    ["west", "←"],
    ["north", "↑"],
    ["south", "↓"],
    ["east", "→"],
] as const;

export function IslandGameControls({ model }: { model: FloatingIslandModel }) {
    const mode = useAtomValue(model.mode);
    const deliveries = useAtomValue(model.deliveries);
    const selected = useAtomValue(model.windsockSelected);
    const wind = useAtomValue(model.wind);
    const recording = useAtomValue(model.recording);
    const saved = useAtomValue(model.savedReplay);
    const replayTime = useAtomValue(model.replayTime);
    const replayPlaying = useAtomValue(model.replayPlaying);
    const compare = useAtomValue(model.compare);
    const duration = islandReplayDuration(saved);
    const target = IslandDepots[deliveries];
    return (
        <section data-island-game-controls="" aria-label="Island Courier controls">
            <style>{gameControlsStyles}</style>
            <h2>
                <Gamepad2 size={14} aria-hidden="true" /> Island Courier
            </h2>
            <p role="status">
                {target
                    ? `${deliveries} of ${IslandDepots.length} delivered · Next: ${target.name}`
                    : "All 3 deliveries complete."}
            </p>
            <div>
                <button
                    type="button"
                    onClick={() => (mode === "playing" ? model.pause() : model.play())}
                    disabled={replayTime != null && deliveries === IslandDepots.length}
                >
                    {replayTime != null
                        ? "Take over"
                        : mode === "playing"
                          ? "Pause"
                          : mode === "paused"
                            ? "Resume"
                            : mode === "complete"
                              ? "Play again"
                              : "Play"}
                </button>
                <button type="button" onClick={() => model.reset()} aria-label="Reset flight" title="Reset flight">
                    <RotateCcw size={14} aria-hidden="true" />
                </button>
            </div>
            <div role="group" aria-label="Steer the courier">
                {DirectionButtons.map(([direction, arrow]) => (
                    <button
                        type="button"
                        key={direction}
                        disabled={mode !== "playing"}
                        aria-label={`Fly ${direction}`}
                        onClick={() => model.move(new Set([direction]), 0.125)}
                    >
                        {arrow}
                    </button>
                ))}
            </div>
            <p>WASD or arrows to fly. Space to pause.</p>
            <h2>Playtest</h2>
            <div>
                <button type="button" onClick={() => (recording ? model.saveRecording() : model.startRecording())}>
                    {recording ? "Save route" : "Record route"}
                </button>
                <button
                    type="button"
                    disabled={recording}
                    onClick={() => {
                        if (replayPlaying) {
                            globalStore.set(model.replayPlaying, false);
                            return;
                        }
                        if (replayTime == null || replayTime >= duration) model.seekReplay(0);
                        globalStore.set(model.replayPlaying, true);
                    }}
                >
                    {replayPlaying
                        ? "Pause replay"
                        : replayTime != null && replayTime < duration
                          ? "Resume replay"
                          : "Replay route"}
                </button>
            </div>
            {replayTime != null && (
                <>
                    <label>
                        Replay position{" "}
                        <span aria-hidden="true">
                            {replayTime.toFixed(1)} / {duration.toFixed(1)} s
                        </span>
                        <input
                            type="range"
                            min={0}
                            max={duration}
                            step={0.01}
                            value={replayTime}
                            onChange={(event) => {
                                globalStore.set(model.replayPlaying, false);
                                model.seekReplay(event.currentTarget.valueAsNumber);
                            }}
                        />
                    </label>
                    <button
                        type="button"
                        aria-pressed={compare}
                        onClick={() => globalStore.set(model.compare, !compare)}
                    >
                        Compare with saved run
                    </button>
                    {compare && (
                        <p>
                            Saved run delivered {model.baselineFlight.delivered} of {IslandDepots.length}.
                        </p>
                    )}
                </>
            )}
            <h2>Scene</h2>
            <button
                type="button"
                aria-pressed={selected}
                onClick={() => globalStore.set(model.windsockSelected, !selected)}
            >
                West Landing windsock
            </button>
            {selected && (
                <fieldset disabled={recording}>
                    {(
                        [
                            ["x", "East / west", -5, 5],
                            ["z", "South / north", -5, 5],
                            ["strength", "Wind strength", 0, 1.5],
                        ] as const
                    ).map(([key, label, min, max]) => (
                        <label key={key}>
                            {label} <span aria-hidden="true">{wind[key].toFixed(1)}</span>
                            <input
                                type="range"
                                min={min}
                                max={max}
                                step={0.05}
                                value={wind[key]}
                                onChange={(event) =>
                                    model.updateWind({ ...wind, [key]: event.currentTarget.valueAsNumber })
                                }
                            />
                        </label>
                    ))}
                </fieldset>
            )}
        </section>
    );
}
