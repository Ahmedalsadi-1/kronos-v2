// SPDX-License-Identifier: GPL-3.0-only
// Extracted and adapted from tinyhumansai/openhuman; see ../NOTICE.md.

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Sparkles as LuSparkles } from "lucide-react";
import { type CSSProperties, memo } from "react";

import { Badge, type BadgeVariant, Button, describeNode, useT } from "../ui";
import { useCanvasActions } from "./canvas-actions";
import type { FlowNode } from "./graph-adapter";
import { NodeKindTile } from "./node-kind-icons";
import { useStepNumber } from "./step-numbers";

const INLINE_HANDLE_STYLE: CSSProperties = {
    position: "relative",
    top: "auto",
    left: "auto",
    right: "auto",
    transform: "none",
};

const HANDLE_CLASS =
    "!h-3 !w-3 !rounded-full !border-2 !border-surface !bg-primary-500 !transition-transform hover:!scale-125";

const IMPLICIT_PORT = "main";

function portPillVariant(port: string): BadgeVariant {
    const key = port.toLowerCase();
    if (key === "true") return "success";
    if (key === "false" || key === "error") return "danger";
    return "neutral";
}

function FlowNodeComponent({ id, data, selected }: NodeProps<FlowNode>) {
    const { t, locale } = useT();
    const actions = useCanvasActions();
    const stepNumber = useStepNumber(id);
    const isNativeTool =
        data.kind === "tool_call" &&
        (data.config?.provider === "openhuman" ||
            (typeof data.config?.slug === "string" && data.config.slug.startsWith("oh:")));
    const kindLabel = String(data.config?.kind ?? data.kind);
    const summary = describeNode(data.kind, data.config ?? {}, data.outputPorts, t, locale);
    const labelInputs = data.inputPorts.length > 1 || data.inputPorts.some((p) => p !== IMPLICIT_PORT);
    const labelOutputs = data.outputPorts.length > 1 || data.outputPorts.some((p) => p !== IMPLICIT_PORT);
    const showActions = Boolean(actions) && selected;

    return (
        <div
            data-testid="flow-node"
            data-node-kind={data.kind}
            className={`wf-node ${selected ? "wf-node-selected" : ""}`}
        >
            {data.inputPorts.length > 0 && (
                <div
                    className="absolute inset-x-0 top-0 flex -translate-y-1/2 items-center justify-center gap-6"
                    data-testid="flow-node-inputs"
                >
                    {data.inputPorts.map((port) => (
                        <div key={`in-${port}`} className="relative flex flex-col items-center">
                            {labelInputs && (
                                <Badge
                                    variant={portPillVariant(port)}
                                    dot={false}
                                    className="absolute bottom-full mb-1"
                                >
                                    {port}
                                </Badge>
                            )}
                            <Handle
                                id={port}
                                type="target"
                                position={Position.Top}
                                style={INLINE_HANDLE_STYLE}
                                className={HANDLE_CLASS}
                                title={port}
                            />
                        </div>
                    ))}
                </div>
            )}

            <div className="wf-node-heading flex items-center">
                <NodeKindTile
                    kind={isNativeTool ? "agent" : data.kind}
                    icon={isNativeTool ? LuSparkles : undefined}
                    testId="flow-node-icon"
                />
                <div className="min-w-0 flex-1">
                    <div className="wf-node-title" title={data.name}>
                        {data.name}
                    </div>
                    <div className="wf-node-meta flex items-center gap-1.5">
                        {stepNumber !== undefined && (
                            <>
                                <span data-testid="flow-node-step" className="font-semibold tabular-nums">
                                    {stepNumber}
                                </span>
                                <span aria-hidden="true" className="opacity-40">
                                    ·
                                </span>
                            </>
                        )}
                        <span className="truncate font-medium uppercase tracking-[0.08em]">{kindLabel}</span>
                    </div>
                </div>
            </div>

            {summary && (
                <div className="wf-node-description" data-testid="flow-node-summary">
                    {summary}
                </div>
            )}

            {showActions && actions && (
                <div className="flex items-center justify-end gap-1 border-t border-line px-2 py-1.5">
                    <Button
                        type="button"
                        variant="tertiary"
                        size="xs"
                        data-testid="flow-node-validate"
                        disabled={actions.validating}
                        onClick={() => actions.validate()}
                        className="h-auto px-2 py-1 text-[11px]"
                    >
                        {actions.validating ? t("flows.editor.validating") : t("flows.editor.validate")}
                    </Button>
                    <Button
                        type="button"
                        variant="tertiary"
                        tone="danger"
                        size="xs"
                        data-testid="flow-node-delete"
                        onClick={() => actions.deleteNode(id)}
                        className="h-auto px-2 py-1 text-[11px]"
                    >
                        {t("flows.editor.deleteNode")}
                    </Button>
                </div>
            )}

            {data.outputPorts.length > 0 && (
                <div
                    className="absolute inset-x-0 bottom-0 flex translate-y-1/2 items-center justify-center gap-6"
                    data-testid="flow-node-outputs"
                >
                    {data.outputPorts.map((port) => (
                        <div key={`out-${port}`} className="relative flex flex-col items-center">
                            <Handle
                                id={port}
                                type="source"
                                position={Position.Bottom}
                                style={INLINE_HANDLE_STYLE}
                                className={HANDLE_CLASS}
                                title={port}
                            />
                            {labelOutputs && (
                                <Badge variant={portPillVariant(port)} dot={false} className="absolute top-full mt-1">
                                    {port}
                                </Badge>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export const FlowNodeCard = memo(FlowNodeComponent);
FlowNodeCard.displayName = "FlowNodeCard";
