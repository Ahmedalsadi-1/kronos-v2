// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { readJson, writeKey } from "@hermes/lib/storage";
import { atom } from "nanostores";

export type SectionState = { names: string[]; collapsed: string[]; assignmentsText?: string };
export type BotSection<T> = { name: string; bots: T[] };
export const UnassignedSection = "Unassigned";
const StorageKey = "hermes.bot-sections.v1";

export function normalizeSections(input: unknown): SectionState {
    const value = input as SectionState;
    const names = Array.isArray(value?.names)
        ? [...new Set(value.names.filter((name) => typeof name === "string").map((name) => name.trim()))].filter(
              (name) => name && name !== UnassignedSection
          )
        : [];
    return {
        names,
        collapsed: Array.isArray(value?.collapsed) ? value.collapsed.filter((name) => typeof name === "string") : [],
        assignmentsText: typeof value?.assignmentsText === "string" ? value.assignmentsText : undefined,
    };
}

export const $botSections = atom<SectionState>(normalizeSections(readJson(StorageKey)));

export function saveSections(next: SectionState) {
    const state = normalizeSections(next);
    $botSections.set(state);
    writeKey(StorageKey, JSON.stringify(state));
}

export function sectionRoster<T extends { name: string }>(
    bots: T[],
    meta: Record<string, { group?: string }>,
    state: SectionState
): BotSection<T>[] {
    const names = [
        ...new Set([
            ...state.names,
            ...Object.values(meta)
                .map((item) => item?.group?.trim())
                .filter(Boolean),
        ]),
    ].filter((name) => name !== UnassignedSection);
    return [...names, UnassignedSection].map((name) => ({
        name,
        bots: bots.filter((bot) => (meta[bot.name]?.group?.trim() || UnassignedSection) === name),
    }));
}

export function parseAssignments(text: string): { sections: string[]; assign: Record<string, string> } {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an assignments object.");
    if (
        value.sections != null &&
        (!Array.isArray(value.sections) || value.sections.some((name) => typeof name !== "string"))
    )
        throw new Error("Sections must be names.");
    if (value.assign != null && (typeof value.assign !== "object" || Array.isArray(value.assign)))
        throw new Error("Assignments must map bot names to sections.");
    const assign: Record<string, string> = Object.create(null);
    for (const [bot, section] of Object.entries(value.assign ?? {})) {
        if (typeof section !== "string" || !section.trim()) throw new Error("An assignment needs a section name.");
        assign[bot.toLowerCase()] = section.trim();
    }
    return {
        sections: normalizeSections({ names: [...(value.sections ?? []), ...Object.values(assign)] }).names,
        assign,
    };
}
