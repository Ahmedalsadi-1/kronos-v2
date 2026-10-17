import type { OSModeState } from "./os-workspace-model";

export type OSTabGroup = { id: string; blockIds: string[]; activeBlockId: string };
export type OSTabAction =
    | { type: "os.tabs.group"; blockId: string; targetBlockId: string }
    | { type: "os.tabs.detach"; blockId: string }
    | { type: "os.tabs.reorder"; blockId: string; index: number };

export function reconcileOSTabGroups(groups: OSTabGroup[] = [], blockIds: string[]): OSTabGroup[] {
    const used = new Set<string>();
    return groups.flatMap((group) => {
        const ids = group.blockIds.filter((id) => {
            if (!blockIds.includes(id) || used.has(id)) return false;
            used.add(id);
            return true;
        });
        return ids.length < 2
            ? []
            : [
                  {
                      ...group,
                      blockIds: ids,
                      activeBlockId: ids.includes(group.activeBlockId) ? group.activeBlockId : ids[0],
                  },
              ];
    });
}

export function getOSTabGroup(state: OSModeState, blockId: string) {
    return state.tabGroups?.find((group) => group.blockIds.includes(blockId));
}

export function reduceOSTabs(state: OSModeState, action: OSTabAction): OSModeState {
    if (!state.windows[action.blockId]) return state;
    const current = getOSTabGroup(state, action.blockId);
    let groups = state.tabGroups ?? [];
    if (action.type === "os.tabs.group") {
        if (action.blockId === action.targetBlockId || !state.windows[action.targetBlockId]) return state;
        const target = getOSTabGroup(state, action.targetBlockId);
        if (current === target && current) return state;
        groups = groups.filter((group) => group !== current && group !== target);
        const ids = [...(target?.blockIds ?? [action.targetBlockId]), ...(current?.blockIds ?? [action.blockId])];
        groups = [
            ...groups,
            { id: target?.id ?? `tabs-${action.targetBlockId}`, blockIds: ids, activeBlockId: action.blockId },
        ];
    } else if (action.type === "os.tabs.detach") {
        groups = groups.map((group) => ({ ...group, blockIds: group.blockIds.filter((id) => id !== action.blockId) }));
    } else if (current) {
        const ids = current.blockIds.filter((id) => id !== action.blockId);
        ids.splice(Math.max(0, Math.min(ids.length, action.index)), 0, action.blockId);
        groups = groups.map((group) => (group === current ? { ...group, blockIds: ids } : group));
    }
    return {
        ...state,
        tabGroups: reconcileOSTabGroups(groups, Object.keys(state.windows)),
        scene: { kind: "focused", blockId: action.blockId },
        selectedEntityId: action.blockId,
    };
}
