import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { localLinux } from "../lib/local-linux";
import { phoneWidgetSurfaces } from "../lib/phone-widget-surfaces";

interface SessionEvent {
    id?: string;
    time: number;
    label: string;
    output?: string;
    image?: string;
}
export function SessionTimeline() {
    const state = useSyncExternalStore(localLinux.subscribe, localLinux.getSnapshot);
    const surfaces = useSyncExternalStore(phoneWidgetSurfaces.subscribe, phoneWidgetSurfaces.getSnapshot);
    const [events, setEvents] = useState<SessionEvent[]>([]);
    const [selected, setSelected] = useState<string | undefined>();
    const last = useRef({ phase: "", savedAt: 0, output: "", image: "" });
    const append = (event: SessionEvent) =>
        setEvents((current) =>
            [...current, { ...event, id: crypto.randomUUID() }].sort((a, b) => a.time - b.time).slice(-24)
        );
    useEffect(() => {
        if (state.phase === last.current.phase) return;
        last.current.phase = state.phase;
        append({ time: Date.now(), label: `Console ${state.phase}` });
    }, [state.phase]);
    useEffect(() => {
        if (!state.savedAt || last.current.savedAt === state.savedAt) return;
        last.current.savedAt = state.savedAt;
        append({ time: state.savedAt, label: "Checkpoint saved" });
    }, [state.savedAt]);
    useEffect(() => {
        if (!state.output || state.output === last.current.output) return;
        const timer = setTimeout(() => {
            last.current.output = state.output;
            append({ time: Date.now(), label: "Console output", output: state.output.slice(-8_000) });
        }, 750);
        return () => clearTimeout(timer);
    }, [state.output]);
    const desktop = surfaces.find((surface) => surface.id === "phone-desktop");
    useEffect(() => {
        const image = desktop?.previewUrl;
        if (!image || image === last.current.image || image.length > 250_000) return;
        last.current.image = image;
        append({ time: desktop.updatedAt, label: "Desktop frame", image });
    }, [desktop?.previewUrl]);
    const event = selected == null ? undefined : events.find((event) => event.id === selected);
    return (
        <div className="session-timeline" aria-label="Session timeline">
            <div className="session-timeline-heading">
                <span>Timeline</span>
                <button type="button" aria-pressed={selected == null} onClick={() => setSelected(undefined)}>
                    Live
                </button>
            </div>
            <div className="session-timeline-events" aria-label="Recorded activity">
                {events.map((event) => (
                    <button
                        type="button"
                        key={event.id}
                        aria-pressed={selected === event.id}
                        onClick={() => setSelected(event.id)}
                    >
                        <time>
                            {new Date(event.time).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                            })}
                        </time>
                        <span>{event.label}</span>
                    </button>
                ))}
            </div>
            {event && (
                <div className="session-timeline-record" role="region" aria-label="Recorded session activity">
                    <strong>{event.label}</strong>
                    <small>Recorded view · the VM remains live</small>
                    {event.image && <img src={event.image} alt="Recorded desktop frame" />}
                    {event.output && <pre>{event.output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")}</pre>}
                </div>
            )}
        </div>
    );
}
