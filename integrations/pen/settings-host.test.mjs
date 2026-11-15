// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("./settings-host.js", import.meta.url), "utf8");
function make() {
  const config = new EventEmitter();
  config.data = {
    snapToObjects: true,
    smallNudge: 1,
    presentationZoom: 0,
    codeExportFormatter: "html-tailwind",
    claudeAutoPermissionMode: false,
  };
  const writes = [];
  config.set = (key, value) => {
    const previous = config.data[key];
    config.data[key] = value;
    writes.push([key, value]);
    config.emit("change", key, previous, value);
  };
  let frames = 0;
  const events = [];
  const scope = {};
  runInNewContext(source, scope);
  const settings = scope.createKronosPenSettings(
    {
      config,
      requestFrame: () => {
        frames++;
      },
    },
    (event) => events.push(event)
  );
  return { config, writes, events, settings, frames: () => frames };
}

test("reads and updates actual native config while omitting agent and security settings", () => {
  const host = make();
  const snapshot = host.settings.read();
  assert.equal(snapshot.scope, "desktop-profile");
  assert.equal(snapshot.values.snapToObjects, true);
  assert.equal(snapshot.values.claudeAutoPermissionMode, undefined);
  host.settings.update({ snapToObjects: false, smallNudge: 3 });
  assert.deepEqual(host.writes, [
    ["snapToObjects", false],
    ["smallNudge", 3],
  ]);
  assert.equal(host.events.at(-1).settings.values.smallNudge, 3);
  assert.equal(host.frames(), 1);
  host.settings.update({ smallNudge: 3 });
  assert.equal(host.writes.length, 2);
  host.settings.dispose();
  assert.equal(host.config.listenerCount("change"), 0);
});

test("validates an entire patch before changing native preferences", () => {
  const host = make();
  for (const patch of [
    { snapToObjects: false, claudeAutoPermissionMode: true },
    { smallNudge: NaN },
    { smallNudge: -1 },
    { presentationZoom: "fit" },
    { codeExportFormatter: "execute-script" },
    { snapToObjects: "true" },
  ])
    assert.throws(() => host.settings.update(patch), /Invalid canvas setting/);
  assert.equal(host.writes.length, 0);
  assert.equal(host.config.data.snapToObjects, true);
  host.settings.dispose();
});
