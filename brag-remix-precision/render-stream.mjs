import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {resolve} from 'node:path';
const root = resolve(process.argv[2] ?? 'composition');
const output = resolve(process.argv[3] ?? 'final.mp4');
const {default: puppeteer} = await import(pathToFileURL(process.env.REMIX_PUPPETEER).href);
const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--allow-file-access-from-files','--disable-dev-shm-usage']
});
let encoder;
try {
    const page = await browser.newPage();
    await page.setViewport({width:1920,height:1080});
    await page.goto(pathToFileURL(root+'/index.html').href);
    const metadata = await page.evaluate(async () => {
        await document.fonts.ready;
        document.querySelectorAll('video').forEach(video => video.style.visibility='hidden');
        return [...document.querySelectorAll('audio')].map(audio => ({src:audio.getAttribute('src'),...audio.dataset}));
    });
    const args=['-loglevel','error','-y','-f','image2pipe','-framerate','30','-vcodec','mjpeg','-i','pipe:0'];
    const filters=[];
    metadata.forEach((audio,index)=>{
        args.push('-i',resolve(root,audio.src));
        filters.push(`[${index+1}:a]atrim=duration=${audio.duration},asetpts=PTS-STARTPTS,volume=${audio.volume??1},adelay=${Math.round(Number(audio.start)*1000)}:all=1[a${index}]`);
    });
    filters.push(metadata.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=${metadata.length}:normalize=0,apad[a]`);
    args.push('-filter_complex',filters.join(';'),'-map','0:v','-map','[a]','-t','50','-c:v','h264_videotoolbox','-b:v','4M','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',output);
    encoder=spawn('ffmpeg',args,{stdio:['pipe','inherit','inherit']});
    const finished=once(encoder,'close');
    for(let frame=0;frame<1500;frame++){
        await page.evaluate(async time=>{
            Object.values(window.__timelines)[0].seek(time);
            await Promise.all([...document.querySelectorAll('video')].map(async video=>{
                const start=Number(video.dataset.start);
                const active=time>=start && time<start+Number(video.dataset.duration);
                video.style.visibility=active?'visible':'hidden';
                if(!active)return;
                const seek=Math.min(Math.max(0,video.duration-.016),time-start);
                if(Math.abs(seek-video.currentTime)<.001&&video.readyState>=2)return;
                await new Promise(resolve=>{
                    video.addEventListener('seeked',resolve,{once:true});
                    video.currentTime=seek;
                    setTimeout(resolve,500);
                });
            }));
        },frame/30);
        const screenshot=await page.screenshot({type:'jpeg',quality:94});
        if(!encoder.stdin.write(screenshot))await once(encoder.stdin,'drain');
        if(frame%150===0)console.log(`Frame ${frame}/1500`);
    }
    encoder.stdin.end();
    const [code]=await finished;
    if(code!==0)throw new Error(`ffmpeg exited with code ${code}`);
} finally {
    if(encoder?.exitCode===null)encoder.kill();
    await browser.close();
}
