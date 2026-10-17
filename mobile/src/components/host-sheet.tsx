import {
    Check,
    ChevronDown,
    Cloud,
    Laptop2,
    LoaderCircle,
    Plus,
    RefreshCw,
    Server,
    Smartphone,
    Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { parsePairingLink } from "../lib/pairing-link";
import type { HostKind, HostRuntimeState } from "../types";
import "./host-pairing.css";

export interface ConnectHostInput {
    label: string;
    baseUrl: string;
    kind: HostKind;
    token?: string;
    code?: string;
}

interface HostSheetProps {
    open: boolean;
    hosts: HostRuntimeState[];
    connecting: boolean;
    onClose: () => void;
    onConnect: (input: ConnectHostInput) => Promise<void>;
    onRemove: (hostId: string) => Promise<void>;
    onRefresh: () => Promise<void>;
    pairingUrl?: string;
    onUse?: (hostId: string) => void;
    onUseLocal?: () => void;
}

const KindOptions: Array<{ kind: HostKind; label: string; detail: string; icon: typeof Cloud }> = [
    {
        kind: "managed",
        label: "Kron Cloud",
        detail: "Always-on Browser Host or full Kron Sandbox",
        icon: Cloud,
    },
    {
        kind: "computer",
        label: "My computer",
        detail: "Pair the KronLink Host running on your Mac or PC",
        icon: Laptop2,
    },
    {
        kind: "sandbox",
        label: "Self-hosted",
        detail: "Connect your own KronosCode or KronTerm server",
        icon: Server,
    },
];

export const HostSheet = ({
    open,
    hosts,
    connecting,
    onClose,
    onConnect,
    onRemove,
    onRefresh,
    pairingUrl,
    onUse,
    onUseLocal,
}: HostSheetProps) => {
    const [adding, setAdding] = useState(false);
    const [kind, setKind] = useState<HostKind>("computer");
    const [label, setLabel] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [token, setToken] = useState("");
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [qrLink, setQrLink] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const busy = connecting || submitting;
    const refresh = async () => {
        setRefreshing(true);
        setError("");
        try {
            await onRefresh();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not refresh computers");
        } finally {
            setRefreshing(false);
        }
    };
    const remove = async (hostId: string) => {
        try {
            await onRemove(hostId);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not remove computer");
        }
    };
    const applyLink = (value: string) => {
        const link = parsePairingLink(value);
        if (!link) {
            setError("Pairing link is invalid or expired. Generate a new QR on your Mac.");
            return;
        }
        setBaseUrl(link.baseUrl);
        setKind("computer");
        setAdding(true);
        setCode("");
        setError("");
    };
    useEffect(() => {
        if (pairingUrl) applyLink(pairingUrl);
    }, [pairingUrl]);

    useEffect(() => {
        if (!open) {
            setAdding(false);
            setError("");
        }
    }, [open]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setSubmitting(true);
        setError("");
        try {
            await onConnect({ label, baseUrl, kind, token, code });
            setAdding(false);
            setLabel("");
            setBaseUrl("");
            setToken("");
            setCode("");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not connect this host");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className={`host-sheet host-pairing-sheet ${open ? "is-open" : ""}`} aria-hidden={!open} inert={!open}>
            <div className="sheet-drag-handle" />
            <header className="host-sheet-header">
                <button type="button" onClick={onClose} aria-label="Close hosts">
                    <ChevronDown />
                </button>
                <div>
                    <strong>Computers & devices</strong>
                    <small>Local first. Connect a computer when you need it.</small>
                </div>
                <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={refreshing || busy}
                    aria-label="Refresh hosts"
                >
                    <RefreshCw className={refreshing ? "spin" : ""} />
                </button>
            </header>

            <div className="host-sheet-body">
                {onUseLocal && (
                    <button className="host-local-device" type="button" onClick={onUseLocal} disabled={busy}>
                        <Smartphone aria-hidden="true" />
                        <span>
                            <strong>This iPhone</strong>
                            <small>Local workspace, browser and Linux tools</small>
                        </span>
                        <span className="host-local-action">Use locally</span>
                    </button>
                )}
                <section className="host-pairing-guide" aria-labelledby="host-pairing-title">
                    <div className="host-pairing-heading">
                        <Laptop2 aria-hidden="true" />
                        <h2 id="host-pairing-title">Pair your Mac</h2>
                        <span>LAN</span>
                    </div>
                    <ol>
                        <li>Start KronLink Host with LAN access on your Mac and open its pairing page.</li>
                        <li>Scan its QR with iPhone Camera, or paste the pairing link below.</li>
                        <li>Enter the six-digit code displayed on your Mac.</li>
                    </ol>
                    <label htmlFor="mac-pairing-link">Pairing link</label>
                    <div className="host-pairing-link-row">
                        <input
                            id="mac-pairing-link"
                            aria-label="Mac pairing QR link"
                            value={qrLink}
                            onChange={(event) => setQrLink(event.target.value)}
                            placeholder="kronterm://pair?host=…"
                            autoCapitalize="none"
                            autoCorrect="off"
                            disabled={busy}
                        />
                        <button type="button" onClick={() => applyLink(qrLink)} disabled={busy || !qrLink.trim()}>
                            Continue
                        </button>
                    </div>
                    <p>
                        Keep both devices on the same Wi-Fi or a reachable private network. This uses KronTerm LAN
                        pairing.
                    </p>
                </section>
                {error ? (
                    <p className="form-error" role="alert">
                        {error}
                    </p>
                ) : null}
                {hosts.length ? <h2 className="host-saved-title">Saved computers</h2> : null}
                {hosts.length ? (
                    <div className="host-list">
                        {hosts.map(({ profile, connection, detail }) => (
                            <article className="host-row" key={profile.id}>
                                <span className="host-row-mark" style={{ background: profile.color }}>
                                    {profile.kind === "computer" ? (
                                        <Laptop2 />
                                    ) : profile.kind === "managed" ? (
                                        <Cloud />
                                    ) : (
                                        <Server />
                                    )}
                                </span>
                                <div>
                                    <strong>{profile.label}</strong>
                                    <small>{detail || profile.baseUrl}</small>
                                    <div className="host-capabilities">
                                        {profile.capabilities.slice(0, 4).map((capability) => (
                                            <span key={capability}>{capability}</span>
                                        ))}
                                    </div>
                                </div>
                                <span className={`host-connection host-${connection}`}>
                                    {connection === "connecting" ? <LoaderCircle className="spin" /> : <i />}
                                    {connection}
                                </span>
                                {onUse && (
                                    <button
                                        type="button"
                                        onClick={() => onUse(profile.id)}
                                        disabled={busy || connection === "connecting"}
                                    >
                                        {connection === "connecting" ? "Connecting…" : "Connect"}
                                    </button>
                                )}
                                {profile.kind !== "managed" ? (
                                    <button
                                        className="host-remove"
                                        type="button"
                                        onClick={() => void remove(profile.id)}
                                        disabled={busy}
                                        aria-label={`Remove ${profile.label}`}
                                    >
                                        <Trash2 />
                                    </button>
                                ) : null}
                            </article>
                        ))}
                    </div>
                ) : null}

                {adding ? (
                    <form className="host-form" onSubmit={submit} aria-busy={busy}>
                        <h2>{kind === "computer" ? "Confirm Mac connection" : "Connect a host"}</h2>
                        <fieldset disabled={busy}>
                            <div className="host-kind-grid">
                                {KindOptions.map((option) => {
                                    const Icon = option.icon;
                                    return (
                                        <button
                                            className={kind === option.kind ? "is-selected" : ""}
                                            type="button"
                                            key={option.kind}
                                            onClick={() => setKind(option.kind)}
                                        >
                                            <Icon />
                                            <span>
                                                <strong>{option.label}</strong>
                                                <small>{option.detail}</small>
                                            </span>
                                            {kind === option.kind ? <Check /> : null}
                                        </button>
                                    );
                                })}
                            </div>

                            <label>
                                <span>Name</span>
                                <input
                                    value={label}
                                    onChange={(event) => setLabel(event.target.value)}
                                    placeholder={kind === "computer" ? "My Mac" : "Kron Cloud"}
                                />
                            </label>
                            <label>
                                <span>Host address</span>
                                <input
                                    value={baseUrl}
                                    onChange={(event) => setBaseUrl(event.target.value)}
                                    placeholder={
                                        kind === "computer" ? "http://192.168.1.8:4119" : "https://cloud.kronterm.dev"
                                    }
                                    inputMode="url"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    required
                                />
                            </label>
                            {kind === "computer" ? (
                                <label>
                                    <span>Code shown on your Mac</span>
                                    <input
                                        className="pair-code-input"
                                        value={code}
                                        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                                        placeholder="000 000"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        pattern="[0-9]{6}"
                                        minLength={6}
                                        maxLength={6}
                                        required
                                    />
                                </label>
                            ) : (
                                <label>
                                    <span>
                                        Access token <small>optional</small>
                                    </span>
                                    <input
                                        value={token}
                                        onChange={(event) => setToken(event.target.value)}
                                        placeholder="Stored in iPhone Keychain"
                                        type="password"
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                    />
                                </label>
                            )}
                            <div className="host-form-actions">
                                <button type="button" onClick={() => setAdding(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="primary-action" disabled={busy}>
                                    {busy ? <LoaderCircle className="spin" /> : <Plus />}
                                    {busy
                                        ? "Connecting…"
                                        : error
                                          ? "Try again"
                                          : kind === "computer"
                                            ? "Pair computer"
                                            : "Add host"}
                                </button>
                            </div>
                        </fieldset>
                    </form>
                ) : (
                    <button
                        className="add-host-button"
                        type="button"
                        onClick={() => {
                            setAdding(true);
                            setKind("computer");
                        }}
                        disabled={busy}
                    >
                        <Plus />
                        Enter a host address instead
                    </button>
                )}
            </div>
        </section>
    );
};
