import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const officeSource=fs.readFileSync(path.join(dir,'office.js'),'utf8').replace("import * as THREE from 'three';",'const THREE = window.THREE;').replace('export function createOffice','function createOffice');
fs.writeFileSync(path.join(dir,'assets/office-runtime.js'),officeSource+'\nwindow.KronOffice = { createOffice };\n');
const scenes = [];
const vid = (id, name, duration, start = 0, extra = '') => `<video id="${id}" class="clip" src="assets/media/${name}.mp4" data-start="${start}" data-duration="${duration}" data-track-index="1" muted playsinline ${extra}></video>`;

function scene(id, start, duration, body, script, styles = '') {
    const html = `<!doctype html><html><body><template><style>
    #${id}{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:#08090c;color:#f0eff5}
    ${styles}
    </style><div id="${id}" data-composition-id="${id}" data-width="1920" data-height="1080" data-duration="${duration}" data-fps="30">${body}</div>
    <script>(()=>{${script}})();</script></template></body></html>`;
    fs.writeFileSync(path.join(dir, `compositions/${id}.html`), html);
    scenes.push({ id, start, duration });
}

function office(id, start, duration, returning) {
    const body = `<canvas id="${id}-room" class="office-canvas" width="1920" height="1080" data-layout-allow-overflow></canvas>
    <div id="${id}-screen" class="projected-screen">
      <div id="${id}-footage" class="office-footage">${vid(`${id}-video`, 'os', returning ? duration : 11.2, returning ? 0 : 4.8)}</div>
      <div class="physical-notch"></div>
      <div id="${id}-pet-wrap" class="office-pet"><canvas id="${id}-pet" width="500" height="500"></canvas></div>
      <div id="${id}-power" class="power-dot"><span></span></div>
    </div>
    ${returning ? '<div id="closing-type" class="closing-type"><h1 data-var-text="title">KronTerm</h1><p>macOS private beta</p></div><div id="music-credit" class="music-credit">Music: Chris Zabriskie · CC BY 4.0</div>' : ''}`;
    const script = `const office=window.KronOffice.createOffice({canvas:document.getElementById('${id}-room'),screen:document.getElementById('${id}-screen'),petCanvas:document.getElementById('${id}-pet'),petWrapper:document.getElementById('${id}-pet-wrap'),power:document.getElementById('${id}-power'),videoWrapper:document.getElementById('${id}-footage'),id:'${id}',start:${start},duration:${duration},returning:${returning}});
    ${returning ? `const tl=window.__timelines['${id}'];tl.fromTo('#closing-type',{opacity:0,y:12},{opacity:1,y:0,duration:.5,ease:'power2.out'},7.0);tl.fromTo('#music-credit',{opacity:0},{opacity:1,duration:.5},7.0);` : ''}`;
    scene(id, start, duration, body, script);
}

fs.mkdirSync(path.join(dir, 'compositions'), { recursive: true });
office('awakening', 0, 16, false);

scene('browser', 16, 18,
    `<div class="product-stage"><div id="browser-camera" class="product-surface browser-surface">${vid('browser-recording', 'browser', 18)}</div></div>`,
    `const tl=gsap.timeline({paused:true});
     tl.fromTo('#browser-camera',{scale:.99,x:0,y:0,rotationY:-4,rotationX:2},{scale:1.28,x:300,y:-40,rotationY:0,rotationX:0,duration:2,ease:'power3.inOut'},0);
     tl.to('#browser-camera',{scale:1.18,x:-220,y:0,duration:3,ease:'power3.inOut'},5);
     tl.to('#browser-camera',{scale:1,x:0,y:0,duration:3,ease:'power3.inOut'},13);
     window.__timelines.browser=tl;`
);

scene('selection', 34, 12,
    `<div class="product-stage"><div id="selection-camera" class="product-surface selection-surface">${vid('selection-recording', 'selector', 12)}</div></div>`,
    `const tl=gsap.timeline({paused:true});
     tl.fromTo('#selection-camera',{scale:.98,x:0,y:0,rotationY:4,rotationX:1},{scale:1.07,x:130,y:0,rotationY:0,rotationX:0,duration:3,ease:'power3.inOut'},0);
     tl.to('#selection-camera',{scale:1,x:0,y:0,duration:2.2,ease:'power3.inOut'},7.8);
     window.__timelines.selection=tl;`
);

scene('sessions', 46, 15,
    `<div class="fleet-space"><div id="fleet-camera">
      <div id="fleet-flights" class="fleet-panel" data-layout-allow-overflow>${vid('fleet-flights-video','flights',15)}<div class="fleet-caption" data-layout-allow-overflow>Browser task</div></div>
      <div id="fleet-phone" class="fleet-panel" data-layout-allow-overflow>${vid('fleet-android-video','android',15)}<div class="fleet-caption" data-layout-allow-overflow>Android / Labs</div></div>
      <div id="fleet-browser" class="fleet-panel" data-layout-allow-overflow>${vid('fleet-browser-video','browser',15)}<div class="fleet-caption" data-layout-allow-overflow>Browser</div></div>
    </div></div>
    <div class="fleet-status"><div>Recorded sessions</div><p>Development integration</p></div>`,
    `const tl=gsap.timeline({paused:true});
     tl.fromTo('#fleet-camera',{scale:1.75,x:-800,y:-80,rotationY:-5,rotationX:1},{scale:.80,x:0,y:-30,rotationY:3,rotationX:3,duration:5.5,ease:'power3.inOut'},0);
     tl.fromTo('#fleet-flights',{opacity:0,z:-130},{opacity:1,z:0,duration:1.7,ease:'power2.out'},2.2);
     tl.fromTo('#fleet-browser',{opacity:0,z:-150},{opacity:1,z:0,duration:1.7,ease:'power2.out'},3.2);
     tl.to('#fleet-camera',{scale:.82,x:-20,y:-30,rotationY:-2,rotationX:0,duration:3.5,ease:'sine.inOut'},6);
     tl.to('#fleet-camera',{scale:1.42,x:653,y:-514,rotationY:0,rotationX:0,duration:3.7,ease:'power3.inOut'},10);
     window.__timelines.sessions=tl;`
);

scene('canvas', 61, 9,
    `<div class="product-stage"><div id="canvas-camera" class="product-surface canvas-surface">${vid('canvas-recording','os',9)}</div></div>`,
    `const tl=gsap.timeline({paused:true});
     tl.fromTo('#canvas-camera',{scale:1,x:0,y:0,rotationY:2,rotationX:2},{scale:1.04,x:-20,y:0,rotationY:0,rotationX:0,duration:4,ease:'power3.inOut'},0);
     tl.to('#canvas-camera',{scale:1.11,x:0,y:40,duration:4,ease:'sine.inOut'},5);
     window.__timelines.canvas=tl;`
);
office('return', 70, 10, true);

const hosts = scenes.map((s, i) => `<div id="scene-${s.id}" class="clip" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${s.start}" data-duration="${s.duration}" data-width="1920" data-height="1080" data-track-index="${i}" data-track-kind="graphics"></div>`).join('\n');
const html = `<!doctype html>
<html lang="en" data-composition-variables='[{"id":"title","type":"string","label":"Product name","default":"KronTerm"}]'>
<head><meta charset="UTF-8"><meta name="viewport" content="width=1920,height=1080"><title>KronTerm / The office comes alive</title>
<script src="assets/vendor/gsap.min.js"></script><script src="assets/vendor/coucou-engine.js"></script><script src="assets/audio/energy.js"></script><script src="assets/vendor/three.min.js"></script><script src="assets/office-runtime.js"></script>
<style>
@font-face{font-family:Inter;src:url('assets/fonts/inter.woff2') format('woff2');font-weight:100 900;font-display:block}
*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#08090c}
body{font-family:Inter,sans-serif;color:#f0eff5}#root{width:100%;height:100%;position:relative;overflow:hidden;background:#08090c}
.clip{position:absolute;inset:0;width:100%;height:100%}video{display:block;width:100%;height:100%;object-fit:contain}
.product-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;perspective:2400px;overflow:hidden}
.product-surface{position:relative;flex:none;border:1px solid #34343c;background:#0b0c0e;border-radius:16px;overflow:hidden;box-shadow:0 35px 95px #000b,0 2px 2px #ffffff0b;transform-style:preserve-3d}
.browser-surface{width:1534px;height:978px}.selection-surface{width:1230px;height:902px}.canvas-surface{width:1450px;height:928px}
.office-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.projected-screen{position:absolute;left:0;top:0;width:1600px;height:1000px;transform-origin:0 0;overflow:hidden;border-radius:18px;background:#030305}
.office-footage{position:absolute;inset:0;background:#030305}.office-footage video{object-fit:contain}
.physical-notch{position:absolute;top:-1px;left:723px;width:154px;height:39px;background:#050507;border-radius:0 0 13px 13px;z-index:2}
.office-pet{position:absolute;width:320px;height:320px;z-index:3}.office-pet canvas{width:100%;height:100%}
.power-dot{position:absolute;left:1180px;top:714px;width:46px;height:46px;border:2px solid #8f839f;border-radius:50%;display:flex;align-items:center;justify-content:center}
.power-dot span{width:14px;height:14px;border:2px solid #d8cce7;border-radius:50%}
.closing-type{position:absolute;left:190px;top:417px;z-index:5;text-shadow:0 4px 35px #0009}.closing-type h1{font-size:100px;font-weight:500;letter-spacing:-5px;margin:0 0 19px}.closing-type p{font-size:30px;letter-spacing:.01em;color:#cecad7;margin:0}
.music-credit{position:absolute;left:190px;bottom:90px;font-size:28px;color:#ded8e7;z-index:5;background:#08090ce8;padding:8px 12px;border-radius:5px}
.fleet-space{position:absolute;inset:0;perspective:2400px;overflow:hidden}
#fleet-camera{position:absolute;inset:0;transform-style:preserve-3d}
.fleet-panel{position:absolute;background:#0b0c10;border:1px solid #383941;border-radius:16px;box-shadow:0 25px 70px #0009;overflow:visible;transform-style:preserve-3d}
.fleet-panel video{border-radius:15px;overflow:hidden}.fleet-caption{position:absolute;left:12px;bottom:12px;font-size:36px;color:#e3ddec;line-height:42px;white-space:nowrap;background:#08090cf0;padding:4px 9px;border-radius:4px}
#fleet-phone{left:1030px;top:360px;width:780px;height:497px}
#fleet-flights{left:120px;top:180px;width:760px;height:396px}
#fleet-browser{left:120px;top:660px;width:760px;height:484px}
.fleet-status{position:absolute;left:100px;top:78px;font-size:30px;line-height:1.4;z-index:10;background:#08090ce8;padding:12px 18px;border-radius:8px}
.fleet-status p{margin:3px 0 0;font-size:28px;color:#c4bbd6}
</style></head><body><div id="root" data-composition-id="kronterm-film" data-width="1920" data-height="1080" data-duration="80" data-fps="30">
${hosts}
<audio id="film-sound" src="assets/audio/mix.wav" data-start="0" data-duration="80" data-track-index="10" data-volume="1"></audio>
</div><script>const tl=gsap.timeline({paused:true});window.__timelines['kronterm-film']=tl;</script></body></html>`;
fs.writeFileSync(path.join(dir, 'index.html'), html);
fs.writeFileSync(path.join(dir, '../edit-decision-list.json'), JSON.stringify(scenes, null, 2));
console.log('Built', scenes.length, 'scenes, 80 seconds');
