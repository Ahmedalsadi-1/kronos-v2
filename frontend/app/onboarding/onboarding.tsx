// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import Logo from "@/app/asset/logo.svg";
import { Button } from "@/app/element/button";
import { FlexiModal } from "@/app/modals/modal";
import { OnboardingGradientBg } from "@/app/onboarding/onboarding-common";
import { ClientModel } from "@/app/store/client-model";
import { disableGlobalKeybindings, enableGlobalKeybindings } from "@/app/store/keymodel";
import * as WOS from "@/app/store/wos";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import * as services from "@/store/services";
import { fireAndForget } from "@/util/util";
import { atom, PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { useEffect } from "react";
import { KronOSFirstRun } from "./kronos-first-run";

// Page flow:
//   init -> (telemetry enabled) -> features
//   init -> (telemetry disabled) -> notelemetrystar -> features

type PageName = "init" | "notelemetrystar" | "features";

const pageNameAtom: PrimitiveAtom<PageName> = atom<PageName>("init");

const InitPage = ({
    isCompact,
}: {
    isCompact: boolean;
    telemetryUpdateFn: (value: boolean) => Promise<void>;
}) => {
    const clientData = useAtomValue(ClientModel.getInstance().clientAtom);
    const setPageName = useSetAtom(pageNameAtom);

    const handleStarClick = async () => {
        RpcApi.RecordTEventCommand(
            TabRpcClient,
            {
                event: "onboarding:githubstar",
                props: { "onboarding:githubstar": "star", "onboarding:page": "init" },
            },
            { noresponse: true }
        );
        const clientId = ClientModel.getInstance().clientId;
        await RpcApi.SetMetaCommand(TabRpcClient, {
            oref: WOS.makeORef("client", clientId),
            meta: { "onboarding:githubstar": true },
        });
    };

    const acceptTos = () => {
        if (!clientData?.tosagreed) {
            fireAndForget(() => services.ClientService.AgreeTos());
        }
        setPageName("features");
    };

    return (
        <div className="flex flex-col h-full">
            <header
                className={`flex flex-col gap-2 border-b-0 p-0 ${isCompact ? "mt-1 mb-4" : "mb-9"} w-full unselectable flex-shrink-0`}
            >
                <div className={`${isCompact ? "" : "mb-2.5"} flex justify-center`}>
                    <Logo />
                </div>
                <div className="text-center text-[25px] font-normal text-foreground">Welcome to KronOS</div>
            </header>
            <OverlayScrollbarsComponent
                className="flex-1 overflow-y-auto min-h-0"
                options={{ scrollbars: { autoHide: "never" } }}
            >
                <div className="flex flex-col items-start gap-8 w-full mb-5 unselectable">
                    <div className="flex w-full items-center gap-[18px]">
                        <div>
                            <a
                                target="_blank"
                                href="https://github.com/Ahmedalsadi-1/kronos-releases/releases"
                                rel="noopener"
                                className="text-accent"
                                onClick={handleStarClick}
                            >
                                <i className="text-[32px] text-white/50 fa-brands fa-github"></i>
                            </a>
                        </div>
                        <div className="flex flex-col items-start gap-1 flex-1">
                            <div className="text-foreground text-base leading-[18px]">Your apps and agents, together</div>
                            <div className="text-secondary leading-5">
                                Keep terminals, browsers, files, and AI in one persistent workspace. Connect your own
                                model provider or local endpoint. Read setup and update notes in{" "}
                                <a
                                    target="_blank"
                                    href="https://github.com/Ahmedalsadi-1/kronos-releases/releases"
                                    rel="noopener"
                                    className="text-accent"
                                    onClick={handleStarClick}
                                >
                                    KronOS releases
                                </a>
                            </div>
                        </div>
                    </div>
                    <div className="flex w-full items-center gap-[18px]">
                        <div>
                            <a
                                target="_blank"
                                href="https://github.com/Ahmedalsadi-1/kronos-releases/issues"
                                rel="noopener"
                                className="text-accent"
                            >
                                <i className="text-[25px] text-white/50 fa-solid fa-people-group"></i>
                            </a>
                        </div>
                        <div className="flex flex-col items-start gap-1 flex-1">
                            <div className="text-foreground text-base leading-[18px]">Get help when you need it</div>
                            <div className="text-secondary leading-5">
                                Preview local diagnostics in Settings and share reproducible steps with the team.
                                <br />
                                <a
                                    target="_blank"
                                    href="https://github.com/Ahmedalsadi-1/kronos-releases/issues"
                                    rel="noopener"
                                    className="text-accent"
                                >
                                    Open KronOS support
                                </a>
                            </div>
                        </div>
                    </div>
                    <div className="flex w-full items-center gap-[18px]">
                        <div>
                            <i className="text-[32px] text-white/50 fa-solid fa-chart-line"></i>
                        </div>
                        <div className="flex flex-col items-start gap-1 flex-1">
                            <div className="text-secondary leading-5">
                                Usage telemetry is off for new installs. Support diagnostics stay on this device until
                                you choose to share a report. Model requests go to the provider you configure.
                                <br />
                                <a
                                    className="text-secondary! hover:underline!"
                                    target="_blank"
                                    href="https://ahmedalsadi-1.github.io/kronos-releases/security/"
                                    rel="noopener"
                                >
                                    Privacy and security
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </OverlayScrollbarsComponent>
            <footer className={`unselectable flex-shrink-0 ${isCompact ? "mt-2" : "mt-5"}`}>
                <div className="flex flex-row items-center justify-center [&>button]:!px-5 [&>button]:!py-2 [&>button]:text-sm [&>button:not(:first-child)]:ml-2.5">
                    <Button className="font-[600]" onClick={acceptTos}>
                        Continue
                    </Button>
                </div>
            </footer>
        </div>
    );
};

const NoTelemetryStarPage = ({ isCompact }: { isCompact: boolean }) => {
    const setPageName = useSetAtom(pageNameAtom);

    const handleStarClick = async () => {
        RpcApi.RecordTEventCommand(
            TabRpcClient,
            {
                event: "onboarding:githubstar",
                props: { "onboarding:githubstar": "star", "onboarding:page": "notelemetry" },
            },
            { noresponse: true }
        );
        const clientId = ClientModel.getInstance().clientId;
        await RpcApi.SetMetaCommand(TabRpcClient, {
            oref: WOS.makeORef("client", clientId),
            meta: { "onboarding:githubstar": true },
        });
        window.open("https://github.com/krontermdev/kronterm?ref=not", "_blank");
        setPageName("features");
    };

    const handleMaybeLater = async () => {
        RpcApi.RecordTEventCommand(
            TabRpcClient,
            {
                event: "onboarding:githubstar",
                props: { "onboarding:githubstar": "later", "onboarding:page": "notelemetry" },
            },
            { noresponse: true }
        );
        const clientId = ClientModel.getInstance().clientId;
        await RpcApi.SetMetaCommand(TabRpcClient, {
            oref: WOS.makeORef("client", clientId),
            meta: { "onboarding:githubstar": false },
        });
        setPageName("features");
    };

    return (
        <div className="flex flex-col h-full">
            <header className={`flex flex-col gap-2 border-b-0 p-0 mt-1 mb-4 w-full unselectable flex-shrink-0`}>
                <div className={`flex justify-center`}>
                    <Logo />
                </div>
                <div className="text-center text-[25px] font-normal text-foreground">Telemetry Disabled ✓</div>
            </header>
            <OverlayScrollbarsComponent
                className="flex-1 overflow-y-auto min-h-0"
                options={{ scrollbars: { autoHide: "never" } }}
            >
                <div className="flex flex-col items-center gap-6 w-full mb-2 unselectable">
                    <div className="text-center text-secondary leading-relaxed max-w-md">
                        <p className="mb-4">No problem, we respect your privacy.</p>
                        <p className="mb-4">
                            But, without usage data, we're flying blind. A GitHub star helps us know KronOS is useful
                            and worth maintaining.
                        </p>
                    </div>
                </div>
            </OverlayScrollbarsComponent>
            <footer className={`unselectable flex-shrink-0 mt-2`}>
                <div className="flex flex-row items-center justify-center gap-2.5 [&>button]:!px-5 [&>button]:!py-2 [&>button]:text-sm [&>button]:!h-[37px]">
                    <Button className="outlined green font-[600]" onClick={handleStarClick}>
                        ⭐ Star on GitHub
                    </Button>
                    <Button className="outlined grey font-[600]" onClick={handleMaybeLater}>
                        Maybe Later
                    </Button>
                </div>
            </footer>
        </div>
    );
};

const NewInstallOnboardingModal = () => {
    const clientData = useAtomValue(ClientModel.getInstance().clientAtom);
    useEffect(() => {
        disableGlobalKeybindings();
        return () => enableGlobalKeybindings();
    }, []);

    return (
        <FlexiModal className="relative max-h-[90dvh] w-[min(560px,calc(100vw-24px))] overflow-auto rounded-xl">
            <OnboardingGradientBg />
            <div className="relative z-10">
                <KronOSFirstRun alreadyAccepted={Boolean(clientData?.tosagreed)} />
            </div>
        </FlexiModal>
    );
};

NewInstallOnboardingModal.displayName = "NewInstallOnboardingModal";

export { InitPage, NewInstallOnboardingModal, NoTelemetryStarPage };
