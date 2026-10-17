import type { Surface } from "../types";
let surfaces: Surface[] = [];
let lastUsedId: string | undefined;
const listeners = new Set<() => void>();
export const phoneWidgetSurfaces = {
    getLastUsedId: () => lastUsedId,
    markUsed: (id: string) => {
        lastUsedId = id;
        surfaces = [...surfaces];
        listeners.forEach((listener) => listener());
    },
    getSnapshot: () => surfaces,
    subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
    publish: (surface: Surface) => {
        surfaces = [...surfaces.filter((item) => item.id !== surface.id), surface];
        listeners.forEach((listener) => listener());
    },
    remove: (id: string) => {
        surfaces = surfaces.filter((surface) => surface.id !== id);
        listeners.forEach((listener) => listener());
    },
};
