// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { tapflowOrigin, TapflowPages, tapflowSessionUrl } from "@/app/plugins/tapflow/routes";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { createBlock, WOS } from "@/store/global";
import { mainComposerScope } from "@hermes/store/composer";
import { useAtomValue } from "jotai";
import { useState } from "react";
import type { TapflowModel } from "./tapflow-model";

type Device = { name: string; url: string; platform: "ios" | "android" };
const Control =
    "cursor-pointer rounded border border-white/15 px-3 py-2 text-left hover:bg-white/10 focus-visible:outline focus-visible:outline-2";
const Input = "w-full rounded border border-white/20 bg-transparent px-3 py-2";

export function TapflowWidget({ blockId }: ViewComponentProps<TapflowModel>) {
    const block = useAtomValue(WOS.getWaveObjectAtom<Block>(`block:${blockId}`));
    const saved = block?.meta as Record<string, any>;
    const [relay, setRelay] = useState(saved?.["tapflow:relay"] ?? "http://localhost:4000");
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [platform, setPlatform] = useState<"ios" | "android">("ios");
    const [selected, setSelected] = useState<string[]>([]);
    const [task, setTask] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const devices: Device[] = saved?.["tapflow:devices"] ?? [];
    const farm = saved?.["tapflow:farm"] === true;
    const run = async (action: () => Promise<unknown>) => {
        setError("");
        setBusy(true);
        try {
            await action();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusy(false);
        }
    };
    const save = (meta: Record<string, unknown>) =>
        RpcApi.SetMetaCommand(TabRpcClient, {
            oref: `block:${blockId}`,
            meta: meta as MetaType,
        });
    const open = (title: string, target: string) =>
        createBlock({
            meta: {
                view: "web",
                url: target,
                "frame:title": `Tapflow · ${title}`,
            },
        });
    return (
        <section
            className="flex h-full flex-col gap-4 overflow-auto bg-(--main-bg-color) p-4 text-[13px]"
            aria-label="Tapflow Mobile Labs"
        >
            <header>
                <h1 className="text-lg font-medium">Tapflow</h1>
                <p className="text-xs opacity-70">Mobile Labs · iPhone and Android widgets</p>
            </header>
            <form
                className="flex gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                        const origin = tapflowOrigin(relay);
                        if (origin !== saved?.["tapflow:relay"] && devices.length)
                            throw new Error("Remove saved sessions before changing relays.");
                        await save({ "tapflow:relay": origin });
                        setRelay(origin);
                    });
                }}
            >
                <label className="flex-1">
                    Relay address
                    <input className={Input} value={relay} onChange={(event) => setRelay(event.target.value)} />
                </label>
                <button className={Control} disabled={busy}>
                    Save
                </button>
            </form>
            <nav className="grid grid-cols-2 gap-2" aria-label="Tapflow pages">
                {Object.entries(TapflowPages).map(([key, page]) => (
                    <button
                        key={key}
                        className={Control}
                        disabled={busy}
                        onClick={() => void run(() => open(page.title, new URL(page.path, tapflowOrigin(relay)).href))}
                    >
                        {page.title}
                    </button>
                ))}
            </nav>
            <p className="text-xs opacity-70">
                Start the local runtime with npm --prefix integrations/tapflow-runtime start. Sign in through App
                Center. Device control uses Tapflow MCP; watch widgets are read-only.
            </p>
            <form
                className="grid gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                        const target = tapflowSessionUrl(relay, url);
                        if (devices.some((device) => device.url === target))
                            throw new Error("This session is already saved.");
                        await save({
                            "tapflow:relay": tapflowOrigin(relay),
                            "tapflow:devices": [...devices, { name: name.trim() || platform, url: target, platform }],
                        });
                        setUrl("");
                        setName("");
                    });
                }}
            >
                <h2 className="font-medium">Device sessions</h2>
                <label>
                    Device name
                    <input className={Input} value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label>
                    Platform
                    <select
                        className={Input}
                        value={platform}
                        onChange={(event) => setPlatform(event.target.value as Device["platform"])}
                    >
                        <option value="ios">iPhone / iPad</option>
                        <option value="android">Android</option>
                    </select>
                </label>
                <label>
                    Session watch URL
                    <input
                        className={Input}
                        value={url}
                        placeholder="Paste watchUrl from connect_device"
                        onChange={(event) => setUrl(event.target.value)}
                        required
                    />
                </label>
                <button className={Control} disabled={busy}>
                    Add session
                </button>
            </form>
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={farm}
                    disabled={busy}
                    onChange={(event) => void run(() => save({ "tapflow:farm": event.target.checked }))}
                />
                Bot farm mode
            </label>
            <ul className="grid gap-2">
                {devices.map((device) => (
                    <li key={device.url} className="flex items-center gap-2 rounded border border-white/15 p-2">
                        {farm && (
                            <input
                                aria-label={`Select ${device.name}`}
                                type="checkbox"
                                checked={selected.includes(device.url)}
                                onChange={(event) =>
                                    setSelected((current) =>
                                        event.target.checked
                                            ? [...current, device.url]
                                            : current.filter((item) => item !== device.url)
                                    )
                                }
                            />
                        )}
                        <span className="flex-1">
                            {device.name} <span className="text-xs opacity-70">{device.platform}</span>
                        </span>
                        <button
                            className={Control}
                            disabled={busy}
                            onClick={() => void run(() => open(device.name, tapflowSessionUrl(relay, device.url)))}
                        >
                            Open widget
                        </button>
                        <button
                            className={Control}
                            disabled={busy}
                            onClick={() =>
                                void run(() =>
                                    save({ "tapflow:devices": devices.filter((item) => item.url !== device.url) })
                                )
                            }
                        >
                            Remove
                        </button>
                    </li>
                ))}
            </ul>
            {farm && (
                <div className="grid gap-2">
                    <h2 className="font-medium">Bot farm task</h2>
                    <textarea
                        className={Input}
                        aria-label="Bot farm task"
                        value={task}
                        onChange={(event) => setTask(event.target.value)}
                        placeholder="Describe the task for the selected devices"
                    />
                    <button
                        className={Control}
                        disabled={!task.trim() || !devices.some((device) => selected.includes(device.url))}
                        onClick={() =>
                            void run(async () => {
                                const targets = devices.filter((device) => selected.includes(device.url));
                                mainComposerScope.add({
                                    id: `tapflow:${blockId}`,
                                    kind: "canvas",
                                    label: "Tapflow bot farm",
                                    detail: "Mobile Labs task",
                                    refText: JSON.stringify({
                                        task,
                                        relay: tapflowOrigin(relay),
                                        devices: targets,
                                        instructions:
                                            "Use Tapflow MCP. Resolve exact device IDs; check capabilities and device ownership before connecting. Do not take over active sessions. Run the requested task on each assigned device and report per-device results. If MCP is unavailable, report blocked; do not claim deployment.",
                                    }),
                                });
                                hermesSurfaceController.requestOpenPanel();
                            })
                        }
                    >
                        Prepare task in Hermes
                    </button>
                    <p className="text-xs opacity-70">
                        Adds the task and selected targets to chat. Submit in Hermes after connecting Tapflow MCP; no
                        devices are deployed by this button.
                    </p>
                </div>
            )}
            {error && (
                <p role="alert" className="text-red-400">
                    {error}
                </p>
            )}
        </section>
    );
}
