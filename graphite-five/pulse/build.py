from pathlib import Path
import subprocess, cv2, numpy as np
from PIL import ImageFont,ImageDraw,Image
p=Path(__file__).resolve().parent
project=p.parents[1]
src=project/'graphite-device-cut/composition'
s=(src/'render_follow.py').read_text().replace('HERE=Path(__file__).resolve().parent','HERE=Path('+repr(str(src))+')').replace("str(HERE.parent/'ending.mp4')","str("+repr(str(p/'ending.mp4'))+")")
s=s.replace('bd.text((270,65)',"bd.line((257,71,257,108),fill='#aaf2ca',width=4)\nbd.text((270,65)")
a=s.index('keys=[');b=s.index('for frame in',a)
s=s[:a]+'''# Cursor and camera use the same continuous track. The camera keeps a little lead room.
route=[(3.48,504,294,465,296,3.55),(4.42,1262,242,1380,280,3.39),(6.27,1312,249,1384,281,3.53),
       (7.22,1758,269,1749,280,3.30),(9.35,1764,315,1749,280,3.40),
       (10.18,1766,569,1748,593,3.40),(11.86,1745,629,1748,593,3.45),
       (13.05,650,318,960,540,1),(17.1,522,303,960,540,1)]
def track(t):
 if t<=route[0][0]:return route[0][1:]
 for n,(a,b) in enumerate(zip(route,route[1:])):
  if t>b[0]:continue
  u=max(0,min(1,(t-a[0])/(b[0]-a[0])));f=u**3*(10-15*u+6*u*u)
  bend=math.sin(math.pi*u)**2 if n in (0,2,4,6) else 0
  px,py,cx,cy,z=[mix(x,y,f) for x,y in zip(a[1:],b[1:])]
  arc={0:-28,2:-20,4:8,6:18}.get(n,0)*bend
  return px,py+arc,cx,cy+arc,z-.23*bend
 return route[-1][1:]
'''+s[b:]
s=s.replace('range(540)','range(510)').replace('cx,cy,z=spline(t,keys)','px,py,cx,cy,z=track(t)').replace('t>=13.65','t>=13.05').replace('t>16.45','t>15.6').replace('(t-16.45)/.62','(t-15.6)/.54').replace('4.15 if i==2 else 7.35 if i==3 else 11','4.15 if i==2 else 7.0 if i==3 else 9.95').replace('2.4 if i==2 else 3.0 if i==3 else 1.7','1.9 if i==2 else 2.25 if i==3 else 1.7')
a=s.index('  startx=lead');b=s.index(' scene.paste(cur,spot,cur)',a)
s=s[:a]+'''  px,py,_,_,_=track(t);spot=XY(px,py)
'''+s[b:]
exec(compile(s,str(p/'build.py'),'exec'))
