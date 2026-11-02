// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
export function screenToWorld(point, camera, viewport) {
  return {
    x: (point.x - viewport.left - camera.x) / camera.zoom,
    y: (point.y - viewport.top - camera.y) / camera.zoom,
  };
}
export function worldToScreen(point, camera, viewport) {
  return { x: viewport.left + camera.x + point.x * camera.zoom, y: viewport.top + camera.y + point.y * camera.zoom };
}
export function handleInWorld(handle, node, zoom) {
  return {
    x: (handle.left - node.left) / zoom,
    y: (handle.top - node.top) / zoom,
    width: handle.width / zoom,
    height: handle.height / zoom,
  };
}
