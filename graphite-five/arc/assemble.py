from pathlib import Path
import math, subprocess
import cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont
out=Path(__file__).resolve().parent
repo=out.parents[1]
def capture(path):
 return cv2.VideoCapture(str(path),cv2.CAP_FFMPEG,[cv2.CAP_PROP_N_THREADS,2])
master=capture(repo/'graphite-device-cut/kronos.mp4')
design=capture(repo/'graphite-device-cut/kronos.mp4')
design.set(cv2.CAP_PROP_POS_FRAMES,1275)
annotation=capture(repo/'graphite-recut/composition/assets/annotate.mp4')
ending=capture(out/'ending.mp4')
fps=30
class Stream:
 def __init__(self,cap,idx=-1):
  self.cap=cap;self.index=idx;self.frame=None
 def at(self,n):
  while self.index<n:
   ok=self.cap.grab()
   if not ok and self.frame is not None:return self.frame
   assert ok
   self.index+=1
  ok,b=self.cap.retrieve()
  if ok:self.frame=b
  return self.frame
base=Stream(master);tools=Stream(design,1274);annot=Stream(annotation);last=Stream(ending)
serif=ImageFont.truetype('/System/Library/Fonts/Supplemental/Baskerville.ttc',59)
sans=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',21)
cues=[(7.8,'Your work, side by side.','TABS'),(10,'check the preview before opening the tab','TABS'),(13,'then split the tab','TABS'),(15.75,'Chat from the corner of your workspace.','TABS'),(19.3,'Bring the conversation onto the canvas.','SANDBOX VM'),(24,'Open a browser inside the sandbox.','SANDBOX VM'),(26.55,'Use the sandbox tools to explore the map.','SANDBOX VM'),(29,'Use frames to locate widgets.','CANVAS'),(31,'Jump to a frame in your design system.','CANVAS'),(33,'Pull back to the infinite canvas.','CANVAS')]
def plate(text,chapter):
 im=Image.new('RGB',(1920,118),(12,16,20));d=ImageDraw.Draw(im)
 d.text((39,17),text,font=serif,fill=(246,238,224));d.text((1876,51),chapter,anchor='ra',font=sans,fill=(211,191,156))
 d.line((39,98,114,98), fill=(182,156,113),width=2)
 return np.asarray(im)[:,:,::-1].copy()
labels=[plate(*cue[1:]) for cue in cues]
anhead=plate('Annotate a result in place.','ANNOTATE')
dehead=plate('Draw shapes, add text and connect ideas.','DESIGN')
def ease(x):
 x=max(0,min(1,x));return x*x*(3-2*x)
def encoded():
 return subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s','1920x1080','-r','30','-i','-','-an','-threads','3','-c:v','libx264','-preset','veryfast','-crf','17','-pix_fmt','yuv420p',str(out/'picture.mp4')],stdin=subprocess.PIPE)
enc=encoded()
def put(b): enc.stdin.write(b.tobytes())
n0,n1,n2=961,80,88
for i in range(n0):
 t=i*35.35/n0
 frame=base.at(round(t*30)).copy()
 if t>=7.8:
  idx=max(j for j,c in enumerate(cues) if c[0]<=t)
  mix=ease((t-cues[idx][0])/.24)
  prev=labels[idx-1] if idx else frame[:118]
  frame[:118]=cv2.addWeighted(prev,1-mix,labels[idx],mix,0)
 put(frame)
prev=frame.copy()
for i in range(n1):
 t=i/(n1-1)
 frame=annot.at(round(t*78))
 h,w=frame.shape[:2]
 z=1.65+.88*ease(t/.49)-.10*ease((t-.76)/.24)
 rw,rh=w/z,h/z
 # Keep the left tools and annotation popover together and retain the restaurant for context.
 x=0;y=max(0,(.16+.034*ease(t))*h-rh*.39)
 mat=np.float32([[1878/rw,0,-x*1878/rw],[0,937/rh,-y*937/rh]])
 zoom=cv2.warpAffine(frame,mat,(1878,937),flags=cv2.INTER_LINEAR)
 shot=np.full((1080,1920,3),(20,16,12),np.uint8);shot[:118]=anhead;shot[119:1056,21:1899]=zoom
 u=ease(i/9)
 put(cv2.addWeighted(prev,1-u,shot,u,0) if i<9 else shot)
prev=shot
for i in range(n2):
 t=42.5+i*3.2/n2
 frame=tools.at(round(t*30)).copy();frame[:118]=dehead
 put(cv2.addWeighted(prev,1-ease(i/8),frame,ease(i/8),0) if i<8 else frame)
prev=frame
for i in range(495):
 b=last.at(i)
 put(cv2.addWeighted(prev,1-ease(i/11),b,ease(i/11),0) if i<11 else b)
enc.stdin.close();assert enc.wait()==0
