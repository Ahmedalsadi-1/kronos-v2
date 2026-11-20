from pathlib import Path
import math, subprocess, cv2
from PIL import Image, ImageDraw, ImageFont
import numpy as np

HERE=Path(__file__).resolve().parent
assets=HERE.parents[1]/'graphite-canvas/composition/assets'
original=HERE.parents[1]/'graphite-agents/composition/assets'
W,H=1920,1080
def font(n,italic=False):return ImageFont.truetype('/System/Library/Fonts/Supplemental/'+('Georgia Italic.ttf' if italic else 'Arial.ttf'),n)
def ease(x):
 x=max(0,min(1,x));return x*x*(3-2*x)
def mix(a,b,f):return a+(b-a)*f
back=Image.open(assets/'canvas-chrome.jpg').convert('RGB')
base=Image.new('RGB',(W,H),'#19191b')
base.paste(back.crop((0,0,W,48)),(0,0))
base.paste(back.crop((0,48,550,1080)).resize((205,1032)),(0,48))
base.paste(back.crop((550,50,590,405)),(207,50))
bd=ImageDraw.Draw(base)
bd.text((270,65),'Agent workspace',font=font(39,True),fill='#f0eee9')
bd.text((1430,79),'PARALLEL SESSION  /  RECREATION',font=font(20),fill='#bec1c7')
positions=[(255,155,420,250),(712,155,420,250),(1170,155,435,250),(1650,134,197,291),
 (255,462,420,240),(712,462,420,240),(1170,462,435,240),(1650,455,197,277),
 (255,762,420,245),(712,762,420,245),(1170,762,435,245),(1650,762,197,245)]
items=[('Lead','Agent chat',''),('Agent 01','Riverwalk lookup','web0'),('Agent 02','Verify shortlist','guest-terminal'),('Agent 03','iPhone 16e · Safari','safari'),
 ('Agent 04','Park lookup','web1'),('Agent 05','Cuisine research','web2'),('Agent 06','Organize files','guest-files'),('Agent 07','iPhone 17 Pro · Settings','settings'),
 ('Coordinator','Map review','browser'),('Agent 08','Transit lookup','web3'),('Agent 09','Canvas design','design'),('Agent 10','Chicago clock','guest-clock')]
cursor={label:Image.open(assets/(label.replace(' ','-')+'.png')).convert('RGBA') for label,_,_ in items}
chat=Image.open(original/'intro-head.jpg').crop((16,1144,686,1236)).convert('RGB')
task='launch 10 subagents to control the vms'
lead=(278,270,374,52)
frames={}
for i,(label,title,clip) in enumerate(items):
 x,y,w,h=positions[i]
 bd.rounded_rectangle((x-2,y-2,x+w+2,y+h+2),8,fill='#1b1e21',outline='#54595d',width=2)
 bd.text((x+9,y+8),title,font=font(18),fill='#eee')
 if not clip:continue
 src=(assets if (assets/(clip+'.mp4')).exists() else original)/(clip+'.mp4')
 cap=cv2.VideoCapture(str(src));fps=cap.get(cv2.CAP_PROP_FPS);count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
 assert count>2,src
 samples=[];last=-1
 for n in range(min(55,count)):
  idx=round(n*(count-1)/(min(55,count)-1))
  for _ in range(idx-last):cap.grab()
  ok,b=cap.retrieve();last=idx
  if ok:
   ih,iw=b.shape[:2];r=min((w-8)/iw,(h-34)/ih)
   samples.append(Image.fromarray(cv2.resize(b,(round(iw*r),round(ih*r)),interpolation=cv2.INTER_AREA)[:,:,::-1]))
 cap.release();frames[i]=samples
ff=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','30','-i','-','-an','-c:v','libx264','-preset','veryfast','-crf','17','-pix_fmt','yuv420p',str(HERE.parent/'ending.mp4')],stdin=subprocess.PIPE)
end=Image.new('RGB',(W,H),'#0b1015')
# Reuse the approved, rendered wordmark frame.
cap=cv2.VideoCapture(str(HERE.parents[1]/'graphite-agents/kronos.mp4'));cap.set(cv2.CAP_PROP_POS_MSEC,56500);ok,b=cap.read();cap.release()
if ok:end=Image.fromarray(b[:,:,::-1])
# Draw the featured screen from its source at the current camera resolution.
focus={}
for i,src in [(2,assets/'guest-terminal.mp4'),(3,HERE/'assets/riverwalk.mp4')]:
 cap=cv2.VideoCapture(str(src)); arr=[]
 while True:
  ok,b=cap.read()
  if not ok:break
  arr.append(Image.fromarray(b[:,:,::-1]))
 cap.release();focus[i]=arr
def spline(t,keys):
 for (a,*v),(b,*w) in zip(keys,keys[1:]):
  if t<=b:return tuple(mix(j,k,ease((t-a)/(b-a))) for j,k in zip(v,w))
 return tuple(keys[-1][1:])
keys=[(0,465,296,3.55),(4.05,465,296,3.55),(4.72,850,272,2.45),(5.65,1300,229,7.8),
 (9.8,1300,229,7.8),(10.45,1504,235,3.55),(11.18,1748,259,8.2),(15.2,1748,259,8.2),
 (17.6,1748,287,7.3),(19.65,960,540,1),(29.8,960,540,1)]
pointer=[(3.8,490,298),(4.72,850,266),(5.65,1242,258),(8.95,1256,259),(9.8,1300,266),
 (10.45,1504,243),(11.18,1796,289),(15.2,1796,289),(17.6,1796,313),(19.65,635,311),(27,515,305)]
for frame in range(894):
 t=frame/30;world=base.copy();draw=ImageDraw.Draw(world)
 for i,imgs in frames.items():
  x,y,w,h=positions[i];cycle=max(0,t-13.5+(i%3)*.42)/(13+(i%4)*.65)
  phase=ease(cycle);img=imgs[round(phase*(len(imgs)-1))]
  world.paste(img,(x+(w-img.width)//2,y+30+(h-30-img.height)//2))
  u=.22+.53*(.5+.5*math.sin(t*.73+i*1.21));v=.31+.41*(.5+.5*math.cos(t*.83+i*.61))
  if i not in focus:
   cur=cursor[items[i][0]].resize((147,64),Image.Resampling.LANCZOS);world.paste(cur,(int(x+(w-94)*u),int(y+(h-65)*v)),cur)
 draw.text((278,207),'KronOS Agent',font=font(24,True),fill='#eceae8')
 if t>5.8:draw.text((278,341),'10 subagents dispatched',font=font(16),fill='#b6daca')
 # Both the mask and the camera keep the source composer anchored at every scale.
 cx,cy,z=spline(t,keys)
 def XY(x,y):return(round((x-cx)*z+W/2),round((y-cy)*z+H/2))
 scene=Image.fromarray(cv2.warpAffine(np.asarray(world),np.float32([[z,0,W/2-cx*z],[0,z,H/2-cy*z]]),(W,H),flags=cv2.INTER_LINEAR,borderValue=(25,25,27)))
 for i in (2,3):
  phase=max(0,min(1,(t-(5.45 if i==2 else 11.2))/(3.4 if i==2 else 6.15)))
  img=focus[i][round(phase*(len(focus[i])-1))]
  x,y,w,h=positions[i];r=min((w-8)/img.width,(h-34)/img.height);iw,ih=img.width*r,img.height*r
  xx,yy=XY(x+(w-iw)/2,y+30+(h-30-ih)/2)
  if xx<W and xx+iw*z>0:
   scene.paste(img.resize((round(iw*z),round(ih*z)),Image.Resampling.BICUBIC),(xx,yy))
   if t>=19.65:
    px=x+w*(.35+.16*math.sin(t*.8+i));py=y+h*(.55+.12*math.cos(t*.7+i))
    cr=cursor[items[i][0]].resize((round(126*z),round(54*z)),Image.Resampling.LANCZOS)
    scene.paste(cr,XY(px,py),cr)
 bg=Image.new('RGB',(W,H),'#0d1218');scene=Image.blend(bg,scene,ease((t-4.0)/.82))
 x,y=XY(*lead[:2]);cw,ch=round(lead[2]*z),round(lead[3]*z);scene.paste(chat.resize((cw,ch),Image.Resampling.LANCZOS),(x,y))
 d=ImageDraw.Draw(scene);letters=task[:max(0,min(len(task),int((t-.55)*13.2)))];ft=font(max(10,round(z*11)));tx=x+round(10*z);ty=y+round(20*z)
 d.text((tx,ty),letters,font=ft,fill='#f1f2f4');caret=tx+round(d.textlength(letters,font=ft))+2
 if t<4.4:d.line((caret,ty+2,caret,ty+ft.size),fill='#fff',width=2)
 dx=(17*math.sin(t*1.7) if t>5 else 0);cur=cursor['Lead'].resize((int(min(220,107*z)),int(min(95,46*z))),Image.Resampling.LANCZOS)
 if t<3.8:spot=(int(caret-10*z),int(ty+4*z))
 else:
  startx=lead[0]+10+d.textlength(task,font=ft)/z-10
  tracked=[(3.8,startx,lead[1]+24)]+pointer[1:]
  px,py=spline(t,tracked);spot=XY(px,py)
 scene.paste(cur,spot,cur)
 if .55<t<3.4:
  phase=(t*6)%1;r=round(6*(1-phase));sx=caret+8+round(14*phase);sy=ty-round(12*phase)
  d.polygon([(sx,sy-r),(sx+2,sy-2),(sx+r,sy),(sx+2,sy+2),(sx,sy+r),(sx-2,sy+2),(sx-r,sy),(sx-2,sy-2)],fill='#ebe3f6')
 if t>26.7:scene=Image.blend(scene,end,ease((t-26.7)/1.25))
 ff.stdin.write(scene.tobytes())
ff.stdin.close();assert ff.wait()==0
