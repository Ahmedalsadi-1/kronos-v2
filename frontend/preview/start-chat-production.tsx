import { useState } from "react";
import { createRoot } from "react-dom/client";
import { OSChatStartPage } from "../app/tab/os-chat-start-page";
function ProductionStartPreview() {
    const [query, setQuery] = useState("");
    const [result, setResult] = useState("");
    return (
        <div style={{ height: "100svh", display: "flex", flexDirection: "column" }}>
            <OSChatStartPage
                active={!result}
                query={query}
                onQuery={setQuery}
                pending={false}
                destinations={[
                    { value: "http://localhost:7013", label: "Start page concept", detail: "Running preview" },
                    { value: "https://en.wikipedia.org/wiki/Coffee", label: "Coffee — Wikipedia" },
                ]}
                onBrowser={async (value) => setResult(`Browser: ${value}`)}
                onChat={async (text, canvas) => setResult(`${canvas ? "Canvas" : "Task"}: ${text}`)}
                onTool={async (tool) => setResult(`Native composer handoff: ${tool}`)}
                onLaunch={async (app) => setResult(`Launch: ${app}`)}
                onChanges={() => setResult("Workspace changes")}
            />
            {result && (
                <div role="status" style={{ padding: 40, color: "#eee", fontFamily: "system-ui" }}>
                    {result}
                    <p>Component preview only — no agent calls.</p>
                    <button
                        onClick={() => {
                            setResult("");
                            setQuery("");
                        }}
                    >
                        Back to start page
                    </button>
                </div>
            )}
        </div>
    );
}
createRoot(document.getElementById("root")!).render(<ProductionStartPreview />);
