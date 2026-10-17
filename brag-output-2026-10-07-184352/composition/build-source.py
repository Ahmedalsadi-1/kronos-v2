from pathlib import Path
import math, wave, struct, random
out=Path('/Users/albsheralsadi/kronterm/brag-output-2026-10-07-184352'); p=out/'composition'
plan='''# Frame by Frame — Swiss Cut
15 seconds. 1080 x 1080. 60 fps. No narration.

## Planning rubric
1. Frame by Frame is the motion-learning product supplied in the pasted brief, living on Whop.
2. Its strongest idea is learning to choose a reference and build frame for frame.
3. Hook: MAKE / EVERY / FRAME, huge masked type and a moving cobalt disc.
4. Show the supplied prompt, lesson title, and Launch / Sound modules in a bespoke editorial product demonstration. This is a concept UI, not a captured shipping app.
5. Fifteen seconds exactly.
6. Polished with aggressive Swiss editorial choreography: asymmetric typography, modular grids, sharp cuts, zero crossfades.
7. Original synthesized 128 BPM electronic percussion, bass and chord bed, with motion-matched impacts. No voice.
8. Frame by Frame. Fifteen seconds of type, timing and precision.
9. Type a launch-video request → choose a reference → Launch / Sound modules.

## Storyboard
0–2.0: MAKE / EVERY / FRAME. Masked stacked type, rotating blue disc, typographic vertical wipe.
2.0–3.5: COUNT. Huge countershape, circle becomes quadrants, four tiles swing into an FF viewfinder.
3.5–6.0: Prompt. Frame by Frame app panel enters in perspective; Make a launch video for my app reveals; send button clicks.
6.0–8.0: Reference lesson. Editorial 2.1 / Choose a reference; diagonal letterform studies sweep into alignment; frame for frame holds.
8.0–10.0: LAUNCH. Cobalt orbit and sculptural grid tiles rotate in a cropped card.
10.0–12.0: SOUND. Circular grooves and expanding discs, exact rhythmic accents; combined Launch / Sound labels.
12.0–15.0: FRAME / BY FRAME. Kinetic lockup from oversized sliding type and viewfinder; final brand holds while a small timing marker completes.

## Visual identity
Ivory #FDFDFB, cobalt #2F6BFF, near-black #151719. Local Inter variable, weights 500–900. Grid, crop marks, viewfinder, deliberate asymmetry. No purple, orange, glass UI glow or stock art.
## Music cue guidance
Original score at 128 BPM: quarter-note grid 0.46875 sec; major structural accents explicitly authored at cuts 2, 3.5, 6, 8, 10, 12. Audio-reactive extraction not needed: score and geometry share authored rhythmic timing.
## Source / adaptation
User's pasted Frame by Frame concept supplies name, FF mark, prompt, lesson and modules. Latest instruction overrides the earlier 12-second keynote direction with a 15-second Swiss showreel.
'''
(out/'brag-plan.md').write_text(plan)
(out/'composition-brief.md').write_text(plan+'\n## Implementation\nLocal GSAP runtime, seven timed HTML scenes, deterministic authored transforms. Adapt the catalog match-cut circle continuity mechanic into the custom disc/FF handoff. Shipped font and original soundtrack. Deliver MP4, best-frame JPEG, four-still contact sheet and editable composition.\n')
(out/'share-copy.txt').write_text('Frame by Frame. Fifteen seconds of type, timing and precision. A Swiss cut motion study.\n')
html='''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Frame by Frame / Swiss Cut</title><script src="assets/gsap.min.js"></script><style>
@font-face{font-family:Inter;src:url('assets/inter-variable.woff2')}*{box-sizing:border-box}body{margin:0;background:#151719;font-family:Inter,sans-serif;color:#151719}#root{position:relative;width:100%;height:100%;overflow:hidden;background:#FDFDFB}.clip{position:absolute;inset:0;overflow:hidden;background:#FDFDFB}.blue{background:#2F6BFF;color:#FDFDFB}.dark{background:#151719;color:#FDFDFB}.meta{position:absolute;left:64px;right:64px;top:48px;display:flex;justify-content:space-between;font-size:22px;font-weight:600;letter-spacing:1px}.foot{position:absolute;bottom:45px;left:64px;right:64px;display:flex;justify-content:space-between;font-size:22px;font-weight:500}.rule{position:absolute;left:64px;right:64px;top:99px;height:2px;background:currentColor;transform-origin:left}.mask{overflow:hidden}.word{font-weight:850;line-height:.91;letter-spacing:-13px;font-size:196px}.plus{position:absolute;width:24px;height:24px;border-top:2px solid;border-left:2px solid}.disc{position:absolute;border-radius:50%;background:#2F6BFF}.grid{position:absolute;inset:120px 64px 110px;background-image:linear-gradient(#15171922 1px,transparent 1px),linear-gradient(90deg,#15171922 1px,transparent 1px);background-size:158.66px 158.66px}.viewfinder{position:absolute;width:360px;height:360px;left:360px;top:320px}.corner{position:absolute;width:92px;height:92px;border:18px solid currentColor}.tl{top:0;left:0;border-right:0;border-bottom:0}.tr{top:0;right:0;border-left:0;border-bottom:0}.bl{bottom:0;left:0;border-right:0;border-top:0}.br{bottom:0;right:0;border-left:0;border-top:0}.ff{position:absolute;inset:0;display:grid;place-items:center;font-size:160px;font-weight:850;letter-spacing:-15px}.tile{position:absolute;width:198px;height:198px;background:currentColor}.label{font-size:28px;font-weight:600;letter-spacing:2px}.panel{position:absolute;left:92px;top:220px;width:896px;height:670px;background:#FDFDFB;color:#151719;border:3px solid #151719;transform-origin:center;box-shadow:18px 18px 0 #151719}.bar{height:85px;border-bottom:2px solid;padding:22px 30px;display:flex;justify-content:space-between;font-size:27px;font-weight:700}.prompt{margin:55px 35px 0;border:3px solid #151719;padding:28px;font-size:46px;font-weight:550;line-height:1.22;height:183px;position:relative}.prompt-copy{clip-path:inset(0 100% 0 0)}.send{position:absolute;right:22px;bottom:20px;width:66px;height:66px;background:#2F6BFF;color:#FDFDFB;display:grid;place-items:center;font-size:45px}.module{margin:32px 35px;background:#151719;color:#FDFDFB;padding:25px 28px;font-size:32px;display:flex;justify-content:space-between}.cursor{position:absolute;left:900px;top:585px;width:40px;height:54px;z-index:3}.study{position:absolute;left:555px;top:340px;width:460px;height:460px;border:2px solid #151719;overflow:hidden}.study span{position:absolute;font-size:650px;font-weight:800;line-height:1;left:-18px;top:-85px;letter-spacing:-40px}.orbit{position:absolute;left:210px;top:290px;width:660px;height:660px;border:2px solid currentColor;border-radius:50%}.orbit i{position:absolute;background:currentColor;width:190px;height:190px;left:235px;top:-95px}.rings{position:absolute;width:770px;height:770px;left:155px;top:242px}.ring{position:absolute;border:3px solid #FDFDFB;border-radius:50%;inset:0}.end-word{font-size:177px;font-weight:850;line-height:.95;letter-spacing:-11px}.end-mask{position:absolute;left:64px;right:64px;overflow:hidden}.ticker{position:absolute;left:64px;bottom:125px;width:950px;height:8px;background:#FDFDFB;transform-origin:left}
</style></head><body><div id="root" data-composition-id="swiss" data-width="1080" data-height="1080" data-duration="15" data-fps="60">
<section class="clip" id="s1" data-start="0" data-duration="2" data-track-index="1"><div class="meta"><span>FRAME BY FRAME</span><span>MOTION STUDY / 001</span></div><div class="rule"></div><div class="disc" id="hook-disc" style="width:350px;height:350px;left:725px;top:450px" data-layout-ignore></div><div style="position:absolute;left:60px;top:195px"><div class="mask"><div class="word h1">MAKE</div></div><div class="mask"><div class="word h2">EVERY</div></div><div class="mask"><div class="word h3">FRAME.</div></div></div><div class="foot"><span>TYPE / FORM / TIMING</span><span>15 SECONDS. ALL INTENT.</span></div></section>
<section class="clip blue" id="s2" data-start="2" data-duration="1.5" data-track-index="2"><div class="meta"><span>01 / FORM</span><span>SWISS CUT</span></div><div class="rule"></div><div class="mask" style="position:absolute;left:62px;top:150px"><div id="count" class="word" style="font-size:220px">COUNT.</div></div><div class="viewfinder" id="vf"><div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div><div class="ff">FF</div></div><div class="foot"><span>A SYSTEM IN MOTION</span><span>01 — 07</span></div></section>
<section class="clip" id="s3" data-start="3.5" data-duration="2.5" data-track-index="3"><div class="grid" data-layout-ignore></div><div class="meta"><span>02 / INTERACTION</span><span>IDEA → ACTION</span></div><div class="rule"></div><div class="panel" id="panel"><div class="bar"><span>⌜ FF ⌟ &nbsp; Frame by Frame</span><span>on Whop ↗</span></div><div style="padding:30px 35px 0;font-size:61px;font-weight:750;letter-spacing:-3px">Start with an idea.</div><div class="prompt"><div class="prompt-copy" id="typed">Make a launch video<br>for my app</div><div class="send" id="send">↑</div></div><div class="module"><span>Choose a reference</span><span>2.1 ↗</span></div></div><svg class="cursor" id="cursor" viewBox="0 0 40 54"><path d="M3 2L35 29 20 31 27 47 19 51 12 35 3 46Z" fill="#151719" stroke="#FDFDFB" stroke-width="3"/></svg><div class="foot"><span>ONE PROMPT. FIRST FRAME.</span><span>FRAME BY FRAME</span></div></section>
<section class="clip" id="s4" data-start="6" data-duration="2" data-track-index="4"><div class="meta"><span>03 / REFERENCE</span><span>LEARN THE EYE</span></div><div class="rule"></div><div id="lesson" style="position:absolute;left:64px;top:170px"><div style="font-size:156px;font-weight:800;letter-spacing:-9px;color:#2F6BFF">2.1</div><div style="font-size:81px;line-height:1.05;font-weight:750;letter-spacing:-4px;margin-top:42px">Choose<br>a reference.</div><div style="font-size:31px;margin-top:42px;line-height:1.4">Study the motion.<br>Build <b>frame for frame.</b></div></div><div class="study" id="study" data-layout-allow-overflow><span id="study-f" data-layout-ignore>F</span></div><div class="foot"><span>LOOK CLOSER.</span><span>THEN MAKE YOUR MOVE.</span></div></section>
<section class="clip blue" id="s5" data-start="8" data-duration="2" data-track-index="5"><div class="meta"><span>04 / LAUNCH</span><span>COMPOSITION IN ORBIT</span></div><div class="rule"></div><div class="orbit" id="orbit" data-layout-ignore><i></i><i style="top:235px;left:565px"></i><i style="top:565px"></i><i style="top:235px;left:-95px"></i></div><div class="mask" style="position:absolute;top:180px;left:64px"><div class="word" id="launch" style="font-size:198px">Launch</div></div><div style="position:absolute;left:365px;top:505px;font-size:180px;font-weight:850;letter-spacing:-12px" id="launch-ff">FF</div><div class="foot"><span>FROM GRID TO GREAT.</span><span>MODULE 03 ↗</span></div></section>
<section class="clip dark" id="s6" data-start="10" data-duration="2" data-track-index="6"><div class="meta"><span>05 / SOUND</span><span>128 BPM / EXACTLY</span></div><div class="rule"></div><div class="rings" id="rings" data-layout-ignore><div class="ring"></div><div class="ring" style="inset:65px"></div><div class="ring" style="inset:130px"></div><div class="ring" style="inset:195px"></div><div class="ring" style="inset:260px"></div><div class="disc" style="left:320px;top:320px;width:130px;height:130px"></div></div><div class="mask" style="position:absolute;left:64px;top:175px"><div class="word" id="sound">Sound</div></div><div style="position:absolute;left:65px;top:475px;font-size:33px;font-weight:600;line-height:1.6" id="sound-copy">Launch the idea.<br>Sound the moment.</div><div class="foot"><span>FEEL THE CUT.</span><span>MODULE 05 ↗</span></div></section>
<section class="clip blue" id="s7" data-start="12" data-duration="3" data-track-index="7"><div class="meta"><span>MOTION WITH INTENT.</span><span>FF / 2026</span></div><div class="rule"></div><div class="end-mask" style="top:230px"><div class="end-word" id="end1">FRAME</div></div><div class="end-mask" style="top:405px"><div class="end-word" id="end2">BY FRAME.</div></div><div id="end-mark" class="viewfinder" style="left:790px;top:675px;width:210px;height:210px"><div class="corner tl" style="width:50px;height:50px;border-width:10px"></div><div class="corner tr" style="width:50px;height:50px;border-width:10px"></div><div class="corner bl" style="width:50px;height:50px;border-width:10px"></div><div class="corner br" style="width:50px;height:50px;border-width:10px"></div><div class="ff" style="font-size:85px;letter-spacing:-8px">FF</div></div><div style="position:absolute;left:64px;top:735px;font-size:34px;font-weight:500" id="end-copy">Type. Form. Timing.<br>Every frame considered.</div><div class="ticker" id="ticker"></div><div class="foot"><span>SWISS CUT / MOTION STUDY</span><span>15.00 SEC</span></div></section>
<audio id="score" data-start="0" data-duration="15" data-track-index="10" data-volume="1" src="assets/score.wav"></audio></div>
<script>
const tl=gsap.timeline({paused:true});
tl.from('.h1',{y:230,duration:.5,ease:'expo.out'},0).from('.h2',{y:230,duration:.5,ease:'expo.out'},.13).from('.h3',{y:230,duration:.55,ease:'expo.out'},.26);
tl.fromTo('#hook-disc',{scale:.3,x:130},{scale:1,x:0,duration:1.1,ease:'power3.out'},0).to('#hook-disc',{x:-550,y:0,scale:3.4,duration:.35,ease:'power4.in'},1.65);
tl.to('#s1 .word',{y:-18,duration:1,ease:'none'},.65);
// Catalog match-cut geometry: outgoing expanding circle, incoming matching form.
tl.from('#count',{y:260,duration:.4,ease:'expo.out',immediateRender:false},2).from('#vf',{scale:2.8,rotation:-90,duration:.7,ease:'expo.out',immediateRender:false},2).to('#vf',{rotation:6,scale:1.08,duration:.7,ease:'none'},2.7);
tl.from('#panel',{y:420,rotationX:28,rotation:-8,scale:.7,duration:.55,ease:'expo.out',immediateRender:false},3.5).fromTo('#typed',{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)',duration:.9,ease:'steps(28)',immediateRender:false},3.95).from('#cursor',{x:180,y:210,rotation:20,duration:.55,ease:'power3.out',immediateRender:false},4.35).to('#send',{scale:.86,duration:.09,yoyo:true,repeat:1},5.12).to('#panel',{y:-25,rotation:1.2,duration:1.05,ease:'none'},4.6).to('#panel',{y:-900,rotation:-6,duration:.22,ease:'power3.in'},5.78);
tl.from('#lesson',{x:-580,duration:.55,ease:'expo.out',immediateRender:false},6).from('#study',{x:590,rotation:25,duration:.65,ease:'expo.out',immediateRender:false},6).fromTo('#study-f',{rotation:-28,x:-100},{rotation:0,x:0,duration:1.5,ease:'power2.out',immediateRender:false},6.1).to('#study',{y:-25,duration:1,ease:'none'},7);
tl.from('#launch',{y:250,duration:.45,ease:'expo.out',immediateRender:false},8).fromTo('#orbit',{rotation:-80,scale:.45},{rotation:0,scale:1,duration:.7,ease:'expo.out',immediateRender:false},8).to('#orbit',{rotation:90,duration:1.3,ease:'power2.inOut'},8.7).from('#launch-ff',{scale:0,rotation:-90,duration:.55,ease:'back.out(1.2)',immediateRender:false},8.3);
tl.from('#sound',{y:240,duration:.45,ease:'expo.out',immediateRender:false},10).fromTo('#rings',{scale:1.5,rotation:-25},{scale:1,rotation:0,duration:.75,ease:'expo.out',immediateRender:false},10).to('#rings',{scale:1.06,duration:.234375,yoyo:true,repeat:3,ease:'sine.inOut'},10.75).from('#sound-copy',{x:-350,duration:.55,ease:'expo.out',immediateRender:false},10.4);
tl.from('#end1',{y:230,x:-80,duration:.55,ease:'expo.out',immediateRender:false},12).from('#end2',{y:230,x:80,duration:.6,ease:'expo.out',immediateRender:false},12.15).from('#end-mark',{scale:2.5,rotation:90,duration:.8,ease:'expo.out',immediateRender:false},12.25).from('#end-copy',{y:65,opacity:0,duration:.5,immediateRender:false},12.6).fromTo('#ticker',{scaleX:0},{scaleX:1,duration:2.4,ease:'none',immediateRender:false},12.6);
window.__timelines=window.__timelines||{};window.__timelines['swiss']=tl;
</script></body></html>'''
(p/'index.html').write_text(html)
# The soundtrack is authored against the cut list, so beats are exact rather than detected.
rate=48000; n=rate*15; samples=[0.0]*n; rng=random.Random(41)
def add(start,dur,fn,gain=1):
    j=int(start*rate)
    for i in range(min(int(dur*rate),n-j)):
        t=i/rate;samples[j+i]+=gain*fn(t)
beat=60/128
for k in range(32):
    s=k*beat
    add(s,.25,lambda t:math.sin(2*math.pi*(47*t+3.2*(1-math.exp(-t*45))))*math.exp(-t*19),.57)
    if k%2:
        add(s,.14,lambda t:(rng.uniform(-1,1)*.7+math.sin(2*math.pi*175*t)*.3)*math.exp(-t*35),.18)
    for off in [0,beat/2]:
        add(s+off,.06,lambda t:rng.uniform(-1,1)*math.exp(-t*95),.055)
    f=[65.406,65.406,77.782,58.27][(k//8)%4]
    add(s+.08,.30,lambda t,f=f:(math.sin(2*math.pi*f*t)+.2*math.sin(2*math.pi*f*2*t))*math.exp(-t*9),.20)
    if k%2==0:
        f=[261.63,311.13,392,466.16][(k//2)%4]
        add(s+.23,.40,lambda t,f=f:(math.sin(2*math.pi*f*t)+.25*math.sin(2*math.pi*f*2*t))*min(1,t*150)*math.exp(-t*8),.11)
for s in [0,2,3.5,6,8,10,12]:
    add(s,.50,lambda t:(math.sin(2*math.pi*(55*t+2*(1-math.exp(-t*20))))*.8+rng.uniform(-1,1)*.2)*math.exp(-t*12),.45)
    if s>0:add(s-.17,.17,lambda t:rng.uniform(-1,1)*(t/.17)**2,.1)
add(5.12,.045,lambda t:rng.uniform(-1,1)*math.exp(-t*100),.12)
mx=max(abs(x) for x in samples)
with wave.open(str(p/'assets/score-raw.wav'),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate)
    data=bytearray()
    for i,x in enumerate(samples):
        fade=min(1,(n-i)/(rate*.06)); v=int(x/mx*.86*fade*32767);data.extend(struct.pack('<hh',v,v))
    w.writeframes(data)
print(out)
