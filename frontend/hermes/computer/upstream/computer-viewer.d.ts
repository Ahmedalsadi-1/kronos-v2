import type { PluginContext } from "@hermes/contrib/plugin";
import type { ReactElement } from "react";

export function ComputerPane(): ReactElement;
export function attachComputerViewer(ctx: PluginContext): void;
export function wakeComputerViewer(): void;
export function showComputerSettings(): void;
export function configureManagedComputer(id: string, name: string, wsUrl: string): void;
