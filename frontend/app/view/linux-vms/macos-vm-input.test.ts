// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, it, vi } from "vitest";
import { macVmCharacterKeysym, registerMacVmTextTarget, sendMacVmKeyChord, typeMacVmText } from "./macos-vm-input";

it("scopes guest typing to the connected block and removes disconnected targets", async () => {
    const target = vi.fn(async () => {});
    const unregister = registerMacVmTextTarget("vm-1", target);
    await typeMacVmText("vm-1", "Hello", 0);
    expect(target).toHaveBeenCalledWith("Hello", 0);
    await expect(typeMacVmText("vm-2", "Hello")).rejects.toThrow("not connected");
    unregister();
    await expect(typeMacVmText("vm-1", "Hello")).rejects.toThrow("not connected");
});

it("routes Spotlight to the guest and rejects unknown keys before holding modifiers", () => {
    const send = vi.fn();
    sendMacVmKeyChord(["Meta", "Space"], send);
    expect(send.mock.calls).toEqual([
        [0xffeb, true],
        [32, true],
        [32, false],
        [0xffeb, false],
    ]);
    send.mockClear();
    expect(() => sendMacVmKeyChord(["Meta", "unknown"], send)).toThrow("Unsupported");
    expect(send).not.toHaveBeenCalled();
});

it("does not unregister a replacement connection and maps Unicode and control keys", async () => {
    const stale = registerMacVmTextTarget("vm-3", async () => {});
    const target = vi.fn(async () => {});
    const unregister = registerMacVmTextTarget("vm-3", target);
    stale();
    await typeMacVmText("vm-3", "a");
    expect(target).toHaveBeenCalled();
    unregister();
    expect(macVmCharacterKeysym("A")).toBe(65);
    expect(macVmCharacterKeysym("\n")).toBe(0xff0d);
    expect(macVmCharacterKeysym("\t")).toBe(0xff09);
    expect(macVmCharacterKeysym("\u{1f600}")).toBe(0x0101f600);
});
