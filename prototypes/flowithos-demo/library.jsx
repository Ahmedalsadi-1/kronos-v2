import React, { useState } from "react";
import { ArrowDownToLine, Bookmark, ExternalLink, FileText, Folder, History, LayoutPanelLeft, Plus, Search, X } from "lucide-react";

const sampleHistory = [
    { id: "h1", title: "Hacker News", site: 1, kind: "site", query: "", address: "https://news.ycombinator.com", when: "Today" },
    { id: "h2", title: "arXiv", site: 3, kind: "site", query: "", address: "https://arxiv.org", when: "Yesterday" },
];

export const libraryPages = {
    "Browsing History": { title: "History", icon: History, key: "visits", empty: "No browsing history" },
    Downloads: { title: "Downloads", icon: ArrowDownToLine, key: "downloads", empty: "No downloads yet" },
    Bookmarks: { title: "Bookmarks", icon: Bookmark, key: "bookmarks", empty: "No bookmarks yet" },
    Flows: { title: "Flow", icon: LayoutPanelLeft, key: "flows", empty: "No flows" },
};

export const librarySeed = {
    visits: sampleHistory,
    bookmarks: [{ ...sampleHistory[0], collection: "Research" }],
    collections: ["Research"],
    downloads: [{ id: "example", title: "research-brief.md", status: "Completed" }],
    flows: [{
        kind: "canvas", title: "Research brief", address: "flowith://canvas/sample-research-brief",
        pinned: true, source: { ...sampleHistory[1] },
    }],
};

export function Library({ name, state, update, openPage, newFlow, download }) {
    const config = libraryPages[name];
    const Icon = config.icon;
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("All");
    const [selected, setSelected] = useState([]);
    const [creating, setCreating] = useState(false);
    const [collection, setCollection] = useState("");
    const [confirm, setConfirm] = useState(null);
    const [rename, setRename] = useState(null);
    const records = state[config.key];
    const idFor = (item) => item.address ?? item.id;
    const filters = name === "Browsing History" ? ["All", "Today", "Yesterday", "Earlier"]
        : name === "Downloads" ? ["All", "In Progress", "Completed"]
          : name === "Bookmarks" ? ["All", ...state.collections] : ["All", "Pinned"];
    const items = records.filter((item) => {
        const searchable = item.title + " " + (item.address ?? "");
        return searchable.toLowerCase().includes(query.trim().toLowerCase()) &&
            (filter === "All" || item.when === filter || item.status === filter || item.collection === filter ||
             (filter === "Today" && !item.when && name === "Browsing History") || (filter === "Pinned" && item.pinned));
    });
    const selectedVisible = items.filter((item) => selected.includes(idFor(item))).map(idFor);

    function open(item, separate = false) {
        if (name === "Downloads") download(item);
        else openPage(item, separate);
    }

    function remove(ids) {
        setConfirm(ids);
    }

    return (
        <section className="library">
            <header className="library-head"><Icon size={25} /><div><h1>{config.title}</h1>
                <p>{name === "Flows" ? "Your Canvas workflows" : name === "Bookmarks" ? "Saved pages and collections" : "Local workspace records"}</p></div>
                {name === "Flows" && <button className="soft" onClick={newFlow}><Plus size={15} /> New Flow</button>}
                {name === "Bookmarks" && <button className="soft" onClick={() => setCreating(!creating)}><Plus size={15} /> New collection</button>}
            </header>
            {creating && <form className="collection-form" onSubmit={(event) => {
                event.preventDefault();
                const value = collection.trim();
                if (!value || state.collections.includes(value) || value === "All") return;
                update("collections", [...state.collections, value]);
                setFilter(value);
                setCollection("");
                setCreating(false);
            }}><input aria-label="Collection name" value={collection} onChange={(event) => setCollection(event.target.value)} placeholder="Collection name" required /><button className="soft">Create</button></form>}
            <div className="library-controls">
                <label><Search size={15} /><input aria-label={"Search " + config.title.toLowerCase()} placeholder={"Search " + config.title.toLowerCase()} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
                <select aria-label={config.title + " filter"} value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map((entry) => <option key={entry}>{entry}</option>)}</select>
                <button className="soft" disabled={!items.length} onClick={() => setSelected(selectedVisible.length === items.length ? [] : items.map(idFor))}>{items.length && selectedVisible.length === items.length ? "Deselect all" : "Select all"}</button>
                <button className="soft" disabled={!selectedVisible.length} onClick={() => remove(selectedVisible)}>Delete selected</button>
                {(name === "Browsing History" || name === "Downloads") && <button className="soft" disabled={!records.length} onClick={() => remove(records.map(idFor))}>Clear all</button>}
            </div>
            {confirm && <div className="delete-confirm" role="group" aria-label="Confirm deletion">
                <span>Remove {confirm.length} {confirm.length === 1 ? "item" : "items"} from {config.title.toLowerCase()}?</span>
                <button className="soft" onClick={() => setConfirm(null)}>Cancel</button>
                <button className="soft" onClick={() => {
                    update(config.key, records.filter((item) => !confirm.includes(idFor(item))));
                    setSelected([]);
                    setConfirm(null);
                }}>Delete</button>
            </div>}
            {!items.length && <div className="library-empty"><Icon size={25} /><p>{records.length ? "No matching " + config.title.toLowerCase() : config.empty}</p></div>}
            {items.map((item) => {
                const id = idFor(item);
                return <div className="library-row" key={id}>
                    <input type="checkbox" aria-label={"Select " + item.title} checked={selected.includes(id)} onChange={() => setSelected(selected.includes(id) ? selected.filter((key) => key !== id) : [...selected, id])} />
                    {name === "Downloads" ? <FileText size={16} /> : <Icon size={16} />}
                    <button className="library-item" onClick={() => open(item)}><strong>{item.title}</strong><span>{name === "Flows" ? (item.pinned ? "Pinned flow" : "Local flow") : item.address ?? item.status}</span></button>
                    {name === "Bookmarks" && <label className="row-collection"><Folder size={14} /><select aria-label={"Collection for " + item.title} value={item.collection ?? ""} onChange={(event) => update(config.key, records.map((entry) => idFor(entry) === id ? { ...entry, collection: event.target.value } : entry))}>
                        <option value="">Unfiled</option>{state.collections.map((entry) => <option key={entry}>{entry}</option>)}
                    </select></label>}
                    {name === "Flows" && <button className="soft" onClick={() => update(config.key, records.map((entry) => idFor(entry) === id ? { ...entry, pinned: !entry.pinned } : entry))}>{item.pinned ? "Unpin" : "Pin"}</button>}
                    {name === "Flows" && (rename?.id === id ? <form className="inline-rename" onSubmit={(event) => {
                        event.preventDefault();
                        const title = rename.title.trim();
                        if (!title) return;
                        update(config.key, records.map((entry) => idFor(entry) === id ? { ...entry, title } : entry));
                        setRename(null);
                    }}><input aria-label="Flow name" value={rename.title} onChange={(event) => setRename({ id, title: event.target.value })} autoFocus /><button className="soft">Save</button><button type="button" className="soft" onClick={() => setRename(null)}>Cancel</button></form>
                    : <button className="soft" onClick={() => setRename({ id, title: item.title })}>Rename</button>)}
                    {name !== "Downloads" && <button className="icon-button" aria-label={"Open " + item.title + " in new tab"} onClick={() => open(item, true)}><ExternalLink size={15} /></button>}
                    <button className="icon-button" aria-label={"Remove " + item.title} onClick={() => remove([id])}><X size={15} /></button>
                </div>;
            })}
        </section>
    );
}
