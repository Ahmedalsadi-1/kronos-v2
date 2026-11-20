import React, { useLayoutEffect, useRef } from "react";

export function LiveSurface({ page, hidden, error, reload }) {
    const outlet = useRef(null);
    const { liveId: id, address } = page;
    const url = useRef(address);
    url.current = address;

    useLayoutEffect(() => {
        if (hidden || error) return;
        const node = outlet.current;
        const sync = () => {
            const { x, y, width, height } = node.getBoundingClientRect();
            void window.liveBrowser.command("show", { id, address: url.current, bounds: { x, y, width, height } });
        };
        const observer = new ResizeObserver(sync);
        observer.observe(node);
        window.addEventListener("resize", sync);
        sync();
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", sync);
            void window.liveBrowser.command("hide", { id });
        };
    }, [id, hidden, error]);

    return <div ref={outlet} className="live-outlet">
        {error && <div className="live-error"><h1>Page unavailable</h1><p>{error}</p><button className="soft" onClick={reload}>Try again</button></div>}
    </div>;
}
