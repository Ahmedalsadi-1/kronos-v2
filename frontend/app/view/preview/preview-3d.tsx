// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Button } from "@/app/element/button";
import type { ModelPreviewFormat } from "@/util/model-preview";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
    Box3,
    DirectionalLight,
    Group,
    HemisphereLight,
    PerspectiveCamera,
    Scene,
    Sphere,
    Vector3,
    WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadPreviewModel } from "./preview-3d-loader";

const HomeDirection = new Vector3(1, 0.65, 1).normalize();
const OrbitStep = Math.PI / 12;
const DollyScale = 0.8;

type ViewControls = {
    orbit: OrbitControls;
    reset: () => void;
};

function onModelKeyDown(event: KeyboardEvent<HTMLCanvasElement>, view: ViewControls) {
    if (!view || event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
        case "ArrowLeft":
            view.orbit.rotateLeft(OrbitStep);
            break;
        case "ArrowRight":
            view.orbit.rotateLeft(-OrbitStep);
            break;
        case "ArrowUp":
            view.orbit.rotateUp(OrbitStep);
            break;
        case "ArrowDown":
            view.orbit.rotateUp(-OrbitStep);
            break;
        case "+":
        case "=":
            view.orbit.dollyIn(DollyScale);
            break;
        case "-":
            view.orbit.dollyOut(DollyScale);
            break;
        case "0":
            view.reset();
            break;
        default:
            return;
    }
    event.preventDefault();
    event.stopPropagation();
}

export function ModelPreview({
    url,
    format,
    size,
    name,
}: {
    url: string;
    format: ModelPreviewFormat;
    size: number;
    name: string;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const controlsRef = useRef<ViewControls>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        const canvas = canvasRef.current;
        const viewport = canvas.parentElement;
        const controller = new AbortController();
        let disposeAsset: () => void;
        let renderer: WebGLRenderer;
        let observer: ResizeObserver;
        let orbit: OrbitControls;
        let graphicsLost = false;

        const reportError = (message: string) => {
            setErrorMessage(message);
            setStatus("error");
        };
        const handleContextLost = () => {
            graphicsLost = true;
            controller.abort();
            reportError("The graphics context was lost. Refresh the file to reopen the 3D preview.");
        };
        canvas.addEventListener("webglcontextlost", handleContextLost);

        void (async () => {
            try {
                const { model, dispose } = await loadPreviewModel(url, format, size, controller.signal);
                if (controller.signal.aborted) {
                    dispose();
                    return;
                }
                disposeAsset = dispose;
                const sphere = new Box3().setFromObject(model).getBoundingSphere(new Sphere());
                if (!(sphere.radius > 0) || !Number.isFinite(sphere.radius)) {
                    throw new Error("This file has no visible 3D geometry.");
                }

                try {
                    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
                } catch {
                    throw new Error("3D preview needs a working WebGL 2 graphics context.");
                }
                const scene = new Scene();
                const frame = new Group();
                frame.add(model);
                frame.scale.setScalar(1 / sphere.radius);
                frame.position.copy(sphere.center).multiplyScalar(-1 / sphere.radius);
                scene.add(frame, new HemisphereLight(0xffffff, 0x8096b0, 2.3));
                const light = new DirectionalLight(0xfff4df, 2.4);
                light.position.set(2, 4, 3);
                scene.add(light);

                const camera = new PerspectiveCamera(42, 1, 0.01, 1000);
                orbit = new OrbitControls(camera, canvas);
                orbit.enablePan = false;
                orbit.minDistance = 0.1;
                const render = () => {
                    if (!graphicsLost) renderer.render(scene, camera);
                };
                orbit.addEventListener("change", render);

                let fitDistance = 0;
                const reset = () => {
                    camera.position.copy(HomeDirection).multiplyScalar(fitDistance);
                    orbit.update();
                };
                const resize = () => {
                    const { clientWidth: width, clientHeight: height } = viewport;
                    if (!width || !height) return;
                    camera.aspect = width / height;
                    camera.updateProjectionMatrix();
                    const halfFov = (camera.fov * Math.PI) / 360;
                    const tightHalfFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect));
                    const nextFit = 1.12 / Math.sin(tightHalfFov);
                    orbit.maxDistance = nextFit * 8;
                    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                    renderer.setSize(width, height, false);
                    if (fitDistance === 0) {
                        fitDistance = nextFit;
                        reset();
                    } else {
                        camera.position.multiplyScalar(nextFit / fitDistance);
                        fitDistance = nextFit;
                        orbit.update();
                    }
                    render();
                };
                resize();
                observer = new ResizeObserver(resize);
                observer.observe(viewport);
                controlsRef.current = { orbit, reset };
                if (!graphicsLost) setStatus("ready");
            } catch (error) {
                if (!controller.signal.aborted) {
                    reportError(error instanceof Error ? error.message : "KronOS could not preview this model.");
                }
            }
        })();

        return () => {
            controller.abort();
            controlsRef.current = null;
            canvas.removeEventListener("webglcontextlost", handleContextLost);
            observer?.disconnect();
            orbit?.dispose();
            disposeAsset?.();
            renderer?.dispose();
            renderer?.forceContextLoss();
        };
    }, [url, format, size]);

    const ready = status === "ready";
    return (
        <div className="relative size-full min-h-0 overflow-hidden bg-black/10">
            <canvas
                ref={canvasRef}
                tabIndex={ready ? 0 : -1}
                aria-hidden={!ready}
                aria-label={`${name ?? "3D model"}. Arrow keys rotate, plus and minus zoom, zero resets the view.`}
                className="block size-full touch-none cursor-grab focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:cursor-grabbing"
                onKeyDown={(event) => onModelKeyDown(event, controlsRef.current)}
                onWheel={(event) => event.stopPropagation()}
            />
            {!ready && (
                <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm">
                    <p role={status === "error" ? "alert" : "status"}>
                        {status === "error" ? errorMessage : "Loading 3D preview…"}
                    </p>
                </div>
            )}
            {ready && (
                <div aria-label="3D preview controls" role="group" className="absolute top-2 right-2 flex gap-1">
                    <Button
                        variant="secondary"
                        type="button"
                        aria-label="Zoom out"
                        title="Zoom out"
                        className="cursor-pointer px-2 py-1"
                        onClick={() => controlsRef.current?.orbit.dollyOut(DollyScale)}
                    >
                        <Minus size={14} aria-hidden />
                    </Button>
                    <Button
                        variant="secondary"
                        type="button"
                        aria-label="Zoom in"
                        title="Zoom in"
                        className="cursor-pointer px-2 py-1"
                        onClick={() => controlsRef.current?.orbit.dollyIn(DollyScale)}
                    >
                        <Plus size={14} aria-hidden />
                    </Button>
                    <Button
                        variant="secondary"
                        type="button"
                        aria-label="Reset view"
                        title="Reset view"
                        className="cursor-pointer px-2 py-1"
                        onClick={() => controlsRef.current?.reset()}
                    >
                        <RotateCcw size={14} aria-hidden />
                    </Button>
                </div>
            )}
        </div>
    );
}
