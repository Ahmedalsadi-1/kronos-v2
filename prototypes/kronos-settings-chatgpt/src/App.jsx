// Copyright 2026, KronOS.
import {
    IconAdjustmentsHorizontal,
    IconApps,
    IconArrowLeft,
    IconBell,
    IconBolt,
    IconBrain,
    IconCheck,
    IconChevronRight,
    IconCpu,
    IconCreditCard,
    IconDeviceDesktop,
    IconExternalLink,
    IconGitBranch,
    IconHierarchy,
    IconHistory,
    IconInfoCircle,
    IconKey,
    IconKeyboard,
    IconLayoutGrid,
    IconListDetails,
    IconMicrophone,
    IconMoon,
    IconPalette,
    IconPaw,
    IconPencil,
    IconPhoto,
    IconPlug,
    IconPuzzle,
    IconSearch,
    IconServer,
    IconSettings,
    IconShieldCheck,
    IconSparkles,
    IconSun,
    IconTool,
    IconUserCircle,
    IconUsers,
    IconVectorBezier,
    IconWand,
    IconWorld,
    IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { brandText } from "./branding";
import { Navigation, Pages, SearchIndex, persistedPreview } from "./catalog";
import { ChoiceGroup } from "./choice-group";
import { ConfigurationCatalog, JsonSetting, SettingsGroup } from "./configuration-catalog";
const Icons = {
    sliders: IconAdjustmentsHorizontal,
    bell: IconBell,
    brain: IconBrain,
    flow: IconGitBranch,
    layout: IconLayoutGrid,
    wave: IconMicrophone,
    palette: IconPalette,
    pen: IconPencil,
    photo: IconPhoto,
    plug: IconPlug,
    shield: IconShieldCheck,
    sparkles: IconSparkles,
    users: IconUsers,
    globe: IconWorld,
};
const NavigationIcons = {
    integrations: IconApps,
    user: IconUserCircle,
    billing: IconCreditCard,
    appearance: IconPalette,
    personalization: IconAdjustmentsHorizontal,
    notifications: IconBell,
    pets: IconPaw,
    "quick-entry": IconBolt,
    model: IconCpu,
    memory: IconBrain,
    voice: IconMicrophone,
    tools: IconTool,
    delegation: IconHierarchy,
    connections: IconKey,
    gateway: IconServer,
    skills: IconWand,
    plugins: IconPuzzle,
    sessions: IconHistory,
    browser: IconWorld,
    widgets: IconLayoutGrid,
    computers: IconDeviceDesktop,
    kronrender: IconPhoto,
    pen: IconVectorBezier,
    kronflow: IconGitBranch,
    shortcuts: IconKeyboard,
    keys: IconKey,
    advanced: IconSettings,
    configuration: IconListDetails,
    about: IconInfoCircle,
};
const StorageKey = "kronos-chatgpt-settings-preview-v1";
function initialValues() {
    try {
        return JSON.parse(localStorage.getItem(StorageKey) || "{}");
    } catch {
        return {};
    }
}
export function App({ initialPage = "user" } = {}) {
    const [page, setPage] = useState(initialPage);
    const [targetKey, setTargetKey] = useState("");
    const [values, setValues] = useState(initialValues);
    const [search, setSearch] = useState("");
    const [toast, setToast] = useState("");
    const [modal, setModal] = useState(null);
    const [open, setOpen] = useState(true);
    const [mobileNav, setMobileNav] = useState(false);
    const scroll = useRef(null);
    useEffect(() => {
        const onKey = (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                document.querySelector('[aria-label="Search settings"]')?.focus();
            }
            if (event.key === "Escape") setModal(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
    const theme = values.appearance || "Dark";
    const light =
        theme === "Light" || (theme === "System" && window.matchMedia("(prefers-color-scheme: light)").matches);
    useEffect(() => {
        localStorage.setItem(StorageKey, JSON.stringify(persistedPreview(values)));
    }, [values]);
    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(""), 2300);
        return () => clearTimeout(timer);
    }, [toast]);
    const update = (key, value) => {
        setValues((v) => ({ ...v, [key]: value }));
        setToast("Saved in preview");
    };
    const navigate = (id) => {
        setPage(id);
        setSearch("");
        setMobileNav(false);
        scroll.current?.scrollTo({ top: 0 });
    };
    const current = Pages[page];
    const results = search.trim()
        ? SearchIndex.filter((item) =>
              search
                  .toLowerCase()
                  .trim()
                  .split(/\s+/)
                  .every((term) => item.text.includes(term))
          )
        : [];
    useEffect(() => {
        if (!targetKey) return;
        const handle = requestAnimationFrame(() => {
            const element = [...document.querySelectorAll("[data-setting-key]")].find(
                (node) => node.dataset.settingKey === targetKey
            );
            if (!element) return;
            const details = element.closest("details");
            if (details) details.open = true;
            element.scrollIntoView({ block: "center" });
            element.classList.add("setting-highlight");
            element.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(handle);
    }, [page, targetKey, search]);
    const name = values["account.name"] || "KronOS user";
    const email = values["account.email"] || "Add your email";
    const initials = values["account.name"]
        ?.trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
    function performAction(row) {
        if (row.key === "export-preview") {
            const blob = new Blob([JSON.stringify(persistedPreview(values), null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "kronos-preview-settings.json";
            anchor.click();
            URL.revokeObjectURL(url);
            setToast("Preview settings exported");
            return;
        }
        setModal({
            ...row,
            informational: !["clear-profile", "clearHistory", "clearStorage", "pet.remove"].includes(row.key),
        });
    }
    function renderRow(row) {
        const clickable = row.type === "link" || row.type === "action";
        const Tag = clickable ? "button" : "div";
        const structured = row.type === "json";
        return (
            <Tag
                key={row.key}
                tabIndex={clickable ? undefined : -1}
                data-setting-key={row.key}
                className={`setting-row ${row.type === "select" ? `choice-row ${row.options.length <= 3 ? "choices-compact" : ""}` : ""} ${row.type === "textarea" ? "textarea-row" : ""} ${structured ? "json-row" : ""} ${row.type === "action" ? "action-row" : ""}`}
                onClick={
                    clickable ? () => (row.type === "link" ? navigate(row.target) : performAction(row)) : undefined
                }
            >
                {row.type !== "textarea" && (
                    <div className="row-label">
                        {row.label}
                        {row.description && row.type !== "password" && <small>{row.description}</small>}
                        {row.source && <code className="config-key">{row.displayKey}</code>}
                    </div>
                )}
                <div className="row-control">{control(row)}</div>
            </Tag>
        );
    }
    function control(row) {
        const value = values[row.key] ?? row.value ?? "";
        if (row.type === "readonly") return <span className="row-value">{brandText(String(value))}</span>;
        if (row.type === "info") return <span className="row-value">KronOS desktop</span>;
        if (row.type === "json") return <JsonSetting row={row} value={value} onChange={update} />;
        if (row.type === "toggle")
            return (
                <button
                    type="button"
                    className="switch"
                    role="switch"
                    aria-label={row.label}
                    aria-checked={Boolean(value)}
                    onClick={() => update(row.key, !value)}
                >
                    <span />
                </button>
            );
        if (row.type === "select")
            return (
                <ChoiceGroup
                    label={row.label}
                    options={row.options}
                    value={value}
                    onChange={(next) => update(row.key, next)}
                />
            );
        if (row.type === "link")
            return (
                <>
                    <span className="row-value">{row.value}</span>
                    <IconChevronRight size={17} className="chevron" />
                </>
            );
        if (row.type === "file")
            return (
                <label className="file-button">
                    {values[row.key] || "Choose file"}
                    <input
                        type="file"
                        aria-label={row.label}
                        accept={row.accept}
                        multiple={row.multiple}
                        onChange={(e) => {
                            if (e.target.files.length) update(row.key, e.target.files[0].name);
                        }}
                    />
                    <IconExternalLink size={15} />
                </label>
            );
        if (row.type === "action") return <IconChevronRight size={17} className="chevron" />;
        if (row.type === "textarea")
            return (
                <textarea
                    aria-label={row.label || "Custom instructions"}
                    placeholder={row.description}
                    value={value}
                    onChange={(e) => update(row.key, e.target.value)}
                    rows={4}
                />
            );
        return (
            <input
                aria-label={row.label}
                className="inline-input"
                type={row.type}
                min={row.min}
                max={row.max}
                step={row.type === "number" ? "any" : undefined}
                value={typeof value === "string" ? brandText(value) : value}
                placeholder={row.description || "Not set"}
                onChange={(e) => update(row.key, e.target.value)}
            />
        );
    }
    return (
        <div className={`stage ${light ? "light" : ""}`} data-theme={values.theme || "KronOS"}>
            <div className="preview-top">
                <span>
                    <IconSparkles size={16} /> KronOS
                </span>
                <span>
                    Settings preview <span className="preview-dot" /> Local only
                </span>
            </div>
            {!open ? (
                <button className="reopen" onClick={() => setOpen(true)}>
                    Open settings
                </button>
            ) : (
                <div className="glass-frame">
                    <div className={`settings-window ${mobileNav ? "show-navigation" : ""}`}>
                        <aside className="sidebar">
                            <div className="sidebar-title">Settings</div>
                            <label className="search">
                                <IconSearch size={17} />
                                <input
                                    aria-label="Search settings"
                                    placeholder="Search settings"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                                <kbd>⌘ K</kbd>
                            </label>
                            <nav aria-label="Settings categories">
                                {Navigation.map((group, i) => (
                                    <section className="nav-group" key={i}>
                                        {group.title && <div className="nav-heading">{group.title}</div>}
                                        {group.entries.map(([id, label, icon]) => {
                                            const Icon = NavigationIcons[id] || Icons[icon];
                                            return (
                                                <button
                                                    key={id}
                                                    aria-current={
                                                        page === id || current.parent === id ? "page" : undefined
                                                    }
                                                    onClick={() => navigate(id)}
                                                >
                                                    <span className="nav-icon">
                                                        <Icon size={18} stroke={1.7} />
                                                    </span>
                                                    <span>{label}</span>
                                                </button>
                                            );
                                        })}
                                    </section>
                                ))}
                            </nav>
                            <button
                                className="sidebar-footer profile-button"
                                onClick={() => navigate("user")}
                                aria-label="Open user settings"
                            >
                                <span className="avatar">{initials || <IconUsers size={18} />}</span>
                                <span className="profile-identity">
                                    <strong>{name}</strong>
                                    <small>{email}</small>
                                </span>
                                <IconChevronRight size={16} />
                            </button>
                        </aside>
                        <main className="detail">
                            <header>
                                <button
                                    className="mobile-back icon-button"
                                    aria-label="Show settings navigation"
                                    onClick={() => setMobileNav(true)}
                                >
                                    <IconArrowLeft size={20} />
                                </button>
                                {current.parent ? (
                                    <button className="parent-back" onClick={() => navigate(current.parent)}>
                                        <IconArrowLeft size={17} /> {Pages[current.parent].title}
                                    </button>
                                ) : (
                                    <span className="header-label">Settings</span>
                                )}
                                <button
                                    className="icon-button close"
                                    aria-label="Close settings"
                                    onClick={() => setOpen(false)}
                                >
                                    <IconX size={19} />
                                </button>
                            </header>
                            <div className="detail-scroll" ref={scroll}>
                                <div className="page-content" key={page}>
                                    <div className="page-heading">
                                        <h1>{search ? "Search settings" : current.title}</h1>
                                        <p>{search ? `${results.length} matching settings` : current.description}</p>
                                    </div>
                                    {search ? (
                                        <div className="setting-group">
                                            {results.length ? (
                                                results.map((r, i) => (
                                                    <button
                                                        className="setting-row result"
                                                        key={i}
                                                        onClick={() => {
                                                            setTargetKey(r.key);
                                                            navigate(r.id);
                                                        }}
                                                    >
                                                        <span>
                                                            {r.label}
                                                            <small>{r.page}</small>
                                                        </span>
                                                        <IconChevronRight size={16} />
                                                    </button>
                                                ))
                                            ) : (
                                                <p className="empty">
                                                    No settings found. Try “memory”, “canvas”, or “browser”.
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            {page === "appearance" && (
                                                <div className="appearance-options">
                                                    {["Light", "Dark", "System"].map((mode) => (
                                                        <button
                                                            className={theme === mode ? "selected" : ""}
                                                            key={mode}
                                                            onClick={() => update("appearance", mode)}
                                                        >
                                                            {mode === "Light" ? (
                                                                <IconSun size={27} />
                                                            ) : mode === "Dark" ? (
                                                                <IconMoon size={27} />
                                                            ) : (
                                                                <IconPalette size={27} />
                                                            )}
                                                            <span>{mode}</span>
                                                            {theme === mode && (
                                                                <IconCheck className="mode-check" size={16} />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {page === "user" && (
                                                <div className="profile-card">
                                                    <span className="profile-avatar">
                                                        {initials || <IconUsers size={28} />}
                                                    </span>
                                                    <div>
                                                        <h2>{name}</h2>
                                                        <p>{email}</p>
                                                        <span className="profile-status">Preview profile</span>
                                                    </div>
                                                </div>
                                            )}
                                            {current.catalog ? (
                                                <ConfigurationCatalog renderRow={renderRow} />
                                            ) : (
                                                current.groups.map((group, i) => (
                                                    <SettingsGroup
                                                        key={`${page}-${i}`}
                                                        group={group}
                                                        renderRow={renderRow}
                                                    />
                                                ))
                                            )}
                                            {page === "personalization" && (
                                                <p className="personalization-note">
                                                    Your workspace. Your way of thinking.
                                                </p>
                                            )}
                                        </>
                                    )}
                                    <div className="preview-footnote">
                                        Interactive preview · Sample values · Changes stay in this browser
                                    </div>
                                </div>
                            </div>
                        </main>
                    </div>
                </div>
            )}
            <footer className="stage-footer">
                <span>KronOS settings. Your workspace, your way.</span>
                <button
                    onClick={() => {
                        setValues({});
                        setToast("Preview reset");
                    }}
                >
                    Reset preview
                </button>
            </footer>
            {toast && (
                <div className="toast" role="status">
                    <IconCheck size={16} />
                    {toast}
                </div>
            )}
            {modal && (
                <div className="modal-backdrop" onClick={() => setModal(null)}>
                    <div
                        className="modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="dialog-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 id="dialog-title">
                            {modal.label}
                            {modal.informational ? "" : "?"}
                        </h2>
                        <p>
                            {modal.informational
                                ? "This control is included in the settings preview. This action uses the connected KronOS desktop runtime when applied in the app."
                                : modal.key === "clear-profile"
                                  ? "This removes your name and email from the local preview. Your live KronOS account will stay unchanged."
                                  : "This previews the confirmation for the selected browser profile. Your actual browser data will stay unchanged."}
                        </p>
                        <div>
                            <button autoFocus onClick={() => setModal(null)}>
                                {modal.informational ? "Done" : "Cancel"}
                            </button>
                            {!modal.informational && (
                                <button
                                    className="destructive"
                                    onClick={() => {
                                        if (modal.key === "clear-profile")
                                            setValues((current) => {
                                                const next = { ...current };
                                                delete next["account.name"];
                                                delete next["account.email"];
                                                return next;
                                            });
                                        setModal(null);
                                        setToast("Preview action completed");
                                    }}
                                >
                                    Confirm in preview
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
