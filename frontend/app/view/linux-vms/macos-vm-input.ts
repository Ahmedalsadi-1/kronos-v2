// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const TextTargets = new Map<
    string,
    { type: (text: string, delayMs: number) => Promise<void>; press?: (keys: string[]) => void }
>();

export function registerMacVmTextTarget(
    blockId: string,
    type: (text: string, delayMs: number) => Promise<void>,
    press?: (keys: string[]) => void
) {
    const target = { type, press };
    TextTargets.set(blockId, target);
    return () => {
        if (TextTargets.get(blockId) === target) TextTargets.delete(blockId);
    };
}

export async function typeMacVmText(blockId: string, text: string, delayMs = 0): Promise<void> {
    const target = TextTargets.get(blockId);
    if (!target) throw new Error("The macOS VM display is not connected");
    await target.type(text, delayMs);
}

export function pressMacVmKeys(blockId: string, keys: string[]): void {
    const target = TextTargets.get(blockId);
    if (!target?.press) throw new Error("The macOS VM display is not connected");
    target.press(keys);
}

export function sendMacVmKeyChord(keys: string[], send: (keysym: number, down: boolean) => void): void {
    const names: Record<string, number> = {
        meta: 0xffeb,
        command: 0xffeb,
        cmd: 0xffeb,
        super: 0xffeb,
        commandorcontrol: 0xffeb,
        cmdorctrl: 0xffeb,
        control: 0xffe3,
        ctrl: 0xffe3,
        shift: 0xffe1,
        alt: 0xffe9,
        option: 0xffe9,
        enter: 0xff0d,
        return: 0xff0d,
        escape: 0xff1b,
        esc: 0xff1b,
        tab: 0xff09,
        backspace: 0xff08,
        delete: 0xffff,
        space: 32,
        arrowleft: 0xff51,
        left: 0xff51,
        arrowup: 0xff52,
        up: 0xff52,
        arrowright: 0xff53,
        right: 0xff53,
        arrowdown: 0xff54,
        down: 0xff54,
        home: 0xff50,
        end: 0xff57,
        pageup: 0xff55,
        pagedown: 0xff56,
    };
    if (!keys.length) throw new Error("A guest key is required");
    const symbols = keys.map((key) => {
        if (names[key.toLowerCase()] != null) return names[key.toLowerCase()];
        const functionKey = /^f([1-9]|1[0-2])$/i.exec(key);
        if (functionKey) return 0xffbd + Number(functionKey[1]);
        if ([...key].length === 1) return macVmCharacterKeysym(key);
        throw new Error(`Unsupported macOS guest key: ${key}`);
    });
    const held: number[] = [];
    try {
        for (const symbol of symbols) {
            held.push(symbol);
            send(symbol, true);
        }
    } finally {
        for (const symbol of held.reverse()) send(symbol, false);
    }
}

export function macVmCharacterKeysym(character: string): number {
    if (character === "\n" || character === "\r") return 0xff0d;
    if (character === "\t") return 0xff09;
    const codepoint = character.codePointAt(0);
    return codepoint <= 0xff ? codepoint : 0x01000000 + codepoint;
}
