// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from 'vitest';
import { krontermDesktopTools } from './bot-desktop.ts';
import type { SendTurnInput } from '../contracts.ts';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('prepares the named bot desktop before attaching its scoped MCP server',async()=>{
  vi.stubEnv('KRONTERM_BOT_BRIDGE_URL','http://127.0.0.1:9901');vi.stubEnv('KRONTERM_BOT_BRIDGE_TOKEN','private-bridge');
  const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({tools:{url:'http://127.0.0.1:9902/mcp',token:'bot-only'}})});vi.stubGlobal('fetch',request);
  expect(await krontermDesktopTools({botId:'one'} as SendTurnInput,'customAcp')).toEqual({type:'http',name:'kronterm',url:'http://127.0.0.1:9902/mcp',headers:[{name:'Authorization',value:'Bearer bot-only'}]});
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({botId:'one'});
  expect(request.mock.calls[0][1].headers.authorization).toBe('Bearer private-bridge');
});
it('fails the turn when its desktop cannot be provisioned',async()=>{
  vi.stubEnv('KRONTERM_BOT_BRIDGE_URL','http://127.0.0.1:9901');vi.stubEnv('KRONTERM_BOT_BRIDGE_TOKEN','private-bridge');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));
  await expect(krontermDesktopTools({botId:'one'} as SendTurnInput,'customAcp')).rejects.toThrow('could not be prepared');
});
it('leaves standalone upstream and other agent engines alone',async()=>{
  vi.stubEnv('KRONTERM_BOT_BRIDGE_URL','');expect(await krontermDesktopTools({botId:'one'} as SendTurnInput,'customAcp')).toBeNull();
  vi.stubEnv('KRONTERM_BOT_BRIDGE_URL','http://127.0.0.1:9901');vi.stubEnv('KRONTERM_BOT_BRIDGE_TOKEN','token');expect(await krontermDesktopTools({botId:'one'} as SendTurnInput,'claude')).toBeNull();
});
