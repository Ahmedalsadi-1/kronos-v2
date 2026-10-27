// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react';
import { BotEditorStore, StoreProvider, api, useStore } from '../state/store';
import { DesktopCapabilitiesProvider } from '../components/DesktopCapabilities';
import { NewRoomPanel } from '../components/Sidebar';
import { NewBotDialog } from '../components/NewBotDialog';
import { setAdvancedMode } from '../lib/interface-mode';

const ParentOrigin = new URLSearchParams(location.search).get('parentOrigin') ?? '';
function notify(message: Record<string,unknown>) {
  if (ParentOrigin !== 'null' && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(ParentOrigin)) return;
  parent.postMessage({source:'kronterm-openmausbot',...message},ParentOrigin === 'null' ? '*' : ParentOrigin);
}
function Setup() {
  const store=useStore();
  const [error,setError]=useState('');
  const pending=useRef(false);
  const [creating,setCreating]=useState(false);
  useEffect(()=>{ setAdvancedMode(true); },[]);
  const scoped={...store,dispatch:((action)=>{
    if(action.type!=='createGroup'){ store.dispatch(action);return; }
    if(pending.current)return;
    pending.current=true;setCreating(true);setError('');
    api('/api/groups',{method:'POST',body:JSON.stringify({name:action.name,section:action.section,memberIds:action.memberIds})})
      .then(({group})=>notify({type:'created',group:{id:group.id,name:group.name}}))
      .catch((error)=>{setError(error instanceof Error?error.message:'Channel creation failed');pending.current=false;setCreating(false);});
  }) as typeof store.dispatch};
  if(!store.state.hydrated)return <div role="status" className="p-5 text-sm text-ink-secondary">Loading agents…</div>;
  return <BotEditorStore value={scoped}>
    <fieldset disabled={creating} style={{border:0,margin:0,padding:0}}>
      <NewRoomPanel onClose={()=>{if(!pending.current)notify({type:'cancel'});}} />
    </fieldset>
    <div style={{position:'fixed',left:0,right:0,bottom:24,zIndex:60,display:'flex',justifyContent:'center',gap:8}}>
      <button type="button" disabled={creating} className="rounded-lg border border-hairline bg-card px-4 py-2 text-sm text-ink" onClick={()=>store.dispatch({type:'toggleNewBot',open:true})}>New bot</button>
      {error && <p role="alert" className="rounded-lg bg-card p-2 text-sm text-danger">{error}</p>}
    </div>
    {store.state.newBotOpen && <NewBotDialog />}
  </BotEditorStore>;
}
export function KronTermSetup(){useEffect(()=>{const style=document.createElement("style");style.textContent="html,body,#root{background:transparent!important}";document.head.append(style);return()=>style.remove();},[]);return <DesktopCapabilitiesProvider><StoreProvider><Setup/></StoreProvider></DesktopCapabilitiesProvider>;}
