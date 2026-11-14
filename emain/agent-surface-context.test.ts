import { expect, it } from "vitest";
import { attributeAgentSurfaceActivity, runWithAgentActivitySource } from "./agent-surface-context";

it("keeps concurrent child identities separate without leaking into unrelated callers", async () => {
    const activity = {
        source: "mcp",
        phase: "running",
        surface: "browser",
        action: "inspect",
        runid: "operation",
    } as const;
    const results = await Promise.all(
        ["child-a", "child-b"].map((id) =>
            runWithAgentActivitySource(
                "hermes",
                async () => {
                    await Promise.resolve();
                    return attributeAgentSurfaceActivity(activity);
                },
                id
            )
        )
    );
    expect(results.map((event) => event.sessionid)).toEqual(["child-a", "child-b"]);
    expect(results.map((event) => event.runid)).toEqual(["hermes:child-a", "hermes:child-b"]);
    expect(results.every((event) => event.id === "operation")).toBe(true);
    expect(attributeAgentSurfaceActivity(activity)).toEqual(activity);
});
