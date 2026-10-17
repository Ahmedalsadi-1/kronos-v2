// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    BrowserAnnotationCommentMaxLength,
    displayWebviewUrl,
    elementLabelForSelection,
    formatAnnotationPrompt,
    formatAnnotationsBundle,
    makeBrowserAnnotation,
    type BrowserAnnotation,
} from "./browser-annotations";
import type { AgentWidgetDesignSelection } from "@/app/view/agent-widget-bridge";

function makeSelection(overrides: Partial<AgentWidgetDesignSelection["element"]> = {}): AgentWidgetDesignSelection {
    return {
        blockId: "block-1",
        url: "https://example.com/page",
        element: {
            ref: "e3",
            role: "button",
            name: "Submit",
            value: "",
            x: 10,
            y: 20,
            width: 80,
            height: 24,
            focusable: true,
            visible: true,
            ...overrides,
        },
    };
}

describe("elementLabelForSelection", () => {
    it("labels by tag and accessible name", () => {
        expect(elementLabelForSelection(makeSelection({ tagName: "BUTTON" }))).toBe('BUTTON "Submit"');
    });

    it("falls back to role when no tag name is present", () => {
        expect(elementLabelForSelection(makeSelection())).toBe('button "Submit"');
    });

    it("prefixes the component name when known", () => {
        expect(elementLabelForSelection(makeSelection({ componentName: "SignupForm" }))).toBe(
            'SignupForm button "Submit"'
        );
    });

    it("uses the value when the name is empty", () => {
        expect(elementLabelForSelection(makeSelection({ name: "", value: "Go" }))).toBe('button "Go"');
    });
});

describe("makeBrowserAnnotation", () => {
    it("trims and caps the comment", () => {
        const annotation = makeBrowserAnnotation(makeSelection(), `  ${"x".repeat(3000)}  `, "fix");
        expect(annotation.comment).toHaveLength(BrowserAnnotationCommentMaxLength);
        expect(annotation.intent).toBe("fix");
        expect(annotation.elementLabel).toBe('button "Submit"');
    });
});

describe("formatAnnotationPrompt", () => {
    it("renders intent, selector, page, and comment", () => {
        const annotation: BrowserAnnotation = {
            id: "a1",
            blockId: "block-1",
            url: "https://example.com/page",
            comment: "make this primary",
            intent: "change",
            priority: "suggestion",
            createdAt: 0,
            elementLabel: 'button "Submit"',
            selector: "#submit",
        };
        expect(formatAnnotationPrompt(annotation)).toBe(
            '[change] button "Submit"\n  selector: #submit\n  page: https://example.com/page\n  comment: make this primary'
        );
    });
});

describe("formatAnnotationsBundle", () => {
    it("bundles annotations under a page header", () => {
        const annotation = makeBrowserAnnotation(makeSelection(), "typo", "question");
        const bundle = formatAnnotationsBundle("https://example.com/page", [annotation]);
        expect(bundle).toContain("Browser annotations for https://example.com/page (1)");
        expect(bundle).toContain('[question] button "Submit"');
    });
});

describe("displayWebviewUrl", () => {
    it("shows the full URL while focused", () => {
        expect(displayWebviewUrl("https://example.com/a?b=1", true)).toBe("https://example.com/a?b=1");
    });

    it("strips the scheme and trailing slash when unfocused", () => {
        expect(displayWebviewUrl("https://example.com/", false)).toBe("example.com");
        expect(displayWebviewUrl("http://localhost:3000/app", false)).toBe("localhost:3000/app");
    });

    it("leaves non-hierarchical URLs alone", () => {
        expect(displayWebviewUrl("about:blank", false)).toBe("about:blank");
    });
});
