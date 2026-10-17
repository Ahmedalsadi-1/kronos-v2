// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export type HermesSelection = {
    text: string;
    target: "current" | "new";
    images?: { filename: string; dataUrl: string }[];
};
