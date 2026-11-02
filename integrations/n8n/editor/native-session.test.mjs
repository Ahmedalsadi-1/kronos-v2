import assert from "node:assert/strict";
import { test } from "node:test";
import { createNativeSession } from "./native-session.mjs";
test("remount retains initialized stores and registers route/slot identities once", () => {
  let storeCreations = 0;
  const routes = new Set();
  const calls = [];
  const session = createNativeSession(() => ({ id: ++storeCreations, authenticated: false }), {
    routes: () => {
      assert.equal(routes.has("data-table"), false);
      routes.add("data-table");
      calls.push("routes");
    },
    slots: () => calls.push("slots"),
    capabilities: () => calls.push("capabilities"),
  });
  session.prepare();
  const captured = session.stores;
  captured.authenticated = true;
  session.prepare();
  session.prepare();
  assert.equal(session.stores, captured);
  assert.equal(session.stores.authenticated, true);
  assert.equal(storeCreations, 1);
  assert.deepEqual(calls, ["routes", "slots", "capabilities"]);
});
test("failed registration retries without repeating already completed manifest steps", () => {
  let routeCalls = 0,
    slotCalls = 0;
  const session = createNativeSession(() => ({}), {
    routes: () => routeCalls++,
    slots: () => {
      if (++slotCalls === 1) throw Error("retry");
    },
  });
  assert.throws(() => session.prepare(), /retry/);
  session.prepare();
  assert.equal(routeCalls, 1);
  assert.equal(slotCalls, 2);
});
