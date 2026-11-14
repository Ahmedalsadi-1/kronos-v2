// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./upstream/',import.meta.url));
function patch(file,before,after){const path=root+file;const text=readFileSync(path,'utf8');if(text.includes(after))return;if(!text.includes(before))throw new Error(`Upstream changed: ${file}`);writeFileSync(path,text.replace(before,after));}
patch('src/components/Sidebar.tsx','function NewRoomPanel({ onClose }','export function NewRoomPanel({ onClose }');
patch('src/components/Avatar.tsx','export const MausAvatar = memo(forwardRef(MausAvatarComponent));','import { CoucouAvatar } from "../kronterm/coucou-avatar";\nexport const UpstreamMausAvatar = memo(forwardRef(MausAvatarComponent));\nexport const MausAvatar = CoucouAvatar;');
patch('src/main.tsx','async function chooseRoot(): Promise<React.ReactNode> {','async function chooseRoot(): Promise<React.ReactNode> {\n  if(location.pathname === "/kronterm-setup") { const {KronTermSetup}=await import("./kronterm/setup"); return <KronTermSetup/>; }');
patch('src/App.tsx','  const { state, dispatch } = useStore();','  const { state, dispatch } = useStore();\n  const krontermSelected = useRef(false);\n  useEffect(()=>{ const id=new URLSearchParams(location.search).get("group"); if(!id || !state.hydrated || krontermSelected.current)return; krontermSelected.current=true; dispatch({type:"select",id}); },[state.hydrated,dispatch]);');
patch('src/lib/brand.ts','export const DEFAULT_BRAND: Brand = { name: "OpenMausBot" };','export const DEFAULT_BRAND: Brand = { name: "KronTerm" };');
const brand=readFileSync(root+'server/brand.ts','utf8');
if(brand.includes('name: "OpenMausBot"'))patch('server/brand.ts','name: "OpenMausBot"','name: "KronTerm"');
patch('server/index.ts','  const file = join(STATIC_DIR, safe);','  const file = join(STATIC_DIR, safe);\n  const parent=process.env.KRONTERM_EMBED_PARENT_ORIGIN;\n  const embedded=(path === "/kronterm-setup" || path === "/kronterm-app") && parent && (parent === "file:" || /^https?:\\/\\/(127\\.0\\.0\\.1|localhost)(:\\d+)?$/.test(parent));\n  const pageHeaders=embedded ? {"content-security-policy":`frame-ancestors ${parent}`,"referrer-policy":"no-referrer"} : PAGE_HEADERS;');
patch('server/index.ts','...(type === "text/html" ? PAGE_HEADERS : {})','...(type === "text/html" ? pageHeaders : {})');
patch('server/index.ts','"cache-control": "no-cache", ...PAGE_HEADERS','"cache-control": "no-cache", ...pageHeaders');

patch('server/index.ts','  console.log(`openmausbot server on http://127.0.0.1:${PORT}`);','  console.log(`openmausbot server on http://127.0.0.1:${PORT}`);\n  utilityParentPort?.postMessage({type:"kronterm:ready",port:PORT});');

patch('src/App.tsx','import { useCallback, useEffect, useRef, useState } from "react";','import { KronTermDesktopLink } from "./kronterm/desktop-link";\nimport { useCallback, useEffect, useRef, useState } from "react";');
patch('src/App.tsx','    <div className="flex h-full flex-col">','    <div className="flex h-full flex-col">\n      {new URLSearchParams(location.search).get("roomOnly") !== "1" && <KronTermDesktopLink />}');
patch('server/drivers/acp/core.ts','import { augmentedPath } from "../../env-path.ts";','import { krontermDesktopTools } from "../../kronterm/bot-desktop.ts";\nimport { augmentedPath } from "../../env-path.ts";');
patch('server/drivers/acp/core.ts','        stripControlPlaneEnv(env);','        stripControlPlaneEnv(env);\n        delete env.KRONTERM_BOT_BRIDGE_URL;\n        delete env.KRONTERM_BOT_BRIDGE_TOKEN;');
patch('server/drivers/acp/core.ts','        const mcpServers = acpMcpServers(turn, { http: support.ownMcpOverHttp === true });','        const mcpServers = acpMcpServers(turn, { http: support.ownMcpOverHttp === true });\n        const krontermTools = await krontermDesktopTools(turn, DRIVER_KIND);\n        requireRunning();\n        if (krontermTools) mcpServers.push(krontermTools);');

patch('src/App.tsx', '{!calendarFocus && <Sidebar', '{!calendarFocus && !(group && new URLSearchParams(location.search).get("roomOnly") === "1") && <Sidebar');
patch('src/App.tsx', '{!calendarFocus && <button', '{!calendarFocus && !(group && new URLSearchParams(location.search).get("roomOnly") === "1") && <button');
patch('src/App.tsx', '  const viewer = useWelcomeViewer();', '  const viewer = useWelcomeViewer();\n  const projectRoom = location.pathname === "/kronterm-app" && new URLSearchParams(location.search).get("roomOnly") === "1";');
patch('src/App.tsx', '        <WelcomeGate viewer={viewer} />', '        {!projectRoom && <WelcomeGate viewer={viewer} />}');
patch('src/App.tsx', '        <GuidedTour />', '        {!projectRoom && <GuidedTour />}');
patch('src/App.tsx', '        <FirstConversationTour quiet={spotlightsQuiet(viewer)} />', '        {!projectRoom && <FirstConversationTour quiet={spotlightsQuiet(viewer)} />}');
