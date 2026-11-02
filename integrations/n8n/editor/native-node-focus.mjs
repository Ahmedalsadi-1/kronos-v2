export function focusNativeNode(event, id, host, activate, options = {}) {
  if (
    !host ||
    options.nonParameterNode ||
    options.suppressInteraction ||
    options.dragging ||
    host.documentMutation?.value
  )
    return false;
  if (
    event.defaultPrevented ||
    (event.button ?? 0) !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return false;
  const target = event.composedPath?.()[0] || event.target;
  if (
    target?.closest?.(
      '.vue-flow__handle,button,a,input,textarea,select,[role="button"],[contenteditable="true"],.nodrag,[data-test-id="canvas-node-toolbar"]'
    )
  )
    return false;
  host.onSelection?.(id);
  activate(id, event);
  return true;
}

export function bindNativeNodeEditor(host, clearNodeActive) {
  if (!host) return () => {};
  const close = () => clearNodeActive();
  host.closeNodeEditor = close;
  return () => {
    if (host.closeNodeEditor === close) delete host.closeNodeEditor;
  };
}

export function bindNativeWidgetInsertion(host, canEdit, insert) {
  if (!host) return () => {};
  const add = async (input) => {
    if (host.disposing || host.documentMutation?.value || !canEdit()) throw new Error("Workflow is read only.");
    if (!input || input.workflowId !== host.workflowId || typeof input.blockId !== "string" || !input.blockId.trim())
      throw new Error("Widget binding is not valid for this workflow.");
    const node = await insert({
      type: "CUSTOM.kronTermWidget",
      openDetail: false,
      name: String(input.label || "Workspace widget").slice(0, 100),
      parameters: { operation: "widget_get_state", blockId: input.blockId, arguments: "{}" },
    });
    if (!node?.id) throw new Error("The widget node could not be created.");
    return { nodeId: node.id };
  };
  host.insertWidgetNode = add;
  return () => {
    if (host.insertWidgetNode === add) delete host.insertWidgetNode;
  };
}
