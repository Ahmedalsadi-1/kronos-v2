import { LocalLinuxRevision } from "./local-linux-protocol";

export interface LocalLinuxCheckpoint {
    revision: string;
    savedAt: number;
    output: string;
    data: ArrayBuffer;
}

const openDatabase = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const request = indexedDB.open("kronterm-local-linux", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("checkpoints");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Local Linux storage unavailable"));
        request.onblocked = () => reject(new Error("Close other KronTerm tabs to access Local Linux storage"));
    });

export async function loadLinuxCheckpoint(): Promise<LocalLinuxCheckpoint | undefined> {
    const database = await openDatabase();
    try {
        return await new Promise((resolve, reject) => {
            const request = database.transaction("checkpoints").objectStore("checkpoints").get(LocalLinuxRevision);
            request.onsuccess = () => {
                const value = request.result as LocalLinuxCheckpoint | undefined;
                resolve(
                    value?.revision === LocalLinuxRevision && value.data instanceof ArrayBuffer ? value : undefined
                );
            };
            request.onerror = () => reject(request.error);
        });
    } finally {
        database.close();
    }
}

export async function saveLinuxCheckpoint(checkpoint: LocalLinuxCheckpoint): Promise<void> {
    const database = await openDatabase();
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction("checkpoints", "readwrite");
            transaction.objectStore("checkpoints").put(checkpoint, LocalLinuxRevision);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error("Could not save Local Linux"));
            transaction.onabort = () => reject(transaction.error ?? new Error("Local Linux save was interrupted"));
        });
    } finally {
        database.close();
    }
}
