import { KrontermFileEditor } from "@hermes/app/contrib/kronterm-file-editor";
import { RootTooltipProvider } from "@hermes/components/ui/tooltip";
import { I18nProvider } from "@hermes/i18n";
import "@hermes/styles.css";
import { ThemeProvider } from "@hermes/themes/context";
import { useState } from "react";

let SavedSource = "export function greet(name: string) {\n    return `Hello, ${name}`;\n}\n";

export function HermesFileEditorPreview() {
    const [dirty, setDirty] = useState(false);
    window.hermesDesktop = {
        ...window.hermesDesktop,
        api: async (request) => {
            if (request.path === "/api/fs/write-text") {
                SavedSource = String((request.body as { content: string }).content);
                return { path: "/demo/greeting.ts", ok: true } as any;
            }
            return { path: "/demo/greeting.ts", text: SavedSource } as any;
        },
    };
    return (
        <I18nProvider>
            <ThemeProvider>
                <RootTooltipProvider>
                    <div
                        data-hermes-app=""
                        className="fixed bottom-0 right-0 top-10 flex w-[480px] flex-col border-l border-border bg-background text-foreground"
                    >
                        <div className="border-b border-border px-3 py-3 text-sm">greeting.ts{dirty ? " •" : ""}</div>
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                            Editor preview. Save writes to memory only.
                        </p>
                        <div className="min-h-0 flex-1">
                            <KrontermFileEditor path="/demo/greeting.ts" onDirtyChange={setDirty} />
                        </div>
                    </div>
                </RootTooltipProvider>
            </ThemeProvider>
        </I18nProvider>
    );
}
