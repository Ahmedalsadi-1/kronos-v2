// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { patchPenMiniChat } from "./patch-runtime.mjs";

const spotlight = `function m6({chatManager:e,sidebar:Z,minimized:z,corner:em,conversation:A}){
  const N={allSupportedModels:[]}, S=true, O=()=>{};
  return (0,D.jsx)("div",{"data-agent-spotlight":!0,onBlurCapture:e=>{
    e.currentTarget.contains(e.relatedTarget)||O(!1)},children:[S&&z]});
}`;

test("the mini chat uses the active transcript above a visible bottom-center composer", () => {
  const render = runInNewContext(patchPenMiniChat(spotlight) + "\nm6", {
    D: { jsx: (type, props, key) => ({ type, props, key }) },
    window: { __kronosSubmitAgent() {} },
  });
  const chatManager = {};
  const conversation = { id: "design-chat", messages: [{ role: "user", text: "Draw" }] };
  const state = { chatManager, conversation, corner: "bottom-center" };
  const miniChat = render(state).props.children[0];
  assert.equal(miniChat.type.name, "KronosMiniChat");
  assert.equal(miniChat.key, conversation.id);
  assert.equal(miniChat.props.conversation, conversation);
  assert.equal(miniChat.props.manager, chatManager);
  for (const changes of [
    { sidebar: true },
    { minimized: true },
    { corner: "bottom-left" },
    { conversation: { ...conversation, messages: [] } },
    { conversation: undefined },
  ]) {
    assert.ok(!render({ ...state, ...changes }).props.children[0]);
  }
});

test("the patch leaves unrelated chunks alone and rejects unexpected spotlight markup", () => {
  assert.equal(patchPenMiniChat("const unrelated = true;"), "const unrelated = true;");
  assert.throws(() => patchPenMiniChat(spotlight.replace("children:[S&&z]", "children:[]")), /composer changed/);
  assert.throws(() => patchPenMiniChat(patchPenMiniChat(spotlight)), /already staged/);
});
