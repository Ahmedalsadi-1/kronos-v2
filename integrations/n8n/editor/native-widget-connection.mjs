// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export function dispatchNativeWidgetConnection(event, host, handle) {
  if (!event || !host?.tabId || !host.workflowId || handle?.handleType !== "source") return false;
  const target = event.view?.document?.elementFromPoint(event.clientX, event.clientY) || event.target;
  const widget = target?.closest?.(".os-window[data-block-id]");
  const blockId = widget?.getAttribute("data-block-id");
  if (!blockId) return false;
  // Let the original connection handler retain its source port before opening the configuration dialog.
  queueMicrotask(() =>
    window.dispatchEvent(
      new CustomEvent("kronterm:workflow-insert-widget", {
        detail: { tabId: host.tabId, workflowId: host.workflowId, blockId, requestId: crypto.randomUUID() },
      })
    )
  );
  return true;
}
