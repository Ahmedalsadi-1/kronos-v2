import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { getWorkflowSlotStyle } from "../../frontend/app/tab/os-workflow-slot-style.ts";
export async function inspectOriginalComponents(origin, cookie, workflowId) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");
  let finish;
  const done = new Promise((resolve) => (finish = resolve));
  const server = createServer(async (req, res) => {
    try {
      if (req.url === "/finish") {
        res.end("finished");
        finish();
        return;
      }
      if (req.url === "/bridge" && req.method === "POST") {
        const parts = [];
        for await (const part of req) parts.push(part);
        const input = JSON.parse(Buffer.concat(parts).toString());
        const target = new URL(input.route, origin);
        if (target.origin !== origin || !/^\/(rest|types|icons|healthz)(\/|$)/.test(target.pathname)) {
          res.writeHead(403).end();
          return;
        }
        const response = await fetch(target, {
          method: input.method || "GET",
          headers: {
            cookie,
            "content-type": "application/json",
            "browser-id": "component-fixture",
            ...(input.pushRef ? { "push-ref": input.pushRef } : {}),
          },
          body: input.body == null ? undefined : JSON.stringify(input.body),
        });
        const text = await response.text();
        let data = text;
        try {
          data = JSON.parse(text);
        } catch {}
        console.log("Component API:", input.method || "GET", target.pathname, response.status);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ status: response.status, statusText: response.statusText, data }));
        return;
      }
      if (req.url === "/") {
        res.setHeader("content-type", "text/html");
        res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;height:100vh;background:#202024;color:#ddd;font-family:system-ui;overflow:hidden">
<nav style="position:fixed;z-index:999999;top:0;left:0"><button id="credentials">Credentials</button><button id="canvas">Canvas</button><button id="right-nodes">Right nodes</button><button id="executions">Executions</button><button id="half">50%</button><button id="normal">100%</button><button id="double">200%</button><button id="insert-widget">Insert bound widget</button><button id="refresh">Refresh document</button><button id="remount">Remount editor</button><button id="light">Light</button><button id="dark">Dark</button></nav>
<div id="viewport" style="position:absolute;inset:32px 0 16px;overflow:hidden;pointer-events:none"><div id="world" style="position:absolute;inset:0;transform-origin:0 0;pointer-events:none"><article id="os-note" data-os-object-kind="note" style="position:absolute;left:150px;top:300px;width:180px;height:70px;padding:16px;border:1px solid #8c7d4b;border-radius:12px;background:#373224;color:#ffecac;pointer-events:auto">OS note · same world</article><article id="os-widget" style="position:absolute;left:150px;top:420px;width:260px;padding:12px;border:1px solid #547b96;border-radius:10px;background:#203442;pointer-events:auto;z-index:1"><label>OS widget text <input id="os-widget-input" placeholder="Type here, including spaces" /></label><button id="os-widget-button">Widget click</button><output id="os-widget-count">0 clicks</output></article><div id="world-native"></div></div></div>
<div id="panel-frame" style="position:absolute;inset:0;pointer-events:none"><main id="host" style="position:absolute;inset:32px 0 16px;pointer-events:none;background:transparent"></main><div id="chrome" style="position:absolute;inset:32px 0 16px;pointer-events:none;z-index:1000"></div><div id="detail" style="position:absolute;inset:32px 0 16px;pointer-events:none;z-index:3000"></div><div id="header" style="position:absolute;inset:32px 0 16px;pointer-events:none;z-index:1000"></div><div id="logs" style="position:absolute;inset:32px 0 16px;pointer-events:none;z-index:1000"></div></div><aside id="right-panel" style="position:absolute;right:0;top:110px;width:340px;height:calc(100vh - 126px);z-index:2500;pointer-events:none"></aside><output id="status" style="position:fixed;bottom:0;left:0;z-index:99999;color:white;background:black"></output><script type="module">
import {mountKronTermWorkflow} from '/workflow-native/editor.js';
const styles='/workflow-native/editor.css';
const slotStyles=${JSON.stringify(Object.fromEntries(["chrome", "details", "inspector", "world"].map((kind) => [kind, getWorkflowSlotStyle(kind)])))};
function makeRoot(id,kind='chrome'){const target=document.querySelector(id);target.setAttribute('data-workflow-'+kind,'');target.setAttribute('data-workflow-native-host','');const shadow=target.attachShadow({mode:'open'});const css=document.createElement('link');css.rel='stylesheet';css.href=styles;const style=document.createElement('style');style.textContent=slotStyles[kind];const root=document.createElement('div');root.dataset.workflowSlotRoot='';shadow.append(css,style,root);return root;}
const app=makeRoot('#host','world');app.id='app';
const worldTarget=makeRoot('#world-native','world'); const viewportTarget=document.querySelector('#viewport');
const chromeTarget=makeRoot('#chrome','chrome');const detailTarget=makeRoot('#detail','details');const rightTarget=makeRoot('#right-panel','inspector');
const headerTarget=makeRoot('#header','chrome');const logsTarget=makeRoot('#logs','chrome');const panelFrame=document.querySelector('#panel-frame');
let inspectorSection='';let expanded=false,inspectorWidth=0,lastLayout={top:32,right:0,bottom:16};
function sizeDetail(){const width=panelFrame.clientWidth;const available=width-Math.min(expanded?320:480,width/2);document.querySelector('#detail').style.left='auto';document.querySelector('#detail').style.width=Math.max(0,Math.floor(Math.min(expanded?1100:760,width*(expanded?.7:.45),available)))+'px';}
function applyLayout(layout){lastLayout=layout;viewportTarget.style.inset=layout.top+'px '+(layout.right+inspectorWidth)+'px '+layout.bottom+'px 0px';for(const id of ['chrome','logs'])document.querySelector('#'+id).style.right=layout.right+'px';document.querySelector('#detail').style.top=Math.max(32,layout.top)+'px';}
new ResizeObserver(sizeDetail).observe(panelFrame);sizeDetail();
let widgetClicks=0;document.querySelector('#os-widget-button').onclick=()=>document.querySelector('#os-widget-count').textContent=(++widgetClicks)+' clicks';
let camera={x:80,y:120,zoom:1};let objects=[];
function applyCamera(value){camera={...value};host.camera=camera;document.querySelector('#world').style.transform='translate('+camera.x+'px,'+camera.y+'px) scale('+camera.zoom+')';host.setViewport?.(camera);}
const host={camera,worldTarget,viewportTarget,objectOrder:{},chromeTarget,detailTarget,headerTarget,logsTarget,panelFrame,panelDockBottom:16,dockedPanels:true,onPanelLayout:applyLayout,onDetailExpanded:value=>{expanded=value;sizeDetail();},pushUrl:'ws://'+location.host+'/rest/push',backendUrl:${JSON.stringify(origin)},browserId:'component-fixture',workflowId:${JSON.stringify(workflowId)},path:${JSON.stringify("/workflow/" + workflowId)},request:async input=>(await fetch('/bridge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)})).json(),onReady:()=>applyCamera(camera),onObjects:nodes=>{objects=nodes;host.setObjectOrder?.(Object.fromEntries(nodes.map((node,index)=>['workflow:'+host.workflowId+':'+node.id,index+2])));document.querySelector('#status').textContent='OS scene: '+nodes.length+' original nodes + OS note';},onCameraIntent: value=>{if(value.camera)applyCamera(value.camera);else if(value.fitBounds){const b=value.fitBounds;const zoom=Math.min(1,(viewportTarget.clientWidth-100)/Math.max(1,b.width),(viewportTarget.clientHeight-100)/Math.max(1,b.height));applyCamera({x:viewportTarget.clientWidth/2-(b.x+b.width/2)*zoom,y:viewportTarget.clientHeight/2-(b.y+b.height/2)*zoom,zoom});}},openChat:()=>document.querySelector('#status').textContent='Regular Hermes chat requested',onInspector: section=>openInspector(section)};
for(const id of ['os-widget','os-note'])document.querySelector('#'+id).addEventListener('pointerdown',()=>host.closeNodeEditor?.());
function openInspector(section){if(inspectorSection===section)return;inspectorSection=section;inspectorWidth=340;panelFrame.style.right=inspectorWidth+'px';applyLayout(lastLayout);document.querySelector('#right-panel').style.pointerEvents='auto';if(section==='nodes'){host.setExecutionTarget(null);host.setPickerTarget(rightTarget);host.openPicker();}else{host.setPickerTarget(null);host.setExecutionTarget(rightTarget);}}
window.addEventListener('error',event=>document.querySelector('#status').textContent='ERROR: '+(event.error?.stack || event.message));
window.addEventListener('unhandledrejection',event=>document.querySelector('#status').textContent='ERROR: '+String(event.reason?.stack || event.reason));
document.querySelector('#right-nodes').onclick=()=>openInspector('nodes');document.querySelector('#executions').onclick=()=>openInspector('executions');
document.querySelector('#credentials').onclick=()=>host.navigate('/home/credentials');document.querySelector('#canvas').onclick=()=>{inspectorSection='';inspectorWidth=0;panelFrame.style.right='0';applyLayout(lastLayout);host.setPickerTarget(null);host.setExecutionTarget(null);document.querySelector('#right-panel').style.pointerEvents='none';host.navigate('/workflow/'+host.workflowId);};
for(const [id,zoom] of [['half',0.5],['normal',1],['double',2]]) document.querySelector('#'+id).onclick=()=>applyCamera({...camera,zoom});
for(const theme of ['light','dark'])document.querySelector('#'+theme).onclick=()=>{document.body.style.background=theme==='dark'?'#202024':'#f4f5f6';host.setTheme(theme);};
document.querySelector('#insert-widget').onclick=()=>host.insertWidgetNode({workflowId:host.workflowId,blockId:'smoke-widget',label:'Bound smoke widget'}).catch(error=>document.querySelector('#status').textContent=String(error));
document.querySelector('#refresh').onclick=async()=>{const result=await host.request({route:'/rest/workflows/'+host.workflowId});await host.refreshDocument(result.data.data);};
let dispose;document.querySelector('#remount').onclick=async()=>{dispose?.();dispose=await mountKronTermWorkflow(app,host);};
mountKronTermWorkflow(app,host).then(value=>dispose=value).catch(error=>document.querySelector('#status').textContent='ERROR: '+String(error));
</script></body></html>`);
        return;
      }
      const file = path.resolve(root, "." + decodeURIComponent(req.url.split("?")[0]));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      const mime = {
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".wasm": "application/wasm",
        ".json": "application/json",
        ".woff2": "font/woff2",
      };
      res.setHeader("content-type", mime[path.extname(file)] || "application/octet-stream");
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      console.error(error);
      res.writeHead(500).end(String(error));
    }
  });
  const sockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const upstream = new WebSocket(origin.replace(/^http/, "ws") + req.url, {
      headers: { cookie, "browser-id": "component-fixture", origin },
    });
    sockets.handleUpgrade(req, socket, head, (client) => {
      const pending = [];
      client.on("message", (data, binary) =>
        upstream.readyState === WebSocket.OPEN ? upstream.send(data, { binary }) : pending.push([data, binary])
      );
      upstream.on("open", () => {
        for (const [data, binary] of pending) upstream.send(data, { binary });
      });
      upstream.on("message", (data, binary) => client.send(data, { binary }));
      client.on("close", () => upstream.close());
      upstream.on("close", () => client.close());
      upstream.on("error", () => client.close());
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  console.log("ORIGINAL_COMPONENT_FIXTURE=http://127.0.0.1:" + server.address().port);
  await done;
  for (const client of sockets.clients) client.terminate();
  sockets.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
