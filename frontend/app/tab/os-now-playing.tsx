// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import type { MediaCommand, NowPlayingState } from "@/types/now-playing";
import { Music2, Pause, Play, SkipBack, SkipForward } from "@/app/components/system-ui/os-icons";
import { useEffect, useState } from "react";

export function useOSNowPlaying() {
    const [state, setState] = useState<NowPlayingState>();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        let disposed = false;
        let timer: ReturnType<typeof setTimeout>;
        const refresh = async () => {
            try {
                const next = await getApi().getNowPlaying();
                if (!disposed) setState(next);
            } catch {
                if (!disposed) setState(undefined);
            } finally {
                if (!disposed) timer = setTimeout(refresh, 2000);
            }
        };
        void refresh();
        return () => {
            disposed = true;
            clearTimeout(timer);
        };
    }, []);
    const control = async (command: MediaCommand) => {
        if (!state || pending) return;
        setPending(true);
        setError("");
        try {
            setState(await getApi().controlNowPlaying(state.id, command));
        } catch {
            setError("Playback control unavailable. Try in the source app.");
        } finally {
            setPending(false);
        }
    };
    return { state, pending, error, control };
}

export function OSNowPlayingCard({ state, pending, error, control }: ReturnType<typeof useOSNowPlaying>) {
    if (!state?.playing || state.muted) return null;
    return (
        <section className="os-now-playing" aria-label="Now Playing" data-playing={state.playing}>
            <div className="os-media-heading">
                <span className="os-media-art" aria-hidden="true">
                    <Music2 />
                </span>
                <div className="os-media-track">
                    <strong title={state.title}>{state.title}</strong>
                    <span title={state.artist}>{state.artist || state.source}</span>
                </div>
                <span className="os-media-meter" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                </span>
            </div>
            <div className="os-media-controls">
                <span>{state.source}</span>
                {state.canSkip && (
                    <button
                        type="button"
                        aria-label="Previous track"
                        disabled={pending}
                        onClick={() => void control("previous")}
                    >
                        <SkipBack />
                    </button>
                )}
                <button
                    type="button"
                    className="os-media-play"
                    aria-label={state.playing ? "Pause media" : "Play media"}
                    disabled={pending}
                    onClick={() => void control("toggle")}
                >
                    {state.playing ? <Pause /> : <Play />}
                </button>
                {state.canSkip && (
                    <button
                        type="button"
                        aria-label="Next track"
                        disabled={pending}
                        onClick={() => void control("next")}
                    >
                        <SkipForward />
                    </button>
                )}
            </div>
            {error && <p role="status">{error}</p>}
        </section>
    );
}
