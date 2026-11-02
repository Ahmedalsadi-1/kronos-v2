import { describe, expect, it } from "vitest";
import { normalizeSections, parseAssignments, sectionRoster } from "./model";

describe("bot section organization", () => {
    it("preserves empty sections and roster order, with Unassigned last", () => {
        const bots = [{ name: "new" }, { name: "builder" }, { name: "research" }];
        const groups = sectionRoster(
            bots,
            { builder: { group: "Work" }, research: { group: "Work" } },
            {
                names: ["Empty", "Work"],
                collapsed: [],
            }
        );
        expect(groups).toEqual([
            { name: "Empty", bots: [] },
            { name: "Work", bots: [bots[1], bots[2]] },
            { name: "Unassigned", bots: [bots[0]] },
        ]);
    });
    it("sanitizes storage without accepting malformed names", () => {
        expect(
            normalizeSections({ names: [" Work ", "Work", "", 42, "Unassigned"], collapsed: ["Work", null] })
        ).toEqual({ names: ["Work"], collapsed: ["Work"], assignmentsText: undefined });
        expect(normalizeSections(null).names).toEqual([]);
    });
    it("accepts case-insensitive agent assignments and discovers new sections", () => {
        expect(parseAssignments('{"sections":["HQ"],"assign":{"ALICE":"Engineering","bob":"Unassigned"}}')).toEqual({
            sections: ["HQ", "Engineering"],
            assign: { alice: "Engineering", bob: "Unassigned" },
        });
    });
    it.each(["null", "[]", '{"sections":42}', '{"assign":[]}', '{"assign":{"bot":null}}', "not json"])(
        "rejects malformed assignments before applying any moves: %s",
        (text) => {
            expect(() => parseAssignments(text)).toThrow();
        }
    );
});
