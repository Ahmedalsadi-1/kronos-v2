import { useId, useState } from "react";

export type KronTermAccountDetails = { firstName: string; lastName: string; email: string; password: string };
export function WorkflowAccount({
    onConnected,
    connect,
}: {
    onConnected: () => void;
    connect?: (account: KronTermAccountDetails) => Promise<unknown>;
}) {
    const id = useId();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [visible, setVisible] = useState(false);
    return (
        <form
            aria-label="KronTerm account setup"
            aria-busy={busy}
            className="flex flex-col gap-4 px-4 py-5 text-foreground"
            onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                const account = Object.fromEntries(new FormData(event.currentTarget)) as KronTermAccountDetails;
                setBusy(true);
                setError("");
                try {
                    if (connect) await connect(account);
                    else
                        await window.hermesDesktop.api({
                            path: "/api/kronterm/n8n/command",
                            method: "POST",
                            body: { operation: "account", account },
                            timeoutMs: 125000,
                        });
                    onConnected();
                } catch (failure) {
                    setError(
                        failure instanceof Error && /timeout|abort/i.test(failure.message)
                            ? "Account connection timed out. Try again when the workflow runtime is ready."
                            : String(failure)
                                  .replace(/^Error:\s*/, "")
                                  .replace(/\bn8n\b/gi, "workflow")
                    );
                } finally {
                    setBusy(false);
                }
            }}
        >
            <header>
                <h2 className="text-base font-medium">Create your KronTerm account</h2>
                <p className="mt-2 text-xs leading-relaxed text-foreground/60">
                    One account for your workspace and workflows.
                </p>
            </header>
            <div className="grid grid-cols-2 gap-3">
                {[
                    ["firstName", "First name", "given-name"],
                    ["lastName", "Last name", "family-name"],
                ].map(([name, label, autoComplete]) => (
                    <label key={name} htmlFor={`${id}-${name}`} className="text-xs">
                        {label}
                        <input
                            id={`${id}-${name}`}
                            required
                            disabled={busy}
                            name={name}
                            autoComplete={autoComplete}
                            className="mt-1.5 block w-full min-w-0 border border-white/20 bg-black/20 px-2 py-2 text-sm outline-none focus:border-accent"
                        />
                    </label>
                ))}
            </div>
            <label htmlFor={`${id}-email`} className="text-xs">
                Email
                <input
                    id={`${id}-email`}
                    required
                    disabled={busy}
                    name="email"
                    type="email"
                    autoComplete="email"
                    className="mt-1.5 block w-full border border-white/20 bg-black/20 px-2 py-2 text-sm outline-none focus:border-accent"
                />
            </label>
            <div>
                <label htmlFor={`${id}-password`} className="text-xs">
                    Password
                </label>
                <div className="mt-1.5 flex border border-white/20 bg-black/20 focus-within:border-accent">
                    <input
                        id={`${id}-password`}
                        required
                        disabled={busy}
                        name="password"
                        type={visible ? "text" : "password"}
                        minLength={8}
                        pattern="(?=.*[A-Z])(?=.*[0-9]).{8,}"
                        autoComplete="new-password"
                        aria-describedby={`${id}-requirements`}
                        className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none"
                    />
                    <button
                        type="button"
                        disabled={busy}
                        aria-label={visible ? "Hide password" : "Show password"}
                        aria-pressed={visible}
                        className="cursor-pointer px-2 text-xs text-foreground/60 hover:text-foreground focus-visible:outline-2"
                        onClick={() => setVisible((value) => !value)}
                    >
                        {visible ? "Hide" : "Show"}
                    </button>
                </div>
                <p id={`${id}-requirements`} className="mt-2 text-[11px] leading-relaxed text-foreground/50">
                    At least 8 characters, one capital letter and one number.
                </p>
            </div>
            {error && (
                <p role="alert" className="text-xs leading-relaxed text-red-400">
                    {error}
                </p>
            )}
            <button
                type="submit"
                disabled={busy}
                className="cursor-pointer border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
            >
                {busy ? "Connecting account…" : "Continue to KronTerm"}
            </button>
        </form>
    );
}
