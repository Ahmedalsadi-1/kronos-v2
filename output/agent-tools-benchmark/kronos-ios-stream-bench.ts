import { writeFileSync } from 'node:fs';
import { MjpegFrameStream } from '../../emain/device-simulator/orca-ios/mjpeg-frame-stream.ts';
async function main(){
const start=performance.now();const received:number[]=[];
await new Promise<void>((resolve,reject)=>{
 const timer=setTimeout(()=>{stream.stop();reject(Error('No live stream frames'));},10000);
 const stream=new MjpegFrameStream('http://127.0.0.1:3100/stream.mjpeg',{
  onFrame:()=>{received.push(Math.round(performance.now()-start));if(received.length===10){clearTimeout(timer);stream.stop();resolve();}},
  onError:e=>{clearTimeout(timer);stream.stop();reject(Error(e));}
 });stream.start();
});
const report={first_frame_ms:received[0],frame_arrivals_ms:received,intervals_ms:received.slice(1).map((t,i)=>t-received[i])};
console.log(JSON.stringify(report,null,2));writeFileSync('/Users/albsheralsadi/kronterm/output/agent-tools-benchmark/ios-stream.json',JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
