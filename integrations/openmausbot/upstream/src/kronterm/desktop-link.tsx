// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { useStore } from '../state/store';

export function KronTermDesktopLink(){
  const {state}=useStore();
  const parentOrigin=new URLSearchParams(location.search).get('parentOrigin');
  if(!parentOrigin || (parentOrigin!=='null' && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(parentOrigin)))return null;
  const selected=state.bots.find(bot=>bot.id===state.selectedId);
  const group=state.groups.find(group=>group.id===state.selectedId);
  const bots=selected?[selected]:state.bots.filter(bot=>group?.memberIds.includes(bot.id));
  if(!bots.length)return null;
  return <div className="flex shrink-0 items-center gap-2 border-b border-hairline bg-card px-3 py-2 text-xs text-ink-secondary" aria-label="Bot desktops">
    <span>KronTerm desktops</span>
    {bots.map(bot=><button key={bot.id} type="button" className="cursor-pointer rounded-md border border-hairline px-2 py-1 text-ink hover:bg-raised" onClick={()=>parent.postMessage({source:'kronterm-openmausbot',type:'open-desktop',botId:bot.id},parentOrigin==='null'?'*':parentOrigin)}>{bot.name}</button>)}
  </div>;
}
