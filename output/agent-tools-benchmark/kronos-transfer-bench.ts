import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { GuestFiles, guestPython } from '../../emain/computer-plugins/guest-commands.ts';
import { guestFileWriteCommands } from '../../emain/computer-plugins/guest-file-transfer.ts';
const base='/Users/albsheralsadi/.kronterm/linux-desktops/qemu';
const ssh=['-i',`${base}/id_ed25519`,'-p','59622','-o','BatchMode=yes','-o',`ControlPath=${base}/ssh-control`,'cua@127.0.0.1'];
const text=Array.from({length:2000},(_,i)=>`export const value${i} = ${i}; // coding benchmark\n`).join('');
const oldSource=execFileSync('git',['show','HEAD:emain/computer-plugins/guest-commands.ts'],{encoding:'utf8'});
const originalFiles=oldSource.split('export const GuestFiles = `')[1].split('`;')[0];
const originalCommand=(source:string,input:object)=>`python3 -c "import base64; exec(base64.b64decode('${Buffer.from(source).toString('base64')}'))" '${Buffer.from(JSON.stringify(input)).toString('base64')}'`;
const results:any={bytes:Buffer.byteLength(text)};
for(const mode of ['before','after']){
const path=`/tmp/kronos-transfer-bench-${mode}.txt`;
const commands=mode==='before'?Array.from({length:Math.ceil(text.length/2000)},(_,i)=>originalCommand(originalFiles,{action:i?'append':'write',path,text:text.slice(i*2000,(i+1)*2000)})):guestFileWriteCommands(path,text);
const times=[];
for(let sample=0;sample<3;sample++){
const start=performance.now();for(const command of commands)execFileSync('ssh',[...ssh,command],{stdio:'ignore'});times.push(Math.round(performance.now()-start));
}
const hash=execFileSync('ssh',[...ssh,`sha256sum ${path}`],{encoding:'utf8'}).split(' ')[0];
results[mode]={commandCount:commands.length,samples_ms:times,sha256:hash};
execFileSync('ssh',[...ssh,`rm -f ${path}`]);
}
if(results.before.sha256!==results.after.sha256)throw Error('Transfer mismatch');
console.log(JSON.stringify(results,null,2));writeFileSync('/Users/albsheralsadi/kronterm/output/agent-tools-benchmark/transfer.json',JSON.stringify(results,null,2));
