let activeDispose: (() => void) | undefined;
let mounting: Promise<unknown> = Promise.resolve();
export function mountKronTermWorkflow(element: HTMLElement, host: any) {
    const next = mounting.then(async () => {
        activeDispose?.();
        const nativeWindow = window as any;
        nativeWindow.__KRONTERM_WORKFLOW_HOST__ = host;
        nativeWindow.BASE_PATH = host.backendUrl.endsWith("/") ? host.backendUrl : host.backendUrl + "/";
        localStorage.setItem("n8n-browserId", host.browserId);
        const { mount } = await import("./kronterm-native-bootstrap");
        const dispose = await mount(element, host);
        let disposed = false;
        const cleanup = () => {
            if (disposed) return;
            disposed = true;
            dispose();
            if (activeDispose === cleanup) activeDispose = undefined;
        };
        activeDispose = cleanup;
        return cleanup;
    });
    mounting = next.then(
        () => undefined,
        () => undefined
    );
    return next;
}
