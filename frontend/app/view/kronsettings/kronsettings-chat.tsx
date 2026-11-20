// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { memo, useCallback } from "react";
import { useSettingField, useToggleField } from "./kronsettings-hooks";
import type { KronSettingsViewModel } from "./kronsettings-model";
import {
    InfoCallout,
    InputSetting,
    SectionHeader,
    SettingsCard,
    ToggleSetting,
} from "./kronsettings-shared";

interface KronSettingsChatContentProps {
    model: KronSettingsViewModel;
}

const KronSettingsChatContent = memo((_props: KronSettingsChatContentProps) => {
    const [defaultMode, setDefaultMode] = useSettingField("waveai:defaultmode");
    const [baseUrl, setBaseUrl] = useSettingField("ai:baseurl");
    const [apiToken, setApiToken] = useSettingField("ai:apitoken");
    const [aiModel, setAiModel] = useSettingField("ai:model");
    const [maxTokens, setMaxTokens] = useSettingField("ai:maxtokens");
    const [autoNameChats, setAutoNameChats] = useToggleField("waveai:autoname" as keyof SettingsType);

    const setValues = useCallback((values: Record<string, any>) => {
        void RpcApi.SetConfigCommand(TabRpcClient, values).catch((error) => {
            console.warn("[KronOS settings] config update failed", error);
        });
    }, []);

    const applyPreset = useCallback(
        (preset: "kronos" | "openai" | "ollama") => {
            if (preset === "kronos") {
                setValues({
                    "waveai:defaultmode": "waveai@kronos",
                });
                return;
            }
            if (preset === "openai") {
                setValues({
                    "ai:provider": "openai",
                    "ai:model": "gpt-4.1",
                    "waveai:defaultmode": "waveai@openai",
                });
                return;
            }
            setValues({
                "ai:provider": "ollama",
                "ai:baseurl": "http://localhost:11434/v1",
                "ai:model": "llama3.3",
                "waveai:defaultmode": "waveai@ollama",
            });
        },
        [setValues]
    );

    return (
        <div>
            <SettingsCard>
                <SectionHeader
                    title="Quick Setup"
                    icon="bolt"
                    description="Choose a simple starting point. You can fine-tune advanced fields below later."
                />
                <div className="grid gap-3 @lg:grid-cols-3">
                    <button
                        type="button"
                        onClick={() => applyPreset("kronos")}
                        className="cursor-pointer rounded-xl border border-border bg-black/20 p-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/10"
                    >
                        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
                            <i className="fa-solid fa-wand-magic-sparkles text-accent" />
                            Recommended
                        </div>
                        <p className="text-xs leading-relaxed text-secondary">
                            Use KronosCode defaults and keep the dock as the main chat surface.
                        </p>
                    </button>
                    <button
                        type="button"
                        onClick={() => applyPreset("openai")}
                        className="cursor-pointer rounded-xl border border-border bg-black/20 p-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/10"
                    >
                        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
                            <i className="fa-solid fa-cloud text-accent" />
                            Hosted Model
                        </div>
                        <p className="text-xs leading-relaxed text-secondary">
                            Start with a hosted OpenAI-style setup. Add your key in the secure credential section.
                        </p>
                    </button>
                    <button
                        type="button"
                        onClick={() => applyPreset("ollama")}
                        className="cursor-pointer rounded-xl border border-border bg-black/20 p-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/10"
                    >
                        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
                            <i className="fa-solid fa-house-laptop text-accent" />
                            Local Model
                        </div>
                        <p className="text-xs leading-relaxed text-secondary">
                            Use a local Ollama server. Best for users who already run local models.
                        </p>
                    </button>
                </div>
            </SettingsCard>
            <SettingsCard>
                <SectionHeader
                    title="Chat Configuration"
                    icon="comment"
                    description="Plain-language chat behavior and provider settings."
                />
                <InputSetting
                    title="Default Assistant"
                    description="Which assistant setup KronOS should use when a new chat starts."
                    value={defaultMode}
                    onChange={setDefaultMode}
                    placeholder="waveai@kronos"
                />
                <InputSetting
                    title="Server URL"
                    description="Only change this if your model provider gave you a custom server URL."
                    value={baseUrl}
                    onChange={setBaseUrl}
                    placeholder="https://api.openai.com/v1"
                    monospace
                />
                <InputSetting
                    title="API Key"
                    description="Paste your provider key here if you use a hosted model. Keep this private."
                    value={apiToken}
                    onChange={setApiToken}
                    placeholder="sk-..."
                    type="password"
                    monospace
                />
                <InputSetting
                    title="Model Name"
                    description="The model KronOS should ask, for example gpt-4.1 or a local Ollama model."
                    value={aiModel}
                    onChange={setAiModel}
                    placeholder="gpt-4o"
                    monospace
                />
                <InputSetting
                    title="Response Length Limit"
                    description="Higher values allow longer answers but may cost more or run slower."
                    value={maxTokens}
                    onChange={setMaxTokens}
                    placeholder="4096"
                />
                <ToggleSetting
                    title="Automatically Name Chats"
                    description="Let KronOS create readable conversation titles for you."
                    checked={autoNameChats}
                    onChange={setAutoNameChats}
                />
            </SettingsCard>
            <InfoCallout>
                <i className="fa-solid fa-circle-info" />
                API keys are stored locally and never sent to KronOS servers.
            </InfoCallout>
        </div>
    );
});

KronSettingsChatContent.displayName = "KronSettingsChatContent";

export { KronSettingsChatContent };
