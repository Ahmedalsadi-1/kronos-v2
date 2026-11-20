from pathlib import Path
import subprocess
import cv2
from PIL import Image, ImageDraw, ImageFont
import numpy as np
root=Path(__file__).resolve().parent
repo=root.parents[1]
source=repo/'graphite-device-cut/composition/render_follow.py'
s=source.read_text().replace("HERE.parents[1]/","HERE.parents[1]/").replace("HERE/'assets/", "HERE.parents[1]/'graphite-device-cut/composition/assets/").replace("HERE.parent/'ending.mp4'", "HERE/'ending.mp4'")
s=s.replace("W,H=1920,1080","cv2.setNumThreads(2)\nW,H=1920,1080").replace("'veryfast','-crf'","'veryfast','-threads','3','-crf'")
s=s[:s.index('keys=[')]+'''# Camera and pointer share the same continuous world-space route, with a small delayed gaze offset.
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
'''+s[s.index('for frame in range(540):'):]
s=s.replace('cx,cy,z=spline(t,keys)','px,py,cx,cy,z=trajectory(t)\n if 3.48<t<12.45:\n  oldx,oldy,*_=trajectory(t-.07);cx+=(oldx-px)*.34;cy+=(oldy-py)*.34')
a=s.index('  startx=');b=s.index('\n scene.paste(cur,spot',a)
s=s[:a]+'  spot=XY(px,py)'+s[b:]
(root/'render_scene.py').write_text(s)
