import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

type ThemePreference = "light" | "dark" | "system";

function readTheme(): ThemePreference {
    try {
        const stored = localStorage.getItem("kronos-theme");
        return stored === "light" || stored === "dark" ? stored : "system";
    } catch {
        return "system";
    }
}

export function OsWordmark() {
    return (
        <span className="os-wordmark">
            <span
                className="os-brand-icon"
                aria-hidden="true"
                style={{
                    maskImage: `url(${import.meta.env.BASE_URL}assets/kronos-logo.svg?v=04e)`,
                    WebkitMaskImage: `url(${import.meta.env.BASE_URL}assets/kronos-logo.svg?v=04e)`,
                }}
            />
            <span className="os-wordmark-type">
                Kron<span>OS</span>
            </span>
        </span>
    );
}

const Navigation = [
    ["/capabilities", "Workspace"],
    ["/capabilities/kronoscode", "KronOS Agent"],
    ["/docs", "Docs"],
    ["/blog", "Journal"],
] as const;

export function OsSiteShell({ children }: { children: ReactNode }) {
    const [preference, setPreference] = useState<ThemePreference>(readTheme);
    const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
    const [menuOpen, setMenuOpen] = useState(false);
    const location = useLocation();
    const dark = preference === "system" ? systemDark : preference === "dark";

    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => setSystemDark(media.matches);
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, []);

    useEffect(() => {
        document.documentElement.dataset.theme = dark ? "dark" : "light";
        const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (meta) meta.content = dark ? "#161616" : "#faf9fe";
    }, [dark]);

    useEffect(() => {
        setMenuOpen(false);
        if (!location.hash) window.scrollTo({ top: 0, behavior: "instant" });
    }, [location.pathname]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMenuOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    function toggleTheme() {
        const next = dark ? "light" : "dark";
        setPreference(next);
        try {
            localStorage.setItem("kronos-theme", next);
        } catch {
            /* The theme still works when browser storage is unavailable. */
        }
    }

    return (
        <div className="kronos-site">
            <a className="os-skip" href="#os-main">
                Skip to content
            </a>
            <header className="os-header">
                <Link className="os-home" to="/" aria-label="KronOS home">
                    <OsWordmark />
                </Link>
                <nav className="os-desktop-nav" aria-label="Main navigation">
                    {Navigation.map(([path, label]) => (
                        <NavLink key={path} to={path} end={path === "/capabilities"}>
                            {label}
                        </NavLink>
                    ))}
                </nav>
                <div className="os-header-actions">
                    <button
                        className="os-theme-toggle"
                        onClick={toggleTheme}
                        aria-label="Dark mode"
                        aria-pressed={dark}
                        title={dark ? "Switch to light mode" : "Switch to dark mode"}
                    >
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                            {dark ? (
                                <>
                                    <circle cx="10" cy="10" r="3.5" />
                                    <path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.6 3.6 5 5m10 10 1.4 1.4M3.6 16.4 5 15M15 5l1.4-1.4" />
                                </>
                            ) : (
                                <path d="M16.7 12A7.2 7.2 0 0 1 8 3.3 7.2 7.2 0 1 0 16.7 12Z" />
                            )}
                        </svg>
                    </button>
                    <Link className="os-button os-button-dark" to="/download">
                        Download KronOS
                    </Link>
                    <button
                        className="os-menu-toggle"
                        onClick={() => setMenuOpen(!menuOpen)}
                        aria-expanded={menuOpen}
                        aria-controls="os-mobile-nav"
                        aria-label={menuOpen ? "Close menu" : "Open menu"}
                    >
                        {menuOpen ? "Close" : "Menu"}
                    </button>
                </div>
                {menuOpen && (
                    <nav id="os-mobile-nav" className="os-mobile-nav" aria-label="Mobile navigation">
                        {Navigation.map(([path, label]) => (
                            <Link key={path} to={path} onClick={() => setMenuOpen(false)}>
                                {label}
                            </Link>
                        ))}
                        <Link to="/security">Security</Link>
                        <Link to="/pricing">Pricing</Link>
                        <Link to="/download">Download KronOS</Link>
                    </nav>
                )}
            </header>
            <main id="os-main">{children}</main>
            <footer className="os-footer">
                <div className="os-container">
                    <div className="os-footer-top">
                        <div>
                            <Link to="/" aria-label="KronOS home">
                                <OsWordmark />
                            </Link>
                            <p>
                                Your tools. Your agents.
                                <br />
                                Your kind of workspace.
                            </p>
                        </div>
                        <nav aria-label="Product links">
                            <span>Product</span>
                            <Link to="/capabilities">Workspace</Link>
                            <Link to="/capabilities/kronoscode">KronOS Agent</Link>
                            <Link to="/pricing">Pricing</Link>
                            <Link to="/download">Download</Link>
                        </nav>
                        <nav aria-label="Resources">
                            <span>Resources</span>
                            <Link to="/docs">Documentation</Link>
                            <Link to="/blog">Journal</Link>
                            <Link to="/security">Security</Link>
                            <Link to="/contact-sales">Support</Link>
                            <a href="https://github.com/Ahmedalsadi-1/kronos-releases/releases/tag/v0.14.5">
                                Release notes
                            </a>
                        </nav>
                    </div>
                    <div className="os-footer-word" aria-hidden="true">
                        Kron<span>OS</span>
                        <span className="os-footer-square" />
                    </div>
                    <div className="os-footer-bottom">
                        <span>© 2026 KronOS</span>
                        <span>A workspace for human and agent work.</span>
                        <a href="#os-main">Back to top</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
