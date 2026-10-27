// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import type { SendTurnInput } from '../contracts.ts';
import type { AcpMcpServer } from '../drivers/turn-mcp.ts';
import { canUseMcpServer } from '../../shared/tool-scope.ts';

export async function krontermDesktopTools(turn: SendTurnInput, driver: string): Promise<AcpMcpServer | null> {
  const origin=process.env.KRONTERM_BOT_BRIDGE_URL;
  const token=process.env.KRONTERM_BOT_BRIDGE_TOKEN;
  if(!origin || !token || !turn.botId || driver !== 'customAcp')return null;
  const url=new URL('/bot-desktop',origin);
  if(url.protocol!=='http:' || url.hostname!=='127.0.0.1')throw new Error('Invalid KronTerm desktop bridge');
  const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({botId:turn.botId}),signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw new Error('The bot desktop could not be prepared. Reopen its KronTerm workspace and retry.');
  const desktop=await response.json();
  if(turn.toolScope !== undefined && !canUseMcpServer(turn.toolScope,'kronterm'))return null;
  return {type:'http',name:'kronterm',url:desktop.tools.url,headers:[{name:'Authorization',value:`Bearer ${desktop.tools.token}`}]};
}
