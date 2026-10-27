import { Backdrop } from "@hermes/components/Backdrop";
import "@hermes/styles.css";
import { useState } from "react";

export function HermesFluidPreview() {
    const [dark, setDark] = useState(true);
    return (
        <div
            data-hermes-app=""
            className={dark ? "dark" : ""}
            style={
                {
                    position: "fixed",
                    inset: "40px 0 0",
                    background: dark ? "#111111" : "#fafafa",
                    color: dark ? "#ededed" : "#242424",
                    "--ui-chat-surface-background": dark ? "#111111" : "#fafafa",
                } as React.CSSProperties
            }
        >
            <Backdrop />
            <div style={{ position: "relative", zIndex: 3, maxWidth: 720, margin: "64px auto", padding: 24 }}>
                <h1 style={{ fontSize: 22 }}>KronTerm chat background</h1>
                <p style={{ marginTop: 16 }}>Shared panel and widget background. Move the pointer to stir the fluid.</p>
                <p style={{ marginTop: 16 }}>Visual fixture only. No agent is running.</p>
                <button
                    type="button"
                    onClick={() => setDark(!dark)}
                    style={{ marginTop: 24, padding: "8px 16px", cursor: "pointer", border: "1px solid currentColor" }}
                >
                    Switch appearance
                </button>
            </div>
        </div>
    );
}
