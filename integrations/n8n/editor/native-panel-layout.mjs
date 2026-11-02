export function measurePanelInsets(frame, panels) {
  const positive = (value) => Math.max(0, Math.ceil(value));
  return {
    top: panels.header ? (panels.minimumTop ?? positive(panels.header.bottom - frame.top + 8)) : 0,
    right: panels.detail && panels.detailMode !== "floating" ? positive(frame.right - panels.detail.left) : 0,
    bottom: Math.max(
      panels.logs && panels.logs.height > 48 ? positive(frame.bottom - panels.logs.top + 8) : 0,
      ...(panels.controls || []).map((rect) => positive(frame.bottom - rect.top + 8)),
      panels.header ? (panels.minimumBottom ?? 36) : 0
    ),
  };
}
export function observeNativePanels(host) {
  if (!host.onPanelLayout || !host.panelFrame) return () => {};
  let frameId = 0;
  let disposed = false;
  let signature = "";
  const observed = new Set();
  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
  };
  const roots = [
    ...new Set([host.headerTarget, host.logsTarget, host.chromeTarget, host.detailTarget].filter(Boolean)),
  ];
  const find = (selector) => roots.flatMap((root) => [...root.querySelectorAll(selector)]).find(visible);
  const resize = new ResizeObserver(() => schedule());
  function measure() {
    frameId = 0;
    if (disposed) return;
    const header = find(".kronterm-workflow-header");
    const detail = find('[data-workflow-node-editor],.kronterm-management,[data-test-id="focus-sidebar"]');
    const logs = find(".kronterm-workflow-logs");
    const controls = roots
      .flatMap((root) => [
        ...root.querySelectorAll(
          ".kronterm-execution-controls button,.kronterm-canvas-controls button,.kronterm-minimap-controls .vue-flow__minimap"
        ),
      ])
      .filter(visible);
    host.setCssVar?.("--kronterm-workflow-logs-height", (logs?.getBoundingClientRect().height || 0) + "px");
    const nextObserved = new Set(
      [
        host.panelFrame,
        header,
        detail,
        logs,
        ...roots.flatMap((root) => [...root.querySelectorAll("[data-workflow-controls]")]),
      ].filter(Boolean)
    );
    for (const element of observed)
      if (!nextObserved.has(element)) {
        resize.unobserve(element);
        observed.delete(element);
      }
    for (const element of nextObserved)
      if (!observed.has(element)) {
        observed.add(element);
        resize.observe(element);
      }
    const frame = host.panelFrame.getBoundingClientRect();
    const layout = measurePanelInsets(frame, {
      header: header?.getBoundingClientRect(),
      detail: detail?.getBoundingClientRect(),
      detailMode: detail?.matches('[data-test-id="focus-sidebar"]') ? "floating" : "docked",
      logs: logs?.getBoundingClientRect(),
      controls: [],
      minimumBottom: 36,
      minimumTop: 64,
    });
    const nextSignature = JSON.stringify(layout);
    if (nextSignature !== signature) {
      signature = nextSignature;
      host.onPanelLayout(layout);
    }
  }
  function schedule() {
    if (!disposed && !frameId) frameId = requestAnimationFrame(measure);
  }
  const mutation = new MutationObserver(schedule);
  for (const root of roots)
    mutation.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden", "open"],
    });
  schedule();
  return () => {
    disposed = true;
    cancelAnimationFrame(frameId);
    resize.disconnect();
    mutation.disconnect();
    host.onPanelLayout({ top: 0, right: 0, bottom: 0 });
  };
}
