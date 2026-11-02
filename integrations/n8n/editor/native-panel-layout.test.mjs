import assert from "node:assert/strict";
import { test } from "node:test";
import { measurePanelInsets } from "./native-panel-layout.mjs";
const frame = { top: 50, right: 1540, bottom: 950 };
test("actual dock bounds reserve shell header, right detail, logs and controls without camera projection", () => {
  assert.deepEqual(
    measurePanelInsets(frame, {
      header: { bottom: 194 },
      detail: { left: 892 },
      logs: { top: 662 },
      controls: [{ top: 610 }],
    }),
    { top: 152, right: 648, bottom: 348 }
  );
});
test("closing all original surfaces releases reservations", () => {
  assert.deepEqual(measurePanelInsets(frame, {}), { top: 0, right: 0, bottom: 0 });
});
test("collapsed logs still leave room for the original control row and OS dock", () => {
  assert.deepEqual(measurePanelInsets(frame, { header: { bottom: 194 }, logs: { top: 900 } }), {
    top: 152,
    right: 0,
    bottom: 36,
  });
});

test("compact footer and left navigation leave the full OS work area available", () => {
  assert.deepEqual(
    measurePanelInsets(frame, {
      header: { bottom: 194 },
      logs: { top: 902, height: 36 },
      minimumTop: 64,
      minimumBottom: 36,
    }),
    { top: 64, right: 0, bottom: 36 }
  );
  assert.equal(
    measurePanelInsets(frame, {
      header: { bottom: 194 },
      logs: { top: 600, height: 300 },
      minimumTop: 64,
      minimumBottom: 36,
    }).bottom,
    358
  );
});

test("a compact floating focus card does not reserve a full-height canvas strip", () => {
  const card = { left: 1200, top: 64, width: 340, height: 280 };
  assert.deepEqual(measurePanelInsets(frame, { detail: card, detailMode: "floating" }), {
    top: 0,
    right: 0,
    bottom: 0,
  });
  assert.equal(measurePanelInsets(frame, { detail: card, detailMode: "docked" }).right, 340);
});
