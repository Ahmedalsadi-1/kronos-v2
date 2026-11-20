// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { navigateToWorkspacePage, WORKFLOWS_ROUTE } from "@hermes/app/routes";
import { Button } from "@hermes/components/ui/button";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ListRow, SettingsContent, SettingsSection } from "./primitives";
import { openWorkspaceTool, WorkspaceTools, type WorkspaceToolId } from "./workspace-tools";

export function WorkspaceToolSettings({ toolId }: { toolId: WorkspaceToolId }) {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const tool = WorkspaceTools.find((entry) => entry.id === toolId)!;
    const open = async () => {
        setBusy(true);
        setError("");
        try {
            await openWorkspaceTool(toolId, () => navigateToWorkspacePage(navigate, WORKFLOWS_ROUTE));
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            setBusy(false);
        }
    };
    return (
        <SettingsContent>
            <p className="mb-8 max-w-xl text-sm leading-6 text-muted-foreground">{tool.description}</p>
            <SettingsSection icon={tool.icon} title="Workspace">
                <ListRow
                    title={tool.label}
                    description={tool.detail}
                    action={
                        <Button className="cursor-pointer" disabled={busy} onClick={() => void open()}>
                            {busy ? "Opening..." : `Open ${tool.label}`}
                        </Button>
                    }
                />
                {error && (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                        {error}
                    </p>
                )}
            </SettingsSection>
            <SettingsSection icon={tool.icon} title="Quick access">
                <ListRow
                    title="Always available"
                    description="Find this workspace in Settings or search for it in the command palette, from any workspace layout."
                />
            </SettingsSection>
        </SettingsContent>
    );
}
