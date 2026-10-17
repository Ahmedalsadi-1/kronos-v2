import type { WorkspaceCanvasAgentCard } from "./workspace-canvas-agent";

export type CanvasTaskTab = "Summary" | "Browser" | "Terminal" | "Changes" | "Output";
export function taskTabForCard(card: WorkspaceCanvasAgentCard, blockView?: string): CanvasTaskTab {
    if (card.agent.nodekind === "output") return "Output";
    if (card.agent.blockid && card.agent.surface === "browser") return "Browser";
    if (card.agent.blockid && card.agent.surface === "terminal") return "Terminal";
    if (card.agent.blockid && ["aifilediff", "review"].includes(blockView)) return "Changes";
    return "Summary";
}

export function arrangeTaskLineage(cards: WorkspaceCanvasAgentCard[]): WorkspaceCanvasAgentCard[] {
    const byId = new Map(cards.map((card) => [card.id, card]));
    const levels = new Map<string, number>();
    const visit = (id: string, path = new Set<string>()): number => {
        if (levels.has(id)) return levels.get(id);
        if (path.has(id)) return 0;
        const nextPath = new Set([...path, id]);
        const parents = byId.get(id)?.agent.contextids?.filter((parent) => byId.has(parent)) ?? [];
        const level = parents.length ? 1 + Math.max(...parents.map((parent) => visit(parent, nextPath))) : 0;
        levels.set(id, level);
        return level;
    };
    const rows = new Map<number, WorkspaceCanvasAgentCard[]>();
    for (const card of cards) {
        const level = visit(card.id);
        rows.set(level, [...(rows.get(level) ?? []), card]);
    }
    const originX = Math.min(0, ...cards.map((card) => card.x));
    const originY = Math.min(0, ...cards.map((card) => card.y));
    let y = originY;
    const positions = new Map<string, { x: number; y: number }>();
    for (const [, row] of [...rows].sort(([a], [b]) => a - b)) {
        let x = originX;
        for (const card of row) {
            positions.set(card.id, { x, y });
            x += card.width + 64;
        }
        y += Math.max(...row.map((card) => card.height)) + 80;
    }
    return cards.map((card) => ({ ...card, ...positions.get(card.id) }));
}

export function searchTaskNodes(cards: WorkspaceCanvasAgentCard[], query: string) {
    const normalized = query.trim().toLocaleLowerCase();
    return cards.filter(
        (card) =>
            !normalized ||
            `${card.agent.title} ${card.agent.detail} ${card.agent.nodekind}`.toLocaleLowerCase().includes(normalized)
    );
}
