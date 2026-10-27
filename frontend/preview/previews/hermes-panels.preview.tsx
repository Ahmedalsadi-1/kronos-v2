import { AgentsView } from "@hermes/app/agents";
import { ArtifactsView } from "@hermes/app/artifacts";
import { ProjectTree } from "@hermes/app/right-sidebar/files/tree";
import { ReviewPane } from "@hermes/app/right-sidebar/review";
import { FileDiffPanel } from "@hermes/components/chat/diff-lines";
import { RootTooltipProvider } from "@hermes/components/ui/tooltip";
import { I18nProvider } from "@hermes/i18n";
import { $reviewFiles, $reviewIsRepo, $reviewSelectedPath, $reviewTreeMode } from "@hermes/store/review";
import "@hermes/styles.css";
import { ThemeProvider } from "@hermes/themes/context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { HashRouter } from "react-router";

const Client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

export function HermesPanelsPreview() {
    const [snapshot, setSnapshot] = useState<any>(null);
    const [error, setError] = useState("");
    const [panel, setPanel] = useState("Files");
    const [open, setOpen] = useState<Record<string, boolean>>({});
    useEffect(() => {
        fetch("/@fs/Users/albsheralsadi/kronterm/output/hermes-panels/repository-snapshot.json")
            .then((response) => response.json())
            .then((data) => {
                $reviewFiles.set(data.files);
                $reviewIsRepo.set(true);
                $reviewSelectedPath.set(null);
                $reviewTreeMode.set("tree");
                setOpen(
                    Object.fromEntries(data.tree.filter((entry) => entry.isDirectory).map((entry) => [entry.id, true]))
                );
                setSnapshot(data);
            })
            .catch((failure) => setError(String(failure)));
    }, []);

    return (
        <QueryClientProvider client={Client}>
            <I18nProvider>
                <ThemeProvider>
                    <RootTooltipProvider>
                        <HashRouter>
                            <div
                                data-hermes-app=""
                                className="fixed inset-x-0 bottom-0 top-10 flex flex-col bg-background p-6 text-foreground"
                            >
                                <h1 className="text-lg font-semibold">Hermes panel reference</h1>
                                <p className="mb-4 text-sm text-muted-foreground">
                                    Actual components with a local repository snapshot. Review controls are read-only.
                                </p>
                                <nav className="mb-5 flex gap-3" aria-label="Panel reference">
                                    {["Files", "Review tree", "Review list", "File diff", "Agents", "Artifacts"].map(
                                        (name) => (
                                            <button
                                                type="button"
                                                key={name}
                                                aria-pressed={panel === name}
                                                className="cursor-pointer border border-border px-4 py-2 text-sm focus-visible:outline-2"
                                                onClick={() => {
                                                    $reviewTreeMode.set(name === "Review list" ? "list" : "tree");
                                                    setPanel(name);
                                                }}
                                            >
                                                {name}
                                            </button>
                                        )
                                    )}
                                </nav>
                                <div
                                    className="min-h-0 flex-1 overflow-hidden border border-border"
                                    style={{
                                        width: ["Files", "Review tree", "Review list"].includes(panel) ? 430 : "100%",
                                    }}
                                >
                                    {!snapshot ? (
                                        <p role="status" className="p-4">
                                            {error || "Loading repository snapshot…"}
                                        </p>
                                    ) : panel === "Agents" ? (
                                        <AgentsView onClose={() => setPanel("Files")} />
                                    ) : panel === "Artifacts" ? (
                                        <ArtifactsView />
                                    ) : panel === "Files" ? (
                                        <div className="flex h-full flex-col">
                                            <div className="border-b border-border px-3 py-2 text-sm">
                                                frontend/hermes/app
                                            </div>
                                            <div className="flex min-h-0 flex-1 flex-col">
                                                <ProjectTree
                                                    cwd={snapshot.cwd}
                                                    data={snapshot.tree}
                                                    openState={open}
                                                    collapseNonce={0}
                                                    onActivateFile={() => {}}
                                                    onActivateFolder={() => {}}
                                                    onLoadChildren={() => {}}
                                                    onNodeOpenChange={(id, expanded) =>
                                                        setOpen((current) => ({ ...current, [id]: expanded }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                    ) : panel === "File diff" ? (
                                        <FileDiffPanel diff={snapshot.diff} path={snapshot.path} showLineNumbers />
                                    ) : (
                                        <div inert className="h-full">
                                            <ReviewPane standalone />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </HashRouter>
                    </RootTooltipProvider>
                </ThemeProvider>
            </I18nProvider>
        </QueryClientProvider>
    );
}
