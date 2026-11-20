from pathlib import Path
import math,sys,subprocess
from functools import lru_cache
import cv2
import numpy as np
from PIL import Image,ImageDraw,ImageFont
cv2.setNumThreads(2)
root=Path(__file__).resolve().parent
name=sys.argv[1]
folio=name=='folio'
dest=root/name
prior=root.parent/'graphite-device-cut/kronos.mp4'
assets=root.parent/'graphite-recut/composition/assets'
class Reader:
    def __init__(self,path):
        self.cap=cv2.VideoCapture(str(path))
        assert self.cap.isOpened(),path
        self.last=-1
        self.fps=self.cap.get(cv2.CAP_PROP_FPS)
        self.count=int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
    def at(self,t):
        idx=max(0,min(self.count-1,round(t*self.fps)))
        if idx==self.last:return self.frame
        if idx<self.last or idx-self.last>6:self.cap.set(cv2.CAP_PROP_POS_FRAMES,idx)
        else:
            for _ in range(idx-self.last-1):self.cap.grab()
        ok,self.frame=self.cap.read()
        assert ok,idx
        self.last=idx
        return self.frame
def ease(t):
    t=np.clip(t,0,1)
    return t*t*t*(10+t*(-15+6*t))
def blend(a,b,t):
    return cv2.addWeighted(a,1-t,b,t,0)
src,ann,end=Reader(prior),Reader(assets/'annotate.mp4'),Reader(dest/'ending.mp4')
cues=[(7.35,'Your work, side by side.'),(9.9,'check the preview before opening the tab'),(12.9,'then split the tab'),(15.65,'Chat from the corner of your workspace.'),(19.2,'Bring the conversation onto the canvas.'),(23.9,'Open a browser inside the sandbox.'),(26.45,'Use the sandbox tools to explore.'),(28.9,'Use frames to locate widgets.'),(30.9,'Find a frame in your design system.'),(32.9,'Pull back to the infinite canvas.'),(35.45,'Annotate a result.'),(41.99,'Draw shapes, add text and connect ideas.')]
face='/System/Library/Fonts/Supplemental/'+('Didot.ttc' if folio else 'Georgia Italic.ttf')
font=ImageFont.truetype(face,55)
@lru_cache
def heading(txt):
    img=Image.new('RGB',(1920,118),'#eae6de' if folio else '#0c1116')
    draw=ImageDraw.Draw(img);draw.text((55 if folio else 36,14),txt,font=font,fill='#242020' if folio else '#ececea')
    if folio:draw.line((56,103,1864,103),fill='#827a6d',width=1)
    return np.asarray(img)[:,:,::-1].copy()
def raw_ann(t):
    f=ann.at(t);h,w=f.shape[:2]
    # Anchor the tool button and its Add context popover in the same crop.
    travel=ease((t+.12)/1.55)
    z=(1.72+1.26*travel) if folio else (2.22+.76*travel)
    left=(.0+.012*travel)*w;top=(.0+.01*travel)*h
    return cv2.resize(f[int(top):int(top+h/z),int(left):int(left+w/z)],(1876,936))
def annotate(t):
    f=np.full((1080,1920,3),(22,17,12),np.uint8);f[:118]=heading('Annotate a result.')
    f[119:1055,22:1898]=raw_ann(t)
    return f
def paper(f,txt,t):
    out=np.full_like(f,(222,230,234));out[:118]=heading(txt)
    src=f[119:1055,22:1898]
    # The print-style take leaves a wider paper margin, with a small push on the tabs.
    emphasis=.5-.5*math.cos(np.clip((t-7.5)/5.5,0,1)*2*math.pi) if 7.5<t<13 else 0
    pad=round(32*emphasis);src=src[pad:src.shape[0]-pad or None,pad*2:src.shape[1]-pad*2 or None]
    out[132:1042,48:1872]=cv2.resize(src,(1824,910))
    return out
# Each take has its own timing, including the duration of the annotation landing.
segments=[(0,35.45,1.115 if folio else 1.08),(0,2.90,1.03 if folio else 1.00),(42.34,45.70,1.075),(0,18,1.12 if folio else 1.07)]
limits=np.cumsum([0]+[(b-a)/s for a,b,s in segments])
n=round(limits[-1]*30)
audio=('[1:a]asplit=3[a][b][c];[a]atrim=end=35.45,asetpts=PTS-STARTPTS,atempo='+str(segments[0][2])+',afade=t=out:st='+str(limits[1]-.075)+':d=0.075[a0];[b]atrim=start=39.32:end=42.22,asetpts=PTS-STARTPTS,atempo='+str(segments[1][2])+',afade=t=in:d=0.075,afade=t=out:st='+str(limits[2]-limits[1]-.065)+':d=0.065[a1];[c]atrim=start=42.34:end=45.70,asetpts=PTS-STARTPTS,atempo=1.075,afade=t=in:d=0.065[a2];[2:a]atrim=start=45.70:end=63.7,asetpts=PTS-STARTPTS,atempo='+str(segments[3][2])+'[a3];[a0][a1][a2][a3]concat=n=4:v=0:a=1,apad[m]')
cmd=['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s','1920x1080','-r','30','-i','-', '-i',str(prior),'-i',str(prior),'-filter_complex',audio,'-map','0:v','-map','[m]','-c:v','libx264','-threads','3','-preset','veryfast','-crf','17','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t',str(n/30),'-movflags','+faststart',str(dest/'kronos.mp4')]
enc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
for i in range(n):
    time=i/30;part=int(np.searchsorted(limits[1:],time,'right'));a,b,rate=segments[part];t=a+(time-limits[part])*rate
    display=t
    if part==0:f=src.at(t)
    if part==1:
        f=annotate(t);display=35.46
        if t<.26:f=blend(src.at(35.42),f,ease(t/.26))
    if part==2:
        f=src.at(t);display=42.5
        if t<42.64:f=blend(annotate(2.88),f,ease((t-42.34)/.3))
    if part==3:
        f=end.at(t)
        if t<.42:f=blend(src.at(45.7+t),f,ease(t/.42))
    if folio and part<3 and display>=7.35:
        txt=next(txt for at,txt in reversed(cues) if display>=at)
        plate=paper(f,txt,display)
        f=blend(f,plate,ease((display-7.35)/.4)*ease((45.7-t)/.3 if part==2 else 1))
    enc.stdin.write(f.tobytes())
enc.stdin.close();assert enc.wait()==0
