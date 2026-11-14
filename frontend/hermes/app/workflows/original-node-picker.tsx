import { SystemButton } from "@/app/components/system-ui";
import { WorkflowNodePickerPopup } from "@/app/tab/workflow-node-picker-popup";
import {
    $workflowPickerComfyTarget,
    $workflowPickerCommandTarget,
    $workflowPickerSource,
    closeWorkflowPicker,
    type WorkflowPickerSource,
} from "@hermes/store/command-palette";
import { useStore } from "@nanostores/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkflowContext } from "./workflow-context";
import { WorkspaceWidgetPicker } from "./workspace-widget-picker";

const PickerSources = [
    { id: "n8n", label: "All nodes" },
    { id: "comfy-nodes", label: "KronRender nodes" },
    { id: "comfy-models", label: "KronRender models" },
] as const;

export function OriginalNodePicker({ tabId, onClose }: { tabId: string; onClose: () => void }) {
    const target = useRef<HTMLDivElement>(null);
    const source = useStore($workflowPickerSource);
    const [canSearch, setCanSearch] = useState(false);
    const { workflowId } = useWorkflowContext();
    const [widgetSlot, setWidgetSlot] = useState<{ target: HTMLElement; query: string }>(null);
    const [fallbackSlot, setFallbackSlot] = useState<HTMLDivElement>(null);
    const [fallbackQuery, setFallbackQuery] = useState("");
    const fallbackSearch = useRef<HTMLInputElement>(null);
    const useComfySearch = source === "comfy-nodes" || source === "comfy-models";
    const selectedSource = useComfySearch ? source : "n8n";
    useEffect(() => {
        const receive = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!tabId || detail?.tabId !== tabId) return;
            if (!detail.target && detail.previousTarget) {
                setWidgetSlot((current) => (current?.target === detail.previousTarget ? null : current));
                return;
            }
            setWidgetSlot(
                detail.target instanceof HTMLElement
                    ? { target: detail.target, query: typeof detail.query === "string" ? detail.query : "" }
                    : null
            );
        };
        window.addEventListener("kronterm:workflow-widget-picker-target", receive);
        return () => window.removeEventListener("kronterm:workflow-widget-picker-target", receive);
    }, [tabId]);
    useEffect(() => {
        if (useComfySearch) {
            fallbackSearch.current?.focus();
            return;
        }
        target.current?.shadowRoot
            ?.querySelector<HTMLInputElement>('[data-test-id="node-creator-search-bar"]')
            ?.focus();
    }, [source, canSearch, useComfySearch]);
    const openPicker = () => {
        window.dispatchEvent(
            new CustomEvent("kronterm:original-node-picker", { detail: { target: target.current, tabId } })
        );
    };
    const selectSource = (next: WorkflowPickerSource) => {
        $workflowPickerSource.set(next);
        if (next === "n8n" && !canSearch) openPicker();
    };
    useEffect(() => {
        openPicker();
        const root = target.current?.shadowRoot;
        const update = () => setCanSearch(Boolean(root?.querySelector('[data-test-id="node-creator-search-bar"]')));
        const observer = new MutationObserver(update);
        if (root) observer.observe(root, { childList: true, subtree: true });
        update();
        return () => {
            observer.disconnect();
            window.dispatchEvent(new CustomEvent("kronterm:original-node-picker", { detail: { target: null, tabId } }));
        };
    }, [tabId]);
    return (
        <WorkflowNodePickerPopup open label="Workflow node picker" title="Workflow picker" onClose={onClose}>
            <div
                role="group"
                aria-label="Workflow catalog"
                className="flex shrink-0 flex-wrap gap-1 border-b border-(--kt-separator) bg-(--kt-popover) px-2 py-1.5"
            >
                {PickerSources.map(({ id, label }) => (
                    <SystemButton
                        key={id}
                        size="small"
                        selected={id === selectedSource}
                        aria-pressed={id === selectedSource}
                        onClick={() => selectSource(id)}
                    >
                        {label}
                    </SystemButton>
                ))}
                {!canSearch && !useComfySearch && (
                    <SystemButton className="ml-auto" size="small" onClick={openPicker}>
                        Show picker
                    </SystemButton>
                )}
            </div>
            <div
                ref={target}
                aria-label="Workflow nodes"
                hidden={useComfySearch}
                className="relative min-h-0 w-full flex-1 overflow-hidden"
            />
            {useComfySearch && (
                <div
                    className="min-h-0 flex-1 overflow-auto bg-(--kt-popover) p-2 text-(--kt-label)
                        [&_.kronterm-catalog-row]:flex [&_.kronterm-catalog-row]:min-h-10 [&_.kronterm-catalog-row]:w-full
                        [&_.kronterm-catalog-row]:cursor-pointer [&_.kronterm-catalog-row]:items-center
                        [&_.kronterm-catalog-row]:gap-2 [&_.kronterm-catalog-row]:rounded [&_.kronterm-catalog-row]:px-2
                        [&_.kronterm-catalog-row]:text-left [&_.kronterm-catalog-row:hover]:bg-(--kt-fill-hover)
                        [&_.kronterm-catalog-label]:grid"
                >
                    <input
                        ref={fallbackSearch}
                        type="search"
                        aria-label={source === "comfy-models" ? "Search KronRender models" : "Search KronRender nodes"}
                        placeholder={source === "comfy-models" ? "Search models" : "Search nodes"}
                        className="mb-2 w-full rounded bg-(--kt-fill) px-2 py-1 placeholder:text-(--kt-label-secondary)"
                        value={fallbackQuery}
                        onChange={(event) => setFallbackQuery(event.currentTarget.value)}
                    />
                    <div ref={setFallbackSlot} />
                    {fallbackSlot && (
                        <EmbeddedPickerCatalogs
                            tabId={tabId}
                            workflowId={workflowId}
                            query={fallbackQuery}
                            slot={fallbackSlot}
                            comfyOnly
                        />
                    )}
                </div>
            )}
            {!useComfySearch &&
                widgetSlot &&
                createPortal(
                    <EmbeddedPickerCatalogs
                        tabId={tabId}
                        workflowId={workflowId}
                        query={widgetSlot.query}
                        slot={widgetSlot.target}
                        commandsFirst={source === "commands"}
                    />,
                    widgetSlot.target
                )}
        </WorkflowNodePickerPopup>
    );
}

function EmbeddedPickerCatalogs({
    tabId,
    workflowId,
    query,
    slot,
    commandsFirst,
    comfyOnly = false,
}: {
    tabId: string;
    workflowId: string;
    query: string;
    slot: HTMLElement;
    commandsFirst?: boolean;
    comfyOnly?: boolean;
}) {
    const commands = useRef<HTMLDivElement>(null);
    const comfy = useRef<HTMLDivElement>(null);
    const [overflow] = useState(() => document.createElement("div"));
    useLayoutEffect(() => {
        // Keep the full catalogs in the native scroll list without pushing n8n's own rows out of the initial view.
        overflow.className = "kronterm-catalog-overflow";
        slot.parentElement.append(overflow);
        return () => overflow.remove();
    }, [slot, overflow]);
    useLayoutEffect(() => {
        if (commands.current) $workflowPickerCommandTarget.set({ element: commands.current, overflow, query, tabId });
        $workflowPickerComfyTarget.set({ element: comfy.current, overflow, query, tabId });
        slot.parentElement.scrollTop = 0;
    }, [query, overflow, slot, tabId]);
    useLayoutEffect(() => {
        const commandElement = commands.current;
        const comfyElement = comfy.current;
        return () => {
            if ($workflowPickerCommandTarget.get()?.element === commandElement) $workflowPickerCommandTarget.set(null);
            if ($workflowPickerComfyTarget.get()?.element === comfyElement) $workflowPickerComfyTarget.set(null);
        };
    }, []);
    useEffect(() => {
        const nativeRoot = comfy.current.getRootNode();
        if (!comfyOnly && !(nativeRoot instanceof ShadowRoot)) return;
        const root = comfyOnly ? slot.parentElement : (nativeRoot as ShadowRoot);
        const selector = comfyOnly ? 'input[type="search"]' : '[data-test-id="node-creator-search-bar"]';
        const search = () => root.querySelector<HTMLInputElement>(selector);
        const handle = (event: Event) => {
            if (!(event instanceof KeyboardEvent) || event.isComposing) return;
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopImmediatePropagation();
                closeWorkflowPicker();
                return;
            }
            if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
            const field = search();
            const fromSearch = event.target === field;
            const rows = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-kronterm-picker-result]")).filter(
                (row) => row.getClientRects().length > 0
            );
            const current = rows.indexOf(event.target as HTMLButtonElement);
            if (!rows.length || (!fromSearch && current < 0)) return;
            const noNativeResults = comfyOnly || root.querySelector('[data-test-id="node-creator-no-results"]') != null;
            const exact = rows.find(
                (row) => row.dataset.krontermPickerLabel?.toLowerCase() === field?.value.trim().toLowerCase()
            );
            if (event.key === "Enter") {
                if (comfyOnly && fromSearch && !field?.value.trim()) return;
                const selected = rows[current] ?? (noNativeResults ? (exact ?? rows[0]) : exact);
                if (!selected) return;
                selected.dispatchEvent(
                    new MouseEvent("click", { bubbles: true, composed: true, ...eventModifiers(event) })
                );
            } else if (fromSearch) {
                if (event.key === "ArrowUp" || (!comfyOnly && !field?.value.trim()) || (!noNativeResults && !exact))
                    return;
                (exact ?? rows[0]).focus();
            } else {
                const next = rows[current + (event.key === "ArrowDown" ? 1 : -1)];
                (next ?? field)?.focus();
            }
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        root.addEventListener("keydown", handle, true);
        return () => root.removeEventListener("keydown", handle, true);
    }, [comfyOnly, slot]);
    return (
        <>
            {!comfyOnly && <WorkspaceWidgetPicker active tabId={tabId} workflowId={workflowId} query={query} embedded />}
            {(comfyOnly ? ["comfy"] : commandsFirst ? ["commands", "comfy"] : ["comfy", "commands"]).map((key) => (
                <div key={key} ref={key === "commands" ? commands : comfy} />
            ))}
        </>
    );
}

function eventModifiers(event: KeyboardEvent) {
    return { ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey };
}

export function OriginalExecutionsPanel({ active, dockOnly = false }: { active: boolean; dockOnly?: boolean }) {
    const target = useRef<HTMLDivElement>(null);
    const { tabId, workflowId, hasExecutions } = useWorkflowContext();
    const [dock, setDock] = useState<HTMLElement>(null);
    useEffect(() => {
        const receive = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!tabId || detail?.tabId !== tabId) return;
            setDock(detail.target instanceof HTMLElement ? detail.target : null);
        };
        window.addEventListener("kronterm:workflow-executions-dock-target", receive);
        window.dispatchEvent(
            new CustomEvent("kronterm:workflow-executions-dock-target-request", { detail: { tabId } })
        );
        return () => {
            window.removeEventListener("kronterm:workflow-executions-dock-target", receive);
            setDock(null);
        };
    }, [tabId]);
    const docked = Boolean(dock && active && hasExecutions && dockOnly);
    useEffect(() => {
        if (!tabId || !dockOnly) return;
        window.dispatchEvent(
            new CustomEvent("kronterm:workflow-executions-dock-visibility", { detail: { tabId, open: docked } })
        );
        return () => {
            if (docked)
                window.dispatchEvent(
                    new CustomEvent("kronterm:workflow-executions-dock-visibility", { detail: { tabId, open: false } })
                );
        };
    }, [tabId, docked, dockOnly]);
    useEffect(() => {
        if (!active || !hasExecutions || (dockOnly && !docked)) return;
        const mountedTarget = target.current;
        window.dispatchEvent(
            new CustomEvent("kronterm:workflow-surface", {
                detail: { surface: "executions", target: mountedTarget, tabId, workflowId },
            })
        );
        return () => {
            window.dispatchEvent(
                new CustomEvent("kronterm:workflow-surface", {
                    detail: { surface: "executions", target: null, previousTarget: mountedTarget, tabId, workflowId },
                })
            );
        };
    }, [active, tabId, workflowId, hasExecutions, docked, dock, dockOnly]);
    const history = <div ref={target} aria-label="Workflow execution history" className="h-full min-h-0 flex-1" />;
    if (!docked) return dockOnly ? null : history;
    return (
        <>
            {createPortal(
                <section aria-label="Workflow execution dock" className="flex h-full min-h-0 flex-col">
                    <header className="flex shrink-0 items-center justify-between border-b border-(--ui-stroke-secondary) px-3 py-2 text-sm">
                        <span>Execution history</span>
                        <button
                            type="button"
                            className="cursor-pointer rounded px-2 py-1 hover:bg-(--chrome-action-hover)"
                            onClick={() => {
                                window.dispatchEvent(
                                    new CustomEvent("kronterm:workflow-executions-dock-close", { detail: { tabId } })
                                );
                            }}
                        >
                            Close history
                        </button>
                    </header>
                    {history}
                </section>,
                dock
            )}
        </>
    );
}
