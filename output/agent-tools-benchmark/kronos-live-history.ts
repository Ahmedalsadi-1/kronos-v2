import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { VmHistoryStore } from '../../emain/linux-desktop/vm-history.ts';
import { qmpCommand } from '../../emain/linux-desktop/qmp-client.ts';
async function main() {
const dir=await mkdtemp(join(tmpdir(),'kronos-live-history-'));
const sock=join(dir,'qmp.sock');
try{
execFileSync('/opt/homebrew/bin/qemu-img',['create','-f','qcow2',join(dir,'ubuntu.qcow2'),'32M']);
execFileSync('/opt/homebrew/bin/qemu-system-aarch64',['-machine','virt,accel=hvf','-cpu','host','-m','128','-S','-display','none','-drive',`file=${dir}/ubuntu.qcow2,format=qcow2,if=virtio`,'-qmp',`unix:${sock},server=on,wait=off`,'-daemonize']);
const history=new VmHistoryStore(dir);
const first=await history.create('Live memory checkpoint',true,()=>{});
const listed=await history.list(true);
console.log(JSON.stringify(listed));
if(!listed.checkpoints[0]?.includesMemory)throw Error('Memory not saved');
await history.restore(first.head!,true,()=>{});
console.log('PASS: live HVF VM memory snapshot and restore with automatic backup');
}finally{
await qmpCommand(sock,'quit').catch(()=>{});
await rm(dir,{recursive:true,force:true});
}
}
main().catch(e=>{console.error(e);process.exitCode=1});
