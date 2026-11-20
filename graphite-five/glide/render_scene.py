from pathlib import Path
import math, subprocess, cv2
from PIL import Image, ImageDraw, ImageFont
import numpy as np

HERE=Path(__file__).resolve().parent
assets=HERE.parents[1]/'graphite-canvas/composition/assets'
original=HERE.parents[1]/'graphite-agents/composition/assets'
cv2.setNumThreads(2)
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
 ('Agent 04','Park lookup','web1'),('Agent 05','Cuisine research','web2'),('Agent 06','Organize files','guest-files'),('Agent 07','Android emulator','android'),
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
 if i==7:src=HERE.parents[1]/'graphite-device-cut/composition/assets/android.mp4'
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
ff=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','30','-i','-','-an','-c:v','libx264','-preset','veryfast','-threads','3','-crf','17','-pix_fmt','yuv420p',str(HERE/'ending.mp4')],stdin=subprocess.PIPE)
end=Image.new('RGB',(W,H),'#0b1015')
# Reuse the approved, rendered wordmark frame.
cap=cv2.VideoCapture(str(HERE.parents[1]/'graphite-agents/kronos.mp4'));cap.set(cv2.CAP_PROP_POS_MSEC,56500);ok,b=cap.read();cap.release()
if ok:end=Image.fromarray(b[:,:,::-1])
# Draw the featured screen from its source at the current camera resolution.
focus={}
for i,src in [(2,assets/'guest-terminal.mp4'),(3,HERE.parents[1]/'graphite-device-cut/composition/assets/riverwalk.mp4'),(7,HERE.parents[1]/'graphite-device-cut/composition/assets/android.mp4')]:
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
# Camera and pointer share the same continuous world-space route, with a small delayed gaze offset.
route=[(3.48,507,295,465,296,3.12),(4.56,1264,245,1386,280,3.15),
 (6.35,1312,264,1389,281,3.22),(7.62,1731,250,1744,280,3.10),
 (9.6,1767,304,1747,286,3.16),(11.05,1733,561,1748,591,3.07),
 (12.45,1769,621,1749,594,3.12),(13.90,928,403,960,540,1.0),(17.1,542,330,960,540,1.0)]
def trajectory(t):
 if t<=route[0][0]:return route[0][1:]
 for i,(a,b) in enumerate(zip(route,route[1:])):
  if t>b[0]:continue
  u=(t-a[0])/(b[0]-a[0]);u2=u*u;u3=u2*u
  p=route[max(0,i-1)];q=route[min(len(route)-1,i+2)]
  values=[]
  for j in range(1,6):
   # Monotone cubic tangents preserve readable device holds between transits.
   def slope(v0,v1,v2,k):
    if v0[0]==v1[0] or v1[0]==v2[0]:return 0
    left=(v1[k]-v0[k])/(v1[0]-v0[0]);right=(v2[k]-v1[k])/(v2[0]-v1[0])
    return 2*left*right/(left+right) if left*right>0 else 0
   m0=slope(p,a,b,j)*(b[0]-a[0]);m1=slope(a,b,q,j)*(b[0]-a[0])
   values.append((2*u3-3*u2+1)*a[j]+(u3-2*u2+u)*m0+(-2*u3+3*u2)*b[j]+(u3-u2)*m1)
  return values
 return route[-1][1:]
for frame in range(540):
 t=frame/30;world=base.copy();draw=ImageDraw.Draw(world)
 for i,imgs in frames.items():
  if i in focus:continue
  x,y,w,h=positions[i];cycle=max(0,t-4.5+(i%3)*.42)/(11+(i%4)*.55)
  phase=ease(cycle);img=imgs[round(phase*(len(imgs)-1))]
  world.paste(img,(x+(w-img.width)//2,y+30+(h-30-img.height)//2))
  u=.22+.53*(.5+.5*math.sin(t*.73+i*1.21));v=.31+.41*(.5+.5*math.cos(t*.83+i*.61))
  if i not in focus:
   cur=cursor[items[i][0]].resize((147,64),Image.Resampling.LANCZOS);world.paste(cur,(int(x+(w-94)*u),int(y+(h-65)*v)),cur)
 draw.text((278,207),'KronOS Agent',font=font(24,True),fill='#eceae8')
 if t>4.35:draw.text((278,341),'10 subagents dispatched',font=font(16),fill='#b6daca')
 # Both the mask and the camera keep the source composer anchored at every scale.
 px,py,cx,cy,z=trajectory(t)
 if 3.48<t<12.45:
  oldx,oldy,*_=trajectory(t-.07);cx+=(oldx-px)*.34;cy+=(oldy-py)*.34
 def XY(x,y):return(round((x-cx)*z+W/2),round((y-cy)*z+H/2))
 scene=Image.fromarray(cv2.warpAffine(np.asarray(world),np.float32([[z,0,W/2-cx*z],[0,z,H/2-cy*z]]),(W,H),flags=cv2.INTER_LINEAR,borderValue=(25,25,27)))
 for i in (2,3,7):
  phase=max(0,min(1,(t-(4.15 if i==2 else 7.35 if i==3 else 11))/(2.4 if i==2 else 3.0 if i==3 else 1.7)))
  img=focus[i][round(phase*(len(focus[i])-1))]
  x,y,w,h=positions[i];r=min((w-8)/img.width,(h-34)/img.height);iw,ih=img.width*r,img.height*r
  xx,yy=XY(x+(w-iw)/2,y+30+(h-30-ih)/2)
  if xx<W and xx+iw*z>0:
   scene.paste(img.resize((round(iw*z),round(ih*z)),Image.Resampling.BICUBIC),(xx,yy))
   if t>=13.65:
    px=x+w*(.35+.16*math.sin(t*.8+i));py=y+h*(.55+.12*math.cos(t*.7+i))
    cr=cursor[items[i][0]].resize((round(126*z),round(54*z)),Image.Resampling.LANCZOS)
    scene.paste(cr,XY(px,py),cr)
 bg=Image.new('RGB',(W,H),'#0d1218');scene=Image.blend(bg,scene,ease((t-3.47)/.57))
 x,y=XY(*lead[:2]);cw,ch=round(lead[2]*z),round(lead[3]*z);scene.paste(chat.resize((cw,ch),Image.Resampling.LANCZOS),(x,y))
 d=ImageDraw.Draw(scene);letters=task[:max(0,min(len(task),int((t-.55)*13.2)))];ft=font(max(10,round(z*11)));tx=x+round(10*z);ty=y+round(20*z)
 d.text((tx,ty),letters,font=ft,fill='#f1f2f4');caret=tx+round(d.textlength(letters,font=ft))+2
 if t<4.4:d.line((caret,ty+2,caret,ty+ft.size),fill='#fff',width=2)
 dx=(17*math.sin(t*1.7) if t>5 else 0);cur=cursor['Lead'].resize((int(min(220,107*z)),int(min(95,46*z))),Image.Resampling.LANCZOS)
 if t<3.48:spot=(int(caret-10*z),int(ty+4*z))
 else:
  spot=XY(px,py)
 scene.paste(cur,spot,cur)
 if .55<t<3.4:
  phase=(t*6)%1;r=round(6*(1-phase));sx=caret+8+round(14*phase);sy=ty-round(12*phase)
  d.polygon([(sx,sy-r),(sx+2,sy-2),(sx+r,sy),(sx+2,sy+2),(sx,sy+r),(sx-2,sy+2),(sx-r,sy),(sx-2,sy-2)],fill='#ebe3f6')
 if t>16.45:scene=Image.blend(scene,end,ease((t-16.45)/.62))
 ff.stdin.write(scene.tobytes())
ff.stdin.close();assert ff.wait()==0
