import axios, { AxiosError, CanceledError } from "axios-native";
export * from "axios-native";
axios.defaults.adapter = async (config) => {
    const host = (window as any).__KRONTERM_WORKFLOW_HOST__;
    if (!host) throw new Error("The KronTerm workflow host is not connected.");
    const url = new URL(axios.getUri(config), host.backendUrl);
    if (url.origin !== new URL(host.backendUrl).origin)
        throw new Error("This workflow request is outside the managed runtime.");
    const requestId = crypto.randomUUID();
    const abort = () => {
        void host.cancelRequest?.(requestId);
    };
    if (config.signal?.aborted) throw new CanceledError("Workflow request canceled.", config);
    config.signal?.addEventListener?.("abort", abort);
    try {
        let body = config.data;
        let contentType = String(config.headers?.["Content-Type"] || config.headers?.["content-type"] || "");
        let encoding = "json";
        let form;
        if (body instanceof FormData) {
            form = await Promise.all(
                Array.from(body.entries()).map(async ([name, value]) =>
                    typeof value === "string"
                        ? { name, value }
                        : {
                              name,
                              value: Array.from(new Uint8Array(await value.arrayBuffer())),
                              filename: value.name,
                              type: value.type,
                          }
                )
            );
            body = undefined;
        } else if (body instanceof Blob) {
            contentType = body.type || contentType;
            body = Array.from(new Uint8Array(await body.arrayBuffer()));
            encoding = "bytes";
        } else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
            body = Array.from(
                body instanceof ArrayBuffer
                    ? new Uint8Array(body)
                    : new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
            );
            encoding = "bytes";
        } else if (typeof body === "string") {
            try {
                body = JSON.parse(body);
            } catch {
                encoding = "text";
            }
        }
        const result = await host.request({
            route: url.pathname + url.search,
            requestId,
            pushRef: config.headers?.["push-ref"],
            form,
            encoding,
            contentType: contentType || undefined,
            responseType: config.responseType,
            method: (config.method || "GET").toUpperCase(),
            body,
        });
        if (config.signal?.aborted) throw new CanceledError("Workflow request canceled.", config);
        const data = result.bytes
            ? config.responseType === "blob"
                ? new Blob([new Uint8Array(result.bytes)], { type: result.headers?.["content-type"] })
                : new Uint8Array(result.bytes).buffer
            : result.data;
        const response = {
            data,
            status: result.status,
            statusText: result.statusText,
            headers: result.headers || {},
            config,
            request: {},
        };
        if (result.status >= 400)
            throw new AxiosError(`Workflow request failed: ${result.status}`, "ERR_BAD_RESPONSE", config, {}, response);
        return response;
    } catch (error) {
        if (config.signal?.aborted) throw new CanceledError("Workflow request canceled.", config);
        throw error;
    } finally {
        config.signal?.removeEventListener?.("abort", abort);
    }
};
export default axios;
