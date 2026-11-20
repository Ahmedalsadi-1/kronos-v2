from pathlib import Path
import math, subprocess
from functools import lru_cache
import cv2, numpy as np
from PIL import Image,ImageDraw,ImageFont
cv2.setNumThreads(2)
here=Path(__file__).resolve().parent
repo=here.parents[1]
movie=repo/'graphite-device-cut/kronos.mp4'
cap=cv2.VideoCapture(str(movie))
ann=cv2.VideoCapture(str(repo/'graphite-recut/composition/assets/annotate.mp4'))
fps=30
def enc(file):
 return subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s','1920x1080','-r','30','-i','-','-an','-c:v','libx264','-threads','3','-preset','veryfast','-crf','17','-pix_fmt','yuv420p',str(file)],stdin=subprocess.PIPE)
font='/System/Library/Fonts/Supplemental/'
display=ImageFont.truetype(font+'DIN Alternate Bold.ttf',50)
small=ImageFont.truetype(font+'Arial Bold.ttf',18)
def ease(x):
 u=max(0,min(1,x));return u*u*(3-2*u)
@lru_cache(None)
def header(title,kind):
 im=Image.new('RGB',(1920,118),(12,16,19));d=ImageDraw.Draw(im)
 d.rounded_rectangle((38,34,44,80),3,fill='#a8f3c7')
 d.text((70,23),title,font=display,fill='#f0f4f0')
 d.text((1876,59),kind,font=small,fill='#abd5be',anchor='rm')
 return cv2.cvtColor(np.asarray(im),cv2.COLOR_RGB2BGR)
cues=[(7.75,'Your work, side by side.','TABS'),(10,'check the preview before opening the tab','TABS'),(13,'then split the tab','TABS'),(15.75,'Chat from the corner of your workspace.','TABS'),(19.3,'Bring the conversation onto the canvas.','CANVAS'),(24,'Open a browser inside the sandbox.','SANDBOX'),(26.55,'Use the sandbox tools to explore the map.','SANDBOX'),(29,'Use frames to locate widgets.','FRAMES'),(31,'Jump to a frame in your design system.','FRAMES'),(33,'Pull back to the infinite canvas.','CANVAS'),(39,'Annotate a result in place.','ANNOTATE'),(42.4,'Draw shapes, add text and connect ideas.','DESIGN')]
def getcap(cap,frame):
 index=int(cap.get(cv2.CAP_PROP_POS_FRAMES));frame=int(frame)
 if index>frame or frame-index>6:cap.set(cv2.CAP_PROP_POS_FRAMES,frame)
 else:
  for _ in range(frame-index):cap.grab()
 ok,b=cap.read();assert ok,(index,frame);return b
def shot(t):
 if 39<=t<42.4:
  local=t-39; b=getcap(ann,min(91,int(local*27)))
  # Anchor on the left-hand result and its annotation popover.
  z=1.55+.94*ease(local/1.32)-.13*ease((local-2.48)/.75)
  w=int(2504/z);h=int(1248/z)
  x=int(36+20*ease(local/1.5));y=int(5+25*ease(local/1.2))
  box=cv2.resize(b[y:y+h,x:x+w],(1878,936))
  out=np.full((1080,1920,3),(19,16,12),np.uint8);out[119:1055,21:1899]=box
 else:out=getcap(cap,round(t*30))
 if 7.75<=t<45.9:
  j=max(i for i,v in enumerate(cues) if v[0]<=t)
  v=cues[j];h=header(v[1],v[2])
  if j>0:
   alpha=ease((t-v[0])/.13);h=cv2.addWeighted(h,alpha,header(*cues[j-1][1:]),1-alpha,0)
  out[:118]=h
 return out
# The device take starts on its own pristine composer frame.
sections=[(0,7.75,1.19),(7.75,17.72,1.16),(17.72,20.24,1.03),(20.24,35.42,1.24),(39,42.4,1.20),(42.4,45.9,1.23)]
proc=enc(here/'first.mp4')
previous=None
for start,end,speed in sections:
 n=round(30*(end-start)/speed)
 last=None
 for j in range(n):
  t=start+(end-start)*j/n
  b=shot(t)
  if start in (39,42.4) and j<6:
   b=cv2.addWeighted(previous,1-ease((j+1)/6),b,ease((j+1)/6),0)
  proc.stdin.write(b.tobytes());last=b
 previous=last
proc.stdin.close();assert proc.wait()==0
dur=sum(round(30*(b-a)/spd) for a,b,spd in sections)/30
# Keep the original score continuous underneath the abbreviated picture.
fg='[0:v][1:v]concat=n=2:v=1:a=0[v];[2:a]atempo=1.15,atrim=duration='+str(dur+17)+',afade=t=out:st='+str(dur+15.5)+':d=1.5[a]'
subprocess.run(['ffmpeg','-v','error','-y','-i',str(here/'first.mp4'),'-i',str(here/'ending.mp4'),'-i',str(movie),'-filter_complex',fg,'-map','[v]','-map','[a]','-c:a','aac','-b:a','192k','-c:v','libx264','-threads','4','-preset','veryfast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(here/'pulse.mp4')],check=True)
