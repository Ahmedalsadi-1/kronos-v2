import assert from "node:assert/strict";
import { test } from "node:test";
import { isToolAllowedBySurfaceCapability } from "../src/surface-policy.js";

test("parent and inherited hybrid workers can observe and control devices without widening exclusive scopes", () => {
    for (const name of ["device_list", "device_observe", "device_step", "device_pick_element"]) {
        const parent = { hostMode: "kronterm", sandboxComputerId: "vm", sandboxComputerMode: "hybrid" } as any;
        assert.equal(isToolAllowedBySurfaceCapability(name, parent), true);
        assert.equal(isToolAllowedBySurfaceCapability(name, { ...parent, delegationScope: "inherit" }), true);
        assert.equal(isToolAllowedBySurfaceCapability(name, { ...parent, delegationScope: "sandbox" }), false);
        assert.equal(isToolAllowedBySurfaceCapability(name, { ...parent, delegationScope: "widgets" }), false);
        assert.equal(isToolAllowedBySurfaceCapability(name, { ...parent, sandboxComputerMode: "sandbox" }), false);
    }
});
