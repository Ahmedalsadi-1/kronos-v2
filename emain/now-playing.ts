// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { webContents } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MediaCommand, NowPlayingState } from "../frontend/types/now-playing";

const ExecFile = promisify(execFile);
const NativePlayers = [
    { id: "com.spotify.client", source: "Spotify" },
    { id: "com.apple.Music", source: "Music" },
];
const BrowserMediaScript = `(() => {
    const media = [...document.querySelectorAll('audio,video')].find(m => !m.paused && !m.ended)
        ?? [...document.querySelectorAll('audio,video')].find(m => m.currentTime > 0 && !m.ended);
    if (!media) return null;
    const metadata = navigator.mediaSession?.metadata;
    return { title: metadata?.title || document.title || 'Browser media', artist: metadata?.artist || '',
        playing: !media.paused && !media.ended, muted: media.muted || media.volume === 0 };
})()`;
let Current: NowPlayingState;
let LastRead = 0;
let Pending: Promise<NowPlayingState>;

async function withMediaTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error("Media source did not respond")), 1200);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function readNativePlayer(player: (typeof NativePlayers)[number]): Promise<NowPlayingState> {
    const { stdout } = await ExecFile(
        "/usr/bin/osascript",
        [
            "-e",
            `
        if application id "${player.id}" is running then
            tell application id "${player.id}"
                if player state is stopped then return ""
                return (player state as text) & linefeed & (name of current track) & linefeed & (artist of current track)
            end tell
        end if
        return ""
    `,
        ],
        { timeout: 1800, maxBuffer: 16384 }
    );
    const [status, title, ...artist] = stdout.trim().split("\n");
    if (!title) return;
    return {
        id: player.id,
        source: player.source,
        title: title.slice(0, 512),
        artist: artist.join(" ").slice(0, 512),
        playing: status === "playing",
        canSkip: true,
    };
}

async function readNowPlaying(): Promise<NowPlayingState> {
    const native =
        process.platform === "darwin"
            ? (
                  await Promise.all(NativePlayers.map((player) => readNativePlayer(player).catch(() => undefined)))
              ).filter(Boolean)
            : [];
    const playingNative = native.find((player) => player.playing);
    if (playingNative) return playingNative;
    const guests = webContents
        .getAllWebContents()
        .filter((guest) => !guest.isDestroyed() && guest.getType() === "webview");
    guests.sort((a, b) => Number(b.isCurrentlyAudible()) - Number(a.isCurrentlyAudible()));
    const browser = (
        await Promise.all(
            guests.map(async (guest): Promise<NowPlayingState> => {
                try {
                    const value = await withMediaTimeout(guest.executeJavaScript(BrowserMediaScript));
                    if (!value || typeof value.title !== "string" || typeof value.artist !== "string") return;
                    return {
                        id: `web:${guest.id}`,
                        source: "Browser",
                        title: value.title.slice(0, 512),
                        artist: value.artist.slice(0, 512),
                        playing: value.playing === true,
                        muted: value.muted === true || guest.isAudioMuted(),
                        canSkip: false,
                    };
                } catch {
                    /* A navigating or sandboxed guest may be unavailable. */
                }
            })
        )
    ).filter(Boolean);
    return (
        browser.find((player) => player.playing) ??
        native.find((player) => player.id === Current?.id) ??
        native[0] ??
        browser.find((player) => player.id === Current?.id) ??
        browser[0]
    );
}

export async function getNowPlaying(): Promise<NowPlayingState> {
    if (Pending) return Pending;
    if (Date.now() - LastRead < 1500) return Current;
    Pending = readNowPlaying()
        .then((state) => {
            Current = state;
            LastRead = Date.now();
            return state;
        })
        .finally(() => {
            Pending = undefined;
        });
    return Pending;
}

export async function controlNowPlaying(id: string, command: MediaCommand): Promise<NowPlayingState> {
    if (!["toggle", "previous", "next"].includes(command) || !Current || Current.id !== id) {
        throw new Error("Media source is no longer available");
    }
    const player = NativePlayers.find((player) => player.id === id);
    if (player && process.platform === "darwin") {
        const action = { toggle: "playpause", previous: "previous track", next: "next track" }[command];
        await ExecFile(
            "/usr/bin/osascript",
            ["-e", `if application id "${player.id}" is running then tell application id "${player.id}" to ${action}`],
            { timeout: 1800 }
        );
    } else if (id.startsWith("web:") && command === "toggle") {
        const guest = webContents.fromId(Number(id.slice(4)));
        if (!guest || guest.isDestroyed() || guest.getType() !== "webview") throw new Error("Media window closed");
        await withMediaTimeout(
            guest.executeJavaScript(
                `(async () => {
            const elements = [...document.querySelectorAll('audio,video')];
            const playing = elements.filter(m => !m.paused && !m.ended);
            if (playing.length) { playing.forEach(m => m.pause()); return; }
            const media = elements.find(m => m.currentTime > 0 && !m.ended);
            if (media) await media.play();
        })()`,
                true
            )
        );
    } else {
        throw new Error("This media source does not support that control");
    }
    LastRead = 0;
    return getNowPlaying();
}
