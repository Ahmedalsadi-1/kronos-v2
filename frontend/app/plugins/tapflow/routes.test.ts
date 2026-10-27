import { describe, expect, it } from "vitest";
import { tapflowOrigin, tapflowSessionUrl } from "./routes";

describe("Tapflow relay routing", () => {
    it("normalizes relay origins and keeps session IDs intact", () => {
        expect(tapflowOrigin("http://localhost:4000/")).toBe("http://localhost:4000");
        expect(tapflowSessionUrl("https://relay.example", "/automation/sessions/ios-123_abc")).toBe(
            "https://relay.example/automation/sessions/ios-123_abc"
        );
    });
    it.each([
        "javascript:alert(1)",
        "https://user:secret@relay.example",
        "https://relay.example/?token=secret",
        "https://relay.example/path",
    ])("rejects invalid relay %s", (value) => {
        expect(() => tapflowOrigin(value)).toThrow();
    });
    it.each([
        "https://another.example/automation/sessions/123",
        "/settings/tokens",
        "/automation/sessions/123?token=secret",
        "//another.example/automation/sessions/123",
        "/automation/sessions/../tokens",
    ])("rejects invalid session %s", (value) => {
        expect(() => tapflowSessionUrl("https://relay.example", value)).toThrow();
    });
});
