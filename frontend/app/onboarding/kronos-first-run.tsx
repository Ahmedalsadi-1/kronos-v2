// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import Logo from "@/app/asset/logo.svg";
import { Button } from "@/app/element/button";
import { ClientModel } from "@/app/store/client-model";
import { modalsModel } from "@/app/store/modalmodel";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { BrowserMigrationDialog } from "@/app/view/webview/browser-migration-dialog";
import { getApi, WOS } from "@/store/global";
import { ClientService } from "@/store/services";
import { DefaultComfyOrigin } from "@/types/comfyui";
import { useSetAtom } from "jotai";
import { Check, Image, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { CurrentOnboardingVersion } from "./onboarding-common";

type ServiceStatus = "starting" | "ready" | "elsewhere" | "setup";

const ServiceLabels: Record<ServiceStatus, string> = {
    starting: "Connecting…",
    ready: "Ready",
    elsewhere: "Connected in another tab",
    setup: "Setup needed",
};

function workflowCommand<T>(operation: string) {
    return getApi().hermesApi<T>({
        path: "/api/kronterm/n8n/command",
        method: "POST",
        body: { operation },
        timeoutMs: 100000,
    });
}

async function startKronFlow(): Promise<ServiceStatus> {
    const status = await workflowCommand<{ running: boolean; occupied?: boolean }>("runtime-status");
    if (status.occupied) return "elsewhere";
    if (!status.running) await workflowCommand("account");
    return "ready";
}

async function startKronRender(): Promise<ServiceStatus> {
    await getApi().comfyUiRequest({ action: "connect", origin: DefaultComfyOrigin });
    return "ready";
}

function ServiceRow({
    title,
    detail,
    icon: Icon,
    start,
}: {
    title: string;
    detail: string;
    icon: typeof Image;
    start(): Promise<ServiceStatus>;
}) {
    const [status, setStatus] = useState<ServiceStatus>("starting");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let current = true;
        setStatus("starting");
        void start().then(
            (result) => {
                if (current) setStatus(result);
            },
            () => {
                if (current) setStatus("setup");
            }
        );
        return () => {
            current = false;
        };
    }, [attempt, start]);
    return (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border px-3 py-3">
            <Icon size={18} aria-hidden="true" />
            <div className="min-w-0">
                <p className="font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{detail}</p>
            </div>
            {status === "setup" ? (
                <button
                    type="button"
                    className="cursor-pointer rounded-md px-2 py-1 text-xs underline focus-visible:outline-2"
                    onClick={() => setAttempt((value) => value + 1)}
                >
                    Retry setup
                </button>
            ) : (
                <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
                    {status === "ready" && <Check size={13} aria-hidden="true" />}
                    {ServiceLabels[status]}
                </span>
            )}
        </div>
    );
}

export function KronOSFirstRun({ alreadyAccepted }: { alreadyAccepted: boolean }) {
    const close = useSetAtom(modalsModel.newInstallOnboardingOpen);
    const [step, setStep] = useState<"welcome" | "services">(alreadyAccepted ? "services" : "welcome");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [browserSetupOpen, setBrowserSetupOpen] = useState(false);

    const advance = async () => {
        setBusy(true);
        setError("");
        try {
            if (step === "welcome") {
                if (!alreadyAccepted) await ClientService.AgreeTos();
                setStep("services");
            } else {
                await RpcApi.SetMetaCommand(TabRpcClient, {
                    oref: WOS.makeORef("client", ClientModel.getInstance().clientId),
                    meta: { "onboarding:lastversion": CurrentOnboardingVersion },
                });
                close(false);
            }
        } catch {
            setError(
                step === "welcome" ? "Could not save your setup. Try again." : "Could not finish setup. Try again."
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-5 py-6 text-foreground sm:px-7">
            <header className="flex flex-col items-start gap-2">
                <Logo aria-hidden="true" />
                <h1 className="text-2xl font-semibold">
                    {step === "welcome" ? "Welcome to KronOS" : "Workspace services"}
                </h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    {step === "welcome"
                        ? "Work with your files, apps, and agent in one workspace. Drag files onto the canvas to preview them where you work."
                        : "KronOS connects these local services in the background. You can open your workspace while they start."}
                </p>
            </header>
            {step === "services" && (
                <div className="flex flex-col gap-2">
                    <ServiceRow
                        title="KronFlow"
                        detail="Build and run workspace workflows."
                        icon={Workflow}
                        start={startKronFlow}
                    />
                    <ServiceRow
                        title="KronRender"
                        detail="Generate and preview media on the canvas."
                        icon={Image}
                        start={startKronRender}
                    />
                </div>
            )}
            {error && (
                <p role="alert" className="text-sm text-red-400">
                    {error}
                </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                {step === "services" && (
                    <Button className="outlined" disabled={busy} onClick={() => setBrowserSetupOpen(true)}>
                        Browser import and passwords
                    </Button>
                )}
                <Button disabled={busy} onClick={() => void advance()}>
                    {step === "welcome" ? "Continue" : "Open workspace"}
                </Button>
            </div>
            {browserSetupOpen && (
                <BrowserMigrationDialog api={getApi()} onClose={() => setBrowserSetupOpen(false)} />
            )}
        </div>
    );
}
