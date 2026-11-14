import { describe, expect, it } from "vitest";

import { getKronTermSettingsSectionId, makeKronTermSettingsViewId } from "./kronterm-settings-host";

describe("KronOS settings routes", () => {
    it("round-trips a native settings section through the Kronos route", () => {
        const viewId = makeKronTermSettingsViewId("desktop");

        expect(viewId).toBe("kronterm:desktop");
        expect(getKronTermSettingsSectionId(viewId)).toBe("desktop");
    });

    it("does not treat Kronos settings as KronOS settings", () => {
        expect(getKronTermSettingsSectionId("config:model")).toBeNull();
    });
});
