import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { VmHistoryStore } from '../../emain/linux-desktop/vm-history.ts';
async function main() {
const dir = await mkdtemp(join(tmpdir(),'kronos-history-'));
const disk = join(dir,'ubuntu.qcow2');
const run = (cmd:string,args:string[]) => execFileSync(cmd,args,{encoding:'utf8'});
try {
run('/opt/homebrew/bin/qemu-img',['create','-f','qcow2',disk,'32M']);
run('/opt/homebrew/bin/qemu-io',['-f','qcow2','-c','write -P 0x11 0 4096',disk]);
const store = new VmHistoryStore(dir);
const first = await store.create('first',false,()=>{});
run('/opt/homebrew/bin/qemu-io',['-f','qcow2','-c','write -P 0x22 0 4096',disk]);
const restored = await store.restore(first.head!,false,()=>{});
run('/opt/homebrew/bin/qemu-io',['-f','qcow2','-c','read -P 0x11 0 4096',disk]);
if(restored.checkpoints.length!==2)throw Error('Departing state not preserved');
await store.restore(restored.checkpoints[1].id,false,()=>{});
run('/opt/homebrew/bin/qemu-io',['-f','qcow2','-c','read -P 0x22 0 4096',disk]);
console.log('PASS: real qcow2 checkpoint, restore, automatic backup, and forward restore');
}finally{await rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
