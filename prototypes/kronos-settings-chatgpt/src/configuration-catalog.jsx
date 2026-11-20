// Copyright 2026, KronOS.
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { brandText, brandValue, publicKey, sourceName } from "./branding";
import { ConfigFields } from "./catalog";
import { ChoiceGroup } from "./choice-group";
export function JsonSetting({ row, value, onChange }) {
    const text = (value) =>
        typeof value === "string"
            ? value
            : JSON.stringify(brandValue(value ?? (row.type === "json" ? {} : "")), null, 2);
    const [draft, setDraft] = useState(() => text(value));
    const [error, setError] = useState("");
    useEffect(() => setDraft(text(value)), [value]);
    return (
        <div className="json-setting">
            <textarea
                aria-label={row.label}
                value={draft}
                spellCheck={false}
                rows={Math.min(8, Math.max(3, draft.split("\n").length))}
                onChange={(e) => {
                    setDraft(e.target.value);
                    setError("");
                }}
                onBlur={() => {
                    try {
                        if (draft === text(value)) return;
                        const parsed = JSON.parse(draft);
                        if (Array.isArray(row.value) && !Array.isArray(parsed)) throw Error("Enter a JSON array.");
                        if (
                            row.value &&
                            typeof row.value === "object" &&
                            !Array.isArray(row.value) &&
                            (parsed == null || typeof parsed !== "object" || Array.isArray(parsed))
                        )
                            throw Error("Enter a JSON object.");
                        onChange(row.key, parsed);
                        setError("");
                    } catch (e) {
                        setError(e.message.startsWith("Enter") ? e.message : "Enter valid JSON before saving.");
                    }
                }}
            />
            {error && (
                <p className="field-error" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
export function SettingsGroup({ group, renderRow }) {
    return (
        <section className="group-section expanded-section">
            {group.title && (
                <div className="expanded-heading">
                    <h2>{group.title}</h2>
                    <span>{group.rows.length || ""}</span>
                </div>
            )}
            <div className="setting-group">{group.rows.map(renderRow)}</div>
            {group.note && <p className="group-note">{group.note}</p>}
        </section>
    );
}
export function ConfigurationCatalog({ renderRow }) {
    const [query, setQuery] = useState("");
    const [source, setSource] = useState("All sources");
    const fields = ConfigFields.filter(
        (f) =>
            (source === "All sources" || f.source === source) &&
            `${f.key} ${publicKey(f)} ${f.label} ${f.category} ${f.description || ""}`
                .toLowerCase()
                .includes(query.toLowerCase())
    );
    const groups = [...new Set(fields.map((f) => sourceName(f.source) + " / " + brandText(f.category)))];
    return (
        <>
            <div className="catalog-toolbar">
                <label className="search">
                    <IconSearch size={16} />
                    <input
                        aria-label="Filter configuration"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search any configuration key"
                    />
                </label>
                <ChoiceGroup
                    label="Configuration source"
                    options={["All sources", ...new Set(ConfigFields.map((field) => field.source))].map((value) => ({
                        value,
                        label: sourceName(value),
                    }))}
                    value={source}
                    onChange={setSource}
                />
            </div>
            <p className="catalog-count" role="status">
                {fields.length.toLocaleString()} settings · {groups.length} sections
            </p>
            {groups.length ? (
                groups.map((name) => (
                    <SettingsGroup
                        key={name}
                        group={{
                            title: name,
                            rows: fields.filter(
                                (field) => sourceName(field.source) + " / " + brandText(field.category) === name
                            ),
                        }}
                        renderRow={renderRow}
                    />
                ))
            ) : (
                <p className="empty">No matching configuration fields.</p>
            )}
        </>
    );
}
