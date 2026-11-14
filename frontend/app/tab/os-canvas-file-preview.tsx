// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { classifyMedia } from "@/app/view/medialibrary/media-library-utils";
import { getWebServerEndpoint } from "@/util/endpoints";
import { base64ToString } from "@/util/util";
import { formatRemoteUri } from "@/util/waveutil";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MaxPreviewBytes = 8192;
const MarkdownPlugins = [remarkGfm];
type FilePreview =
    | { kind: "image" | "video" | "audio"; url: string; name: string }
    | { kind: "text" | "markdown"; text: string; truncated: boolean }
    | { kind: "status"; text: string };

export function OSCanvasFilePreview({ path, localFile, onOpen }: { path: string; localFile?: File; onOpen: () => void }) {
    const element = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
    const [preview, setPreview] = useState<FilePreview>({ kind: "status", text: "Loading preview…" });

    useEffect(() => {
        if (localFile || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            setVisible(true);
            observer.disconnect();
        });
        observer.observe(element.current);
        return () => observer.disconnect();
    }, [localFile]);

    useEffect(() => {
        if (!visible && !localFile) return;
        let active = true;
        let objectUrl: string;
        const remotePath = formatRemoteUri(path, "local");
        const name = localFile?.name || path.split(/[\\/]/).pop();
        const endpoint = getWebServerEndpoint();
        const streamUrl = endpoint && `${endpoint}/wave/stream-file?${new URLSearchParams({ path: remotePath })}`;
        const load = async (): Promise<FilePreview | undefined> => {
            const initialKind = classifyMedia({ path, mimetype: localFile?.type, isdir: false });
            if (initialKind === "image" || initialKind === "video" || initialKind === "audio") {
                if (localFile && typeof URL.createObjectURL === "function") objectUrl = URL.createObjectURL(localFile);
                if (objectUrl || streamUrl) return { kind: initialKind, name, url: objectUrl || streamUrl };
            }
            if (localFile && (localFile.type.startsWith("text/") || /\.(?:txt|mdx?|markdown)$/i.test(path))) {
                const content = await localFile.slice(0, MaxPreviewBytes).text();
                return content
                    ? { kind: /\.(?:mdx?|markdown)$/i.test(path) ? "markdown" : "text", text: content, truncated: localFile.size > MaxPreviewBytes }
                    : { kind: "status", text: "Empty file" };
            }
            const info = await RpcApi.FileInfoCommand(TabRpcClient, { info: { path: remotePath } });
            if (info?.notfound || info?.staterror || !info) return { kind: "status", text: "File unavailable" };
            if (info.isdir) return { kind: "status", text: "Open folder to browse" };
            const mime = info.mimetype ?? "";
            const kind = mime.split("/")[0];
            if (streamUrl && (kind === "image" || kind === "video" || kind === "audio")) {
                return {
                    kind,
                    name: info.name || name,
                    url: streamUrl,
                };
            }
            const markdown = mime.startsWith("text/markdown") || /\.mdx?$/i.test(path);
            const text = markdown || mime.startsWith("text/") || /^(application\/(?:json|yaml|toml|xml))\b/.test(mime);
            if (!text) return { kind: "status", text: "Open file to view" };
            if (!active) return;
            const data = await RpcApi.FileReadCommand(TabRpcClient, {
                info: { path: remotePath },
                at: { offset: 0, size: MaxPreviewBytes },
            });
            const content = data?.data64 ? base64ToString(data.data64) : "";
            if (!content) return { kind: "status", text: "Empty file" };
            return { kind: markdown ? "markdown" : "text", text: content, truncated: info.size > MaxPreviewBytes };
        };
        void load().then(
            (result) => {
                if (active && result) setPreview(result);
            },
            () => {
                if (active) setPreview({ kind: "status", text: "Preview unavailable" });
            }
        );
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [path, localFile, visible]);

    return (
        <div
            ref={element}
            className={`os-canvas-file-preview is-${preview.kind}`}
            onDoubleClick={preview.kind === "video" || preview.kind === "audio" ? undefined : onOpen}
            onWheel={(event) => {
                const node = event.currentTarget;
                if (!event.ctrlKey && !event.metaKey && node.scrollHeight > node.clientHeight) event.stopPropagation();
            }}
        >
            {preview.kind === "image" && (
                <img
                    src={preview.url}
                    alt={preview.name}
                    loading="lazy"
                    draggable={false}
                    onError={() => setPreview({ kind: "status", text: "Image unavailable" })}
                />
            )}
            {preview.kind === "video" && (
                <video
                    controls
                    playsInline
                    preload="metadata"
                    src={preview.url}
                    aria-label={preview.name}
                    data-canvas-shortcuts="ignore"
                    onError={() => setPreview({ kind: "status", text: "Video unavailable" })}
                />
            )}
            {preview.kind === "audio" && (
                <audio
                    controls
                    preload="none"
                    src={preview.url}
                    aria-label={preview.name}
                    data-canvas-shortcuts="ignore"
                    onError={() => setPreview({ kind: "status", text: "Audio unavailable" })}
                />
            )}
            {preview.kind === "markdown" && (
                <ReactMarkdown remarkPlugins={MarkdownPlugins} skipHtml disallowedElements={["a", "img"]} unwrapDisallowed>
                    {preview.text}
                </ReactMarkdown>
            )}
            {preview.kind === "text" && <pre>{preview.text}</pre>}
            {(preview.kind === "text" || preview.kind === "markdown") && preview.truncated && (
                <small>Open the file to read the rest.</small>
            )}
            {preview.kind === "status" && <span role="status">{preview.text}</span>}
        </div>
    );
}
