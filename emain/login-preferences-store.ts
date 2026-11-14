// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { safeStorage } from "electron";
import { join } from "node:path";
import { DATA_DIR } from "./linux-desktop/upstream/openmaus/kronterm-adapter";
import { LoginPreferences } from "./login-preferences";

export function getLoginPreferences(): LoginPreferences {
    return new LoginPreferences(join(DATA_DIR, "login-preferences.secure"), {
        encode: (value) => {
            if (!safeStorage.isEncryptionAvailable() || (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text"))
                throw new Error("OS secure storage is unavailable. Continue without remembering this account.");
            return safeStorage.encryptString(value).toString("base64");
        },
        decode: (value) => {
            try { return safeStorage.decryptString(Buffer.from(value, "base64")); }
            catch { throw new Error("Remembered login policies could not be unlocked. They cannot authorize automatic sign-in."); }
        },
    });
}
