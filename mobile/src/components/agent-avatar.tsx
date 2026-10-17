export function AgentAvatar({ small = false }: { small?: boolean }) {
    return (
        <span className={`agent-avatar${small ? " is-small" : ""}`} aria-hidden="true">
            <i />
            <i />
        </span>
    );
}
