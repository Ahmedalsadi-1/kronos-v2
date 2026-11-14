// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Button as KronOSButton } from "@/app/components/ui/button";
import { Button as LegacyButton } from "@/app/element/button";
import { Button as HermesButton } from "@hermes/components/ui/button";
import { useState } from "react";

const Variants = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const Buttons = [
    ["Hermes", HermesButton],
    ["KronOS", KronOSButton],
    ["Legacy", LegacyButton],
] as const;

export function SharedButtonsPreview() {
    const [count, setCount] = useState(0);
    return (
        <main className="min-h-screen bg-background text-foreground p-6 pt-20">
            <h1 className="text-xl mb-2">Shared buttons</h1>
            <p className="mb-8 text-muted-foreground">Hermes sizing and variants across KronOS. Actions: {count}</p>
            <div className="flex flex-col gap-8">
                {Buttons.map(([label, Button]) => (
                    <section key={label}>
                        <h2 className="text-sm mb-3">{label}</h2>
                        <div className="flex flex-wrap items-center gap-3">
                            {Variants.map((variant) => (
                                <Button key={variant} variant={variant} onClick={() => setCount((value) => value + 1)}>
                                    {variant}
                                </Button>
                            ))}
                            <Button disabled>Disabled</Button>
                        </div>
                    </section>
                ))}
            </div>
        </main>
    );
}
