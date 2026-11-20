// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { ComputerTargetAction } from "../../../frontend/types/computer-targets";
import type { ComputerTargetsRuntime } from "../../computer-targets-runtime";

export function startAndroidPreviewServer(runtime: ComputerTargetsRuntime, port = 3201) {
    const token = randomBytes(32).toString("hex");
    const clients = new Set<ServerResponse>();
    const server = createServer(async (req, res) => {
        const authority = req.headers.host;
        const boundPort = (server.address() as { port: number })?.port ?? port;
        if (![`127.0.0.1:${boundPort}`, `localhost:${boundPort}`].includes(authority)) {
            res.writeHead(403).end();
            return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        const url = new URL(req.url, `http://${authority}`);
        try {
            if (req.method === "GET" && url.pathname === "/") {
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.setHeader(
                    "Content-Security-Policy",
                    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'self'"
                );
                res.end(androidPreviewHtml(token));
                return;
            }
            if (url.searchParams.get("token") !== token) {
                res.writeHead(403).end();
                return;
            }
            const targets = (await runtime.list()).filter(
                (target) => target.kind === "android-emulator" || target.kind === "android-device"
            );
            if (req.method === "GET" && url.pathname === "/devices") {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(targets));
                return;
            }
            const target = targets.find(({ id }) => id === url.searchParams.get("target"));
            if (!target) throw new Error("Select an available Android device.");
            if (req.method === "POST" && url.pathname === "/action") {
                if (
                    req.headers.origin !== `http://${authority}` ||
                    req.headers["content-type"] !== "application/json"
                ) {
                    res.writeHead(403).end();
                    return;
                }
                let body = "";
                for await (const chunk of req) {
                    body += chunk.toString();
                    if (body.length > 16384) throw new Error("Input is too large.");
                }
                const input = JSON.parse(body) as Omit<ComputerTargetAction, "action"> & {
                    action: ComputerTargetAction["action"] | "inspect";
                };
                if (
                    !["boot", "tap", "swipe", "type", "key", "home", "back", "rotate", "inspect"].includes(input.action)
                )
                    throw new Error("Unsupported preview action.");
                if (input.action === "inspect") {
                    const snapshot = await runtime.perform({ targetId: target.id, action: "screenshot" });
                    const header = Buffer.from(snapshot.imageDataUrl?.split(",", 2)[1]?.slice(0, 32) ?? "", "base64");
                    if (header.length < 24 || header.toString("ascii", 12, 16) !== "IHDR") {
                        throw new Error("Android screen dimensions are unavailable.");
                    }
                    const element = await runtime.pickElement({
                        targetId: target.id,
                        expectedGeneration: input.expectedGeneration,
                        x: input.x,
                        y: input.y,
                        width: header.readUInt32BE(16),
                        height: header.readUInt32BE(20),
                    });
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ target, element }));
                    return;
                }
                const result = await runtime.perform({ ...input, targetId: target.id });
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ target: result.target }));
                return;
            }
            if (req.method === "GET" && url.pathname === "/video") {
                res.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
                clients.add(res);
                let closed = false;
                let unsubscribe: (() => void) | undefined;
                const heartbeat = setInterval(() => {
                    if (!res.writableNeedDrain) res.write(": heartbeat\n\n");
                }, 2000);
                res.once("close", () => {
                    closed = true;
                    clearInterval(heartbeat);
                    clients.delete(res);
                    unsubscribe?.();
                });
                unsubscribe = await runtime.subscribeAndroidVideo(target.id, (packet) => {
                    if (closed) return;
                    if (res.writableLength > 2 * 1024 * 1024) {
                        res.destroy();
                        return;
                    }
                    res.write(`data: ${JSON.stringify(packet)}\n\n`);
                });
                if (closed) unsubscribe();
                return;
            }
            res.writeHead(404).end();
        } catch (error) {
            if (!res.headersSent) res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Device unavailable." }));
        }
    });
    server.listen(port, "127.0.0.1");
    return {
        server,
        close: () => {
            for (const client of clients) client.destroy();
            server.close();
        },
    };
}

function androidPreviewHtml(token: string): string {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Android Simulator</title><style>
* { box-sizing: border-box; }
body { color-scheme: dark; margin: 0; background: #101010; color: #eee; font: 13px system-ui; }
main {
    width: min(calc(100vw - 32px), calc((100dvh - 96px) * .46));
    margin: auto; min-height: 100dvh; display: flex; flex-direction: column;
    justify-content: center; align-items: center; gap: 12px; padding-block: 12px;
}
main.landscape { width: min(calc(100vw - 32px), calc((100dvh - 96px) * 2.15)); }
.device-toolbar {
    display: flex; align-items: center; gap: 4px; border: 1px solid #333;
    border-radius: 24px; background: #1d1d1f; padding: 7px 10px; width: 100%;
}
.device-identity { flex: 1; min-width: 0; display: grid; }
.device-identity select { font-weight: 600; max-width: 100%; }
.device-identity small { padding-inline: 3px; color: #a0a0a4; }
.device-toolbar button, .device-toolbar select, .device-tools button, .device-tools input {
    color: inherit; background: transparent; border: 0; font: inherit; border-radius: 8px;
}
.device-toolbar button, .device-tools button { cursor: pointer; padding: 6px; }
.device-toolbar button { display: grid; place-items: center; width: 31px; height: 31px; }
.device-toolbar button:hover, .device-tools button:hover { background: #383838; }
.device-toolbar button[aria-pressed="true"] { background: #423456; color: #dec8ff; }
.device-toolbar button:disabled { opacity: .35; cursor: default; }
#device-screen {
    display: block; width: 100%; height: auto; border-radius: 12% / 5.5%;
    touch-action: none; cursor: crosshair; background: #161616;
}
main.landscape #device-screen { border-radius: 5.5% / 12%; }
.device-tools {
    position: fixed; right: 12px; top: 12px; max-width: calc(100vw - 24px);
    background: #202020; border: 1px solid #383838; border-radius: 12px; padding: 8px;
}
.device-tools[hidden] { display: none; }
.device-tools form { display: flex; gap: 4px; margin-top: 4px; }
.device-tools input { flex: 1; min-width: 0; border: 1px solid #444; padding: 6px; }
#device-status { color: #aaa; min-height: 16px; font: 12px ui-monospace, monospace; text-align: center; }
#device-status[data-live="true"] { color: #54d782; }
main :focus-visible { outline: 2px solid #ad8aff; outline-offset: 2px; }
</style></head><body><main id="device-preview">
<header class="device-toolbar">
    <div class="device-identity"><select aria-label="Android device"></select><small id="device-runtime"></small></div>
    <button data-action="home" type="button" title="Home" aria-label="Home">⌂</button>
    <button id="inspect" type="button" title="Inspect screen elements" aria-label="Inspect screen elements" aria-pressed="false">⌖</button>
    <button id="rotate" type="button" title="Rotate device" aria-label="Rotate device">↻</button>
    <button id="tools" type="button" title="Device tools" aria-label="Device tools" aria-expanded="false" aria-controls="device-tools">⋯</button>
</header>
<canvas id="device-screen" aria-label="Live Android screen" tabindex="0"></canvas>
<output id="device-status" aria-live="polite">Connecting…</output>
<div id="device-tools" class="device-tools" hidden>
    <button data-action="back" type="button">Back</button><button id="start" type="button">Reconnect</button>
    <form><input aria-label="Type on Android" placeholder="Type on device…"><button>Send</button></form>
</div>
</main><script>
const token=${JSON.stringify(token)},select=document.querySelector('select'),screen=document.querySelector('#device-screen'),status=document.querySelector('#device-status');let devices=[],current,busy=false;
let pendingText="",textTimer;
const layout=document.querySelector('#device-preview'), inspector=document.querySelector('#inspect'), rotate=document.querySelector('#rotate');
const tools=document.querySelector('#tools'), toolsPanel=document.querySelector('#device-tools');
let inspecting=false;
tools.onclick=()=>{
    toolsPanel.hidden=!toolsPanel.hidden;
    tools.setAttribute('aria-expanded',String(!toolsPanel.hidden));
};
inspector.onclick=()=>{
    inspecting=!inspecting;
    inspector.setAttribute('aria-pressed',String(inspecting));
    status.textContent=inspecting?'Click an element to inspect':'● live';
};
rotate.onclick=()=>act({action:'rotate',orientation:screen.width>screen.height?'portrait':'landscape-left'});
function endpoint(path){return path+'?token='+token+'&target='+encodeURIComponent(current.id)}
async function act(input){if(busy||!current)return;busy=true;try{const r=await fetch(endpoint('/action'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,expectedGeneration:current.controlGeneration})});const v=await r.json();if(!r.ok)throw Error(v.error);current=v.target;
devices=devices.map(device=>device.id===current.id?current:device);
if(input.action==='inspect') status.textContent=v.element?.name||v.element?.role||'No element at this point';
else if(status.dataset.live==='true') status.textContent='● live';
return true}catch(e){status.textContent=e.message;return false}finally{busy=false}}
async function connect(){clearTimeout(textTimer);pendingText='';current=devices.find(d=>d.id===select.value);if(!current)return;document.querySelector('#device-runtime').textContent=current.runtime;rotate.disabled=!current.capabilities?.includes('rotate');if(current.status==='shutdown'){status.textContent='Starting Android…';if(!await act({action:'boot'}))return;rotate.disabled=!current.capabilities?.includes('rotate')}status.dataset.live='false';startVideo();status.textContent='Connecting…'}
let source,decoder,config;
function startVideo(){source?.close();if(decoder&&decoder.state!=='closed')decoder.close();config=null;decoder=new VideoDecoder({output:frame=>{if(screen.width!==frame.displayWidth||screen.height!==frame.displayHeight){screen.width=frame.displayWidth;screen.height=frame.displayHeight;layout.classList.toggle('landscape',screen.width>screen.height);}screen.getContext('2d').drawImage(frame,0,0);frame.close();if(status.dataset.live!=='true'){status.dataset.live='true';status.textContent='● live'}},error:e=>status.textContent=e.message});source=new EventSource(endpoint('/video'));source.onmessage=e=>{try{const packet=JSON.parse(e.data);let data=Uint8Array.fromBase64(packet.data);if(packet.config){config=data;const i=data.findIndex((n,i)=>n===103&&i>2&&data[i-1]===1);if(i<0)throw Error('Android did not provide H.264 configuration');const codec='avc1.'+Array.from(data.slice(i+1,i+4),n=>n.toString(16).padStart(2,'0')).join('');decoder.configure({codec,optimizeForLatency:true});return}if(decoder.state!=='configured')return;if(packet.key&&config){const joined=new Uint8Array(config.length+data.length);joined.set(config);joined.set(data,config.length);data=joined}if(decoder.decodeQueueSize>8){source.close();status.textContent='Preview fell behind. Use Reconnect in Device tools.';return}decoder.decode(new EncodedVideoChunk({type:packet.key?'key':'delta',timestamp:packet.timestamp,data}))}catch(e){status.textContent=e.message;source.close()}};source.onerror=()=>{source.close();status.dataset.live='false';status.textContent='Stream disconnected. Use Reconnect in Device tools.'}}
select.onchange=connect;document.querySelector('#start').onclick=connect;document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>act({action:b.dataset.action}));
let down;function point(e){const r=screen.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}}
screen.onpointerdown=e=>{screen.focus();down=point(e);screen.setPointerCapture(e.pointerId)};screen.onpointercancel=()=>down=null;screen.onpointerup=e=>{if(!down)return;const p=point(e),s=down;down=null;if(inspecting){act({action:'inspect',...p});return}act(Math.hypot(p.x-s.x,p.y-s.y)>.025?{action:'swipe',...s,endX:p.x,endY:p.y}:{action:'tap',...p})};
document.querySelector('form').onsubmit=async e=>{e.preventDefault();const input=document.querySelector('input');if(input.value&&await act({action:'type',text:input.value}))input.value=''};
function flushTyping() {
    if (!pendingText) return;
    if (busy) { textTimer=setTimeout(flushTyping, 40); return; }
    const text=pendingText;
    pendingText="";
    void act({action:'type',text});
}
screen.onkeydown=e=>{if(['Enter','Backspace','Tab','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();act({action:'key',key:e.key})}else if(e.key.length===1&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();pendingText+=e.key;clearTimeout(textTimer);textTimer=setTimeout(flushTyping,60)}};
fetch('/devices?token='+token).then(r=>r.json()).then(list=>{devices=list;for(const d of list){const o=document.createElement('option');o.value=d.id;o.textContent=d.name;select.append(o)}const requested=new URLSearchParams(location.search).get('target');if(requested&&!list.some(d=>d.id===requested))throw Error('Requested Android device is unavailable');const running=list.find(d=>d.id===requested)||list.find(d=>d.status==='booted'||d.status==='connected');if(running)select.value=running.id;if(requested)select.disabled=true;if(list.length)connect();else status.textContent='No Android devices available'}).catch(e=>status.textContent=e.message);
</script></body></html>`;
}
