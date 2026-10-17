import { hermesDirectiveFormatter } from "@hermes/components/assistant-ui/directive-text";
import { describe, expect, it } from "vitest";
import { detectTrigger } from "./text-utils";

describe("Hermes KronTerm widget mentions", () => {
    it("keeps widget references in the live @ completion scope", () => {
        expect(detectTrigger("inspect @widget:block-7")).toMatchObject({
            kind: "@",
            scope: "widget",
            value: "block-7",
        });
    });

    it("renders sent widget references as typed mention segments", () => {
        expect(hermesDirectiveFormatter.parse("Inspect @widget:block-7 next")).toEqual([
            { kind: "text", text: "Inspect " },
            { kind: "mention", type: "widget", label: "block-7", id: "block-7" },
            { kind: "text", text: " next" },
        ]);
    });
});

it("keeps app references as removable typed chips with a readable application name", () => {
    expect(detectTrigger("use @app:iTerm")).toMatchObject({ kind: "@", scope: "app", value: "iTerm" });
    expect(hermesDirectiveFormatter.parse("Use @app:com.apple.TextEdit|Text%20Edit next")).toEqual([
        { kind: "text", text: "Use " },
        { kind: "mention", type: "app", label: "Text Edit", id: "com.apple.TextEdit|Text%20Edit" },
        { kind: "text", text: " next" },
    ]);
});
