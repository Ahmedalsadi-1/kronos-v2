import { PreviewPane } from "@hermes/app/chat/right-rail/preview-pane";
import { localPreviewTarget, normalizeOrLocalPreviewTarget } from "@hermes/lib/local-preview";
import type { PreviewTarget } from "@hermes/store/preview";
import { useEffect, useState } from "react";
import { KrontermFileEditor } from "./kronterm-file-editor";

export function KrontermFilePreview({
    path,
    onDirtyChange,
}: {
    path: string;
    onDirtyChange: (dirty: boolean) => void;
}) {
    const [target, setTarget] = useState<PreviewTarget>(() => localPreviewTarget(path));
    const [error, setError] = useState("");
    const renderable = target && ["html", "image", "pdf"].includes(target.previewKind);

    useEffect(() => {
        if (!renderable) return;
        let active = true;
        void normalizeOrLocalPreviewTarget(path)
            .then((next) => {
                if (active && next) setTarget(next);
            })
            .catch((reason) => {
                if (active) setError(String(reason));
            });
        return () => {
            active = false;
        };
    }, [path, renderable]);

    if (error) return <p role="alert">{error}</p>;
    if (renderable) return <PreviewPane tabId={`inspector:${path}`} target={target} />;
    return <KrontermFileEditor path={path} onDirtyChange={onDirtyChange} />;
}
