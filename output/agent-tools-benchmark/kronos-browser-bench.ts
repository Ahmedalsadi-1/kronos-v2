import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { GuestBrowser, guestPython } from '../../emain/computer-plugins/guest-commands.ts';
const base='/Users/albsheralsadi/.kronterm/linux-desktops/qemu';
const ssh=['-i',`${base}/id_ed25519`,'-p','59622','-o','BatchMode=yes','-o',`ControlPath=${base}/ssh-control`,'cua@127.0.0.1'];
const exec=(cmd:string)=>execFileSync('ssh',[...ssh,cmd],{encoding:'utf8',timeout:30000});
const created=JSON.parse(exec(guestPython(`import urllib.request,json\nwith urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:9222/json/new?about:blank',method='PUT'),timeout=3) as r:print(r.read().decode())`,{})));
const pageId=created.id;
const call=(args:object)=>JSON.parse(exec(guestPython(GuestBrowser,{...args,pageId})));
const result=(r:any)=>JSON.parse(r.result.result.value);
try {
call({action:'evaluate',expression:`document.body.innerHTML='<div id="nested" style="width:200px;height:200px;overflow:auto"><div style="width:1500px;height:2000px">Benchmark only</div></div><input id="field">';document.title='KronOS temporary benchmark';true`});
const samples=[];const outputs=[];
for(let i=0;i<5;i++){
const start=performance.now();const r=result(call({action:'scroll',selector:'#nested',deltaX:37,deltaY:83}));samples.push(Math.round(performance.now()-start));outputs.push(r.actual);
if(Math.abs(r.actual.x-37)>1||Math.abs(r.actual.y-83)>1)throw Error('Inaccurate nested scroll: '+JSON.stringify(r));
}
const filled=result(call({action:'fill',selector:'#field',text:'verified text'}));
if(!filled.valueMatches)throw Error('Fill failed');
result(call({action:'scroll',selector:'#nested',deltaY:10000}));
const boundary=result(call({action:'scroll',selector:'#nested',deltaY:10000}));
if(boundary.moved)throw Error('Boundary detection failed');
const report={samples_ms:samples,actual_movements:outputs,fill_verified:filled.valueMatches,boundary_verified:!boundary.moved};
console.log(JSON.stringify(report,null,2));writeFileSync('/Users/albsheralsadi/kronterm/output/agent-tools-benchmark/browser.json',JSON.stringify(report,null,2));
}finally{
exec(guestPython(`import urllib.request\nwith urllib.request.urlopen('http://127.0.0.1:9222/json/close/'+${JSON.stringify(pageId)},timeout=3) as r:pass`,{}));
}
