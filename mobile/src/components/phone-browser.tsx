import { Capacitor, registerPlugin } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
import { phoneWidgetSurfaces } from "../lib/phone-widget-surfaces";
import "./phone-browser.css";

const NativeBrowser = registerPlugin<{ openBrowser(options: { url: string }): Promise<void> }>("KronTermWorkspace");

interface BrowserPage {
    id: string;
    history: string[];
    position: number;
    revision: number;
}
const makePage = (): BrowserPage => ({ id: crypto.randomUUID(), history: [], position: -1, revision: 0 });
const pageUrl = (page: BrowserPage) => page.history[page.position] ?? "";
const pageTitle = (page: BrowserPage) => pageUrl(page) ? new URL(pageUrl(page)).hostname : "New tab";

function BrowserIcon({ name }: { name: "back" | "forward" | "reload" | "share" | "tabs" | "close" | "plus" | "lock" }) {
    const paths = {
        back: "m15 5-7 7 7 7",
        forward: "m9 5 7 7-7 7",
        reload: "M20 7v5h-5 M20 12a8 8 0 1 0-2 5 M20 7l-3-3",
        share: "M12 15V3 m-4 4 4-4 4 4 M7 11H5v10h14V11h-2",
        tabs: "M8 8h13v13H8z M3 16V3h13",
        close: "m6 6 12 12 M18 6 6 18",
        plus: "M12 5v14 M5 12h14",
        lock: "M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4",
    };
    return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function PhoneBrowser({ active = true, requestedPageId, controlEnabled = true }: {
    active?: boolean;
    requestedPageId?: string;
    controlEnabled?: boolean;
}) {
    const [pages, setPages] = useState<BrowserPage[]>(() => [makePage()]);
    const [selected, setSelected] = useState(pages[0].id);
    const [address, setAddress] = useState("");
    const [error, setError] = useState("");
    const [overview, setOverview] = useState(false);
    const addressRef = useRef<HTMLInputElement>(null);
    const pagesRef = useRef(pages);
    pagesRef.current = pages;
    const opened = useRef(false);
    if (active) opened.current = true;
    const current = pages.find((page) => page.id === selected) ?? pages[0];
    const currentUrl = pageUrl(current);

    useEffect(() => {
        if (!requestedPageId) return;
        const page = pagesRef.current.find((candidate) => candidate.id === requestedPageId);
        if (page) {
            setSelected(page.id);
            setAddress(pageUrl(page));
            setOverview(false);
        }
    }, [requestedPageId]);
    useEffect(() => {
        for (const page of pages.filter((candidate) => pageUrl(candidate) || opened.current)) {
            phoneWidgetSurfaces.publish({
                id: `phone-browser-${page.id}`, kind: "browser", localLinux: true, localWidget: "browser",
                hostId: "local-linux", hostLabel: "This iPhone", hostColor: "#8b5cf6",
                title: pageTitle(page), subtitle: pageUrl(page), url: pageUrl(page), pageId: page.id,
                status: "live", attention: "none", updatedAt: selected === page.id ? Date.now() : 0,
                capabilities: ["focus"],
            });
        }
    }, [pages, selected, active]);
    useEffect(() => () => {
        for (const page of pagesRef.current) phoneWidgetSurfaces.remove(`phone-browser-${page.id}`);
    }, []);

    function choose(page: BrowserPage) {
        setSelected(page.id);
        setAddress(pageUrl(page));
        setOverview(false);
        setError("");
        phoneWidgetSurfaces.markUsed(`phone-browser-${page.id}`);
    }
    function add() {
        if (!controlEnabled || pages.length >= 8) return;
        const page = makePage();
        setPages((value) => [...value, page]);
        choose(page);
        requestAnimationFrame(() => addressRef.current?.focus());
    }
    function close(id: string) {
        if (!controlEnabled) return;
        const remaining = pages.filter((page) => page.id !== id);
        if (!remaining.length) remaining.push(makePage());
        phoneWidgetSurfaces.remove(`phone-browser-${id}`);
        setPages(remaining);
        if (selected === id) choose(remaining[remaining.length - 1]);
    }
    function navigate(direction: number) {
        if (!controlEnabled) return;
        const position = current.position + direction;
        if (position < 0 || position >= current.history.length) return;
        setPages((value) => value.map((page) => page.id === selected ? { ...page, position } : page));
        setAddress(current.history[position]);
        phoneWidgetSurfaces.markUsed(`phone-browser-${selected}`);
    }
    function open() {
        if (!controlEnabled) return;
        try {
            const input = address.trim();
            const url = new URL(input.includes("://") ? input : `https://${input}`);
            if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use an HTTPS web address");
            setPages((value) => value.map((page) => page.id === selected ? {
                ...page, history: [...page.history.slice(0, page.position + 1), url.href], position: page.position + 1,
            } : page));
            setAddress(url.href);
            setError("");
            setOverview(false);
            addressRef.current?.blur();
            phoneWidgetSurfaces.markUsed(`phone-browser-${selected}`);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Invalid address");
        }
    }
    async function share() {
        if (!controlEnabled || !currentUrl) return;
        try {
            if (navigator.share) await navigator.share({ title: pageTitle(current), url: currentUrl });
            else if (navigator.clipboard) {
                await navigator.clipboard.writeText(currentUrl);
                setError("Link copied");
            } else setError("Select the address to copy this link.");
        } catch (reason) {
            if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("Could not share this link.");
        }
    }
    return (
        <div className="linux-tool-pane phone-browser safari-browser">
            <div className="safari-content" hidden={overview}>
                {!currentUrl && <div className="safari-start"><BrowserIcon name="tabs" /><h2>New tab</h2><p>Enter a website below.</p></div>}
                {pages.map((page) => pageUrl(page) && <iframe
                    key={`${page.id}-${page.revision}`} title={`Phone browser ${pageTitle(page)}`}
                    hidden={page.id !== selected} src={pageUrl(page)}
                    sandbox="allow-scripts allow-forms allow-popups" referrerPolicy="no-referrer"
                    style={{ pointerEvents: controlEnabled ? "auto" : "none" }}
                />)}
            </div>
            {overview && <section className="safari-overview" aria-label="Browser tabs">
                <header><h2>{pages.length} {pages.length === 1 ? "tab" : "tabs"}</h2><button type="button" onClick={() => setOverview(false)}>Done</button></header>
                <div className="safari-tab-grid">{pages.map((page) => <article key={page.id} className={page.id === selected ? "is-selected" : ""}>
                    <button className="safari-tab-select" type="button" onClick={() => choose(page)}><BrowserIcon name="tabs" /><strong>{pageTitle(page)}</strong><span>{pageUrl(page) || "Empty page"}</span></button>
                    <button className="safari-tab-close" type="button" aria-label={`Close ${pageTitle(page)}`} disabled={!controlEnabled} onClick={() => close(page.id)}><BrowserIcon name="close" /></button>
                </article>)}</div>
                <button className="safari-add-tab" type="button" disabled={!controlEnabled || pages.length >= 8} onClick={add}><BrowserIcon name="plus" /> New tab</button>
            </section>}
            {Capacitor.getPlatform() === "ios" && currentUrl && <button className="safari-native-open" type="button" disabled={!controlEnabled} onClick={() => {
                void NativeBrowser.openBrowser({ url: currentUrl }).catch(() => setError("Safari view could not open. Please try again."));
            }}>Open in Safari view</button>}
            {error && <p className="safari-message" role="status">{error}</p>}
            <footer className="safari-toolbar">
                <form onSubmit={(event) => { event.preventDefault(); open(); }}>
                    <BrowserIcon name="lock" />
                    <input ref={addressRef} aria-label="Phone browser address" disabled={!controlEnabled} value={address}
                        placeholder="Website address" onChange={(event) => setAddress(event.target.value)}
                        onFocus={(event) => event.target.select()} autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" enterKeyHint="go" />
                    <button type="button" aria-label="Reload page" disabled={!controlEnabled || !currentUrl} onClick={() => setPages((value) => value.map((page) => page.id === selected ? { ...page, revision: page.revision + 1 } : page))}><BrowserIcon name="reload" /></button>
                </form>
                <nav aria-label="Browser controls">
                    <button type="button" aria-label="Back" disabled={!controlEnabled || current.position <= 0} onClick={() => navigate(-1)}><BrowserIcon name="back" /></button>
                    <button type="button" aria-label="Forward" disabled={!controlEnabled || current.position >= current.history.length - 1} onClick={() => navigate(1)}><BrowserIcon name="forward" /></button>
                    <button type="button" aria-label="Share page" disabled={!controlEnabled || !currentUrl} onClick={() => void share()}><BrowserIcon name="share" /></button>
                    <button type="button" aria-label="New phone browser tab" disabled={!controlEnabled || pages.length >= 8} onClick={add}><BrowserIcon name="plus" /></button>
                    <button type="button" aria-label={`Show ${pages.length} browser tabs`} aria-expanded={overview} onClick={() => setOverview((value) => !value)}><BrowserIcon name="tabs" /><span className="safari-tab-count">{pages.length}</span></button>
                </nav>
                <small>Embedded preview · Some websites require opening in Safari.</small>
            </footer>
        </div>
    );
}
