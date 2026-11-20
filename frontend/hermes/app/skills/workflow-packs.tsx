import { queryClient } from "@hermes/lib/query-client";
import { invalidateSlashCompletions } from "@hermes/lib/slash-completion-cache";
import { notify, notifyError } from "@hermes/store/notifications";
import { reloadInstalledSkills } from "@hermes/store/reload-installed-skills";
import { useState } from "react";

const WorkflowPacks = [
    {
        id: "diagram-design",
        name: "Diagram Design",
        skill: "diagram-design",
        repo: "cathrynlavery/diagram-design",
        revision: "f4547ee95f88e5b28a52517feff6b6c11cc657f9",
        source: "skills/diagram-design",
        description: "Create diagrams with project-specific typography and colors.",
        license: "MIT",
    },
    {
        id: "product-management",
        name: "Product management",
        skill: "kw-product-management",
        repo: "anthropics/knowledge-work-plugins",
        revision: "ae1513ea94dcb74a7f1505ddcf3b0ec3fab327f1",
        source: "product-management",
        description: "Explicitly invoke adapted research, requirements, and planning workflows.",
        license: "Apache 2.0",
    },
    {
        id: "productivity",
        name: "Productivity",
        skill: "kw-productivity",
        repo: "anthropics/knowledge-work-plugins",
        revision: "ae1513ea94dcb74a7f1505ddcf3b0ec3fab327f1",
        source: "productivity",
        description: "Explicitly invoke adapted task and knowledge-management workflows.",
        license: "Apache 2.0",
    },
];

export function WorkflowPacksPicker({
    installedNames,
    profile,
}: {
    installedNames: ReadonlySet<string>;
    profile?: string | null;
}) {
    const [selected, setSelected] = useState<string>();
    const [reviewed, setReviewed] = useState(false);
    const [installing, setInstalling] = useState(false);
    const pack = WorkflowPacks.find((item) => item.id === selected);
    const install = async () => {
        if (!pack || !reviewed || installing) return;
        setInstalling(true);
        try {
            await window.hermesDesktop.api({
                path: "/api/kronterm/workflow-packs/install",
                method: "POST",
                body: { pack: pack.id, reviewed: true },
                profile,
                timeoutMs: 135_000,
            });
            await queryClient.invalidateQueries({ queryKey: ["skills-list"] });
            await reloadInstalledSkills(profile);
            invalidateSlashCompletions();
            notify({
                kind: "success",
                title: `${pack.name} installed`,
                message: "Skills reloaded and ready to use. Use the controls above to enable or disable them.",
            });
            setSelected(undefined);
        } catch (error) {
            notifyError(error, "Workflow pack installation failed");
        } finally {
            setInstalling(false);
        }
    };
    return (
        <section
            className="shrink-0 border-t border-(--ui-stroke-secondary) px-3 py-2"
            aria-label="Optional workflow packs"
        >
            <details>
                <summary className="cursor-pointer text-sm">Optional workflow packs</summary>
                <p className="my-2 text-xs text-(--ui-text-secondary)">
                    Pinned upstream skills for this profile. Requires Python 3 and Git. Connectors and hooks are never
                    installed.
                </p>
                {WorkflowPacks.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 py-2">
                        <div>
                            <span className="text-sm">{item.name}</span>
                            <p className="text-xs text-(--ui-text-secondary)">{item.description}</p>
                        </div>
                        <button
                            className="cursor-pointer text-sm underline"
                            disabled={installing || installedNames.has(item.skill)}
                            onClick={() => {
                                setSelected(item.id);
                                setReviewed(false);
                            }}
                        >
                            {installedNames.has(item.skill) ? "Installed" : "Review"}
                        </button>
                    </div>
                ))}
                {pack && (
                    <div className="mt-2 border-t border-(--ui-stroke-secondary) pt-2 text-xs">
                        <a
                            className="cursor-pointer underline"
                            href={`https://github.com/${pack.repo}/tree/${pack.revision}/${pack.source}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Review {pack.name} source and {pack.license} license
                        </a>
                        <p className="my-2 break-all">Revision: {pack.revision}</p>
                        <label className="flex cursor-pointer items-center gap-2">
                            <input
                                type="checkbox"
                                checked={reviewed}
                                disabled={installing}
                                onChange={(event) => setReviewed(event.target.checked)}
                            />
                            I reviewed the pinned instructions and license.
                        </label>
                        <button
                            className="mt-2 cursor-pointer underline"
                            disabled={!reviewed || installing}
                            onClick={() => void install()}
                        >
                            {installing ? "Installing into this profile…" : "Install into this profile"}
                        </button>
                    </div>
                )}
            </details>
        </section>
    );
}
