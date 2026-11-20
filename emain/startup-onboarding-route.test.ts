// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import { isStartupWelcomeFrame } from "./startup-onboarding-route";

const Entry = "http://kronos-setup.invalid/aside-demo/";

it("accepts the welcome screen after selecting a slideshow image", () => {
    expect(isStartupWelcomeFrame(Entry + "?art=iphone#welcome", Entry)).toBe(true);
});

it.each([
    "http://untrusted.invalid/aside-demo/#welcome",
    "http://kronos-setup.invalid/other/#welcome",
    Entry + "#import",
    "not a URL",
])("rejects sign-in requests outside the welcome route: %s", (url) => {
    expect(isStartupWelcomeFrame(url, Entry)).toBe(false);
});
