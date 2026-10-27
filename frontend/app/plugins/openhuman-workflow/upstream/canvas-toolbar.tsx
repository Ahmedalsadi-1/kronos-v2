// SPDX-License-Identifier: GPL-3.0-only
// Extracted and adapted from tinyhumansai/openhuman; see ../NOTICE.md.

import { Panel, useReactFlow } from "@xyflow/react";
import { Maximize, Minus, PanelRightOpen, Plus, Redo2, Undo2 } from "lucide-react";
import { memo, type ReactNode } from "react";

import { Button, useT } from "../ui";
import { FLOW_FIT_VIEW_OPTIONS } from "./fit-view";

interface CanvasToolbarProps {
    history?: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void };

    onOpenPanel?: () => void;
}

function ToolButton({
    label,
    testId,
    disabled,
    onClick,
    children,
}: {
    label: string;
    testId?: string;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Button
            type="button"
            variant="tertiary"
            size="sm"
            iconOnly
            aria-label={label}
            title={label}
            data-testid={testId}
            disabled={disabled}
            onClick={onClick}
        >
            {children}
        </Button>
    );
}

const Divider = () => <span className="wf-toolbar-divider" aria-hidden />;

function CanvasToolbar({ history, onOpenPanel }: CanvasToolbarProps) {
    const { t } = useT();
    const { zoomIn, zoomOut, fitView } = useReactFlow();
    const icon = "h-4 w-4";

    return (
        <>
            <Panel position="top-left" className="!m-3">
                <div
                    role="toolbar"
                    aria-label={t("flows.canvas.toolbar")}
                    data-testid="flow-canvas-toolbar"
                    className="wf-canvas-toolbar"
                >
                    {history && (
                        <>
                            <ToolButton
                                label={t("flows.editor.undo")}
                                testId="flow-editor-undo"
                                disabled={!history.canUndo}
                                onClick={history.onUndo}
                            >
                                <Undo2 className={icon} aria-hidden />
                            </ToolButton>
                            <ToolButton
                                label={t("flows.editor.redo")}
                                testId="flow-editor-redo"
                                disabled={!history.canRedo}
                                onClick={history.onRedo}
                            >
                                <Redo2 className={icon} aria-hidden />
                            </ToolButton>
                            <Divider />
                        </>
                    )}
                    <ToolButton label={t("flows.canvas.zoomOut")} onClick={() => void zoomOut()}>
                        <Minus className={icon} aria-hidden />
                    </ToolButton>
                    <ToolButton label={t("flows.canvas.zoomIn")} onClick={() => void zoomIn()}>
                        <Plus className={icon} aria-hidden />
                    </ToolButton>
                    <ToolButton label={t("flows.canvas.fitView")} onClick={() => void fitView(FLOW_FIT_VIEW_OPTIONS)}>
                        <Maximize className={icon} aria-hidden />
                    </ToolButton>
                </div>
            </Panel>

            {onOpenPanel && (
                <Panel position="top-right" className="!m-3">
                    <div className="rounded-lg border border-line bg-surface/95 p-0.5 shadow-xs backdrop-blur">
                        <ToolButton
                            label={t("flows.canvas.openPanel")}
                            testId="flow-canvas-open-panel"
                            onClick={onOpenPanel}
                        >
                            <PanelRightOpen className={icon} aria-hidden />
                        </ToolButton>
                    </div>
                </Panel>
            )}
        </>
    );
}

export const CanvasToolbarView = memo(CanvasToolbar);
CanvasToolbarView.displayName = "CanvasToolbarView";
