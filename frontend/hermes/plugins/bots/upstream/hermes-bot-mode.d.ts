import type { HermesPlugin } from "@hermes/contrib/plugin";

declare const HermesBotMode: HermesPlugin;
export default HermesBotMode;

export function BotsPane(): import("react").ReactNode;
export function sendToGroupChat(group: string, members: { name: string; title?: string }[], text: string): void;
