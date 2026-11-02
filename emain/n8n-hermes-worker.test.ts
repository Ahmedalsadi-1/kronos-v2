import { afterEach, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { runHermesWorkflowWorker } from "./n8n-hermes-worker";
import { workflowWorkerContext } from "./n8n-worker-scope";

vi.mock("./computer-access-policy", () => ({ registerComputerChats: vi.fn() }));
let server: WebSocketServer;
afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});
async function gateway(onPrompt: (socket: any, frame: any) => void) {
    server = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const methods: string[] = [];
    server.on("connection", (socket) =>
        socket.on("message", (raw) => {
            const frame = JSON.parse(String(raw));
            methods.push(frame.method);
            socket.send(
                JSON.stringify({
                    jsonrpc: "2.0",
                    id: frame.id,
                    result:
                        frame.method === "session.create"
                            ? { session_id: "worker-session", stored_session_id: "stored-session" }
                            : {},
                })
            );
            if (frame.method === "prompt.submit") onPrompt(socket, frame);
        })
    );
    return { connection: { wsUrl: `ws://127.0.0.1:${(server.address() as any).port}` } as any, methods };
}

it("runs a real gateway session, pins its tools, ignores other sessions, and cleans up", async () => {
    const { connection, methods } = await gateway((socket, frame) => {
        expect(frame.params.text).toContain("Assigned workflow: flow1");
        expect(workflowWorkerContext({}, "worker-session")).toMatchObject({
            workspaceId: "workspace",
            tabId: "tab",
            n8nWorkflowId: "flow1",
        });
        socket.send(
            JSON.stringify({
                method: "event",
                params: { type: "message.complete", session_id: "other", payload: { text: "wrong" } },
            })
        );
        socket.send(
            JSON.stringify({
                method: "event",
                params: {
                    type: "message.complete",
                    session_id: "worker-session",
                    payload: { text: "Built and validated", status: "complete" },
                },
            })
        );
    });
    const result = await runHermesWorkflowWorker(
        connection,
        { operation: "run-agent", task: "Build a workflow", workflowId: "flow1" },
        { workspaceId: "workspace", tabId: "tab" }
    );
    expect(result.text).toBe("Built and validated");
    expect(methods).toContain("session.close");
    expect(workflowWorkerContext({}, "worker-session")).toEqual({});
});

it("does not approve interactive requests or recursively delegate", async () => {
    const { connection, methods } = await gateway((socket) =>
        socket.send(
            JSON.stringify({
                method: "event",
                params: { type: "approval.request", session_id: "worker-session", payload: {} },
            })
        )
    );
    await expect(
        runHermesWorkflowWorker(
            connection,
            { operation: "run-agent", task: "Do work" },
            { workspaceId: "workspace", tabId: "tab" }
        )
    ).rejects.toThrow("user action");
    expect(methods).not.toContain("approval.respond");
    await expect(
        runHermesWorkflowWorker(
            connection,
            { operation: "run-agent", task: "Do work" },
            { workspaceId: "workspace", tabId: "tab", n8nWorkerId: "already-worker" }
        )
    ).rejects.toThrow("recursively");
});
