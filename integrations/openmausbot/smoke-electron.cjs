// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'kronterm-source-smoke-'));
app.setPath('userData',path.join(fixture,'userdata'));
const data=path.join(fixture,'userdata','agent-workspace');fs.mkdirSync(data,{recursive:true});
const originalFixture=process.argv.find(value=>value.startsWith('--fixture='))?.slice('--fixture='.length);
if(!originalFixture)throw new Error('Pass --fixture=PATH from the isolated upstream verification launcher.');
fs.copyFileSync(path.join(originalFixture,'config.json'),path.join(data,'config.json'));
process.env.HOME=fixture;process.env.USERPROFILE=fixture;
process.env.OMB_TEST_SEALED_PATH='1';
const result={};
let parentServer,runtime,win;
const timeout=setTimeout(()=>finish(new Error('Electron source integration smoke timed out')),45000);
async function finish(error){clearTimeout(timeout);runtime?.stopOpenMausBotRuntime();win?.destroy();await new Promise(resolve=>parentServer?parentServer.close(resolve):resolve());if(error){console.error(error.message);app.exit(1);}else{console.log(JSON.stringify(result));app.exit(0);}}
app.whenReady().then(async()=>{
 try{
  runtime=require(path.join(__dirname,'../../dist/openmausbot-runtime-smoke.cjs'));
  const {configureAuthKeyRequestInjection}=require(path.join(__dirname,'../../dist/openmausbot-runtime-smoke.cjs'));
  parentServer=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<html><body>Isolated source fixture</body></html>');});
  await new Promise(resolve=>parentServer.listen(0,'127.0.0.1',resolve));
  win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  configureAuthKeyRequestInjection(win.webContents.session);
  await win.loadURL(`http://127.0.0.1:${parentServer.address().port}`);
  const connection=await runtime.openMausBotConnection(win.webContents);
  result.managedBackendReady=true;
  result.parentOriginMatches=connection.parentOrigin===new URL(win.webContents.getURL()).origin;
  const embedded=new URL('/kronterm-setup',connection.origin);embedded.searchParams.set('parentOrigin',connection.parentOrigin);
  await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const frame=document.createElement('iframe');frame.src=${JSON.stringify(embedded.href)};frame.onload=()=>resolve(true);frame.onerror=()=>reject(new Error('iframe load failed'));document.body.append(frame);})`);
  result.iframeLoaded=true;
  const child=win.webContents.mainFrame.frames.find(frame=>frame.url.startsWith(connection.origin));
  if(!child)throw new Error('Embedded source frame was not found');
  result.originalFormRendered=await child.executeJavaScript(`new Promise(resolve=>{const deadline=Date.now()+15000;const poll=()=>{if(document.body.innerText.includes('New group chat'))return resolve(true);if(Date.now()>deadline)return resolve(false);setTimeout(poll,100);};poll();})`);
  result.embeddedAuthenticationWorks=await child.executeJavaScript(`fetch('/api/auth/stream-ticket',{method:'POST'}).then(response=>response.ok)`);
  if(!result.originalFormRendered||!result.embeddedAuthenticationWorks)throw new Error('Embedded source hydration or authentication failed: '+JSON.stringify(result));
  const response=await fetch(`${connection.origin}/kronterm-setup`);
  result.scopedFramePolicy=response.headers.get('content-security-policy')===`frame-ancestors ${connection.parentOrigin}`;
  result.ordinaryPagesRemainUnframeable=(await fetch(`${connection.origin}/`)).headers.get('x-frame-options')==='DENY';
  if(!result.scopedFramePolicy||!result.ordinaryPagesRemainUnframeable)throw new Error('Frame policy mismatch: '+JSON.stringify({expected:connection.parentOrigin,actual:response.headers.get('content-security-policy'),ordinary:result.ordinaryPagesRemainUnframeable}));
  await finish();
 }catch(error){await finish(error);}
}).catch(finish);
