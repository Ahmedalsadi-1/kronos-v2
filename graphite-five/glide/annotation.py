from pathlib import Path
import cv2,numpy as np,subprocess
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parent
video=root.parents[1]/'graphite-recut/composition/assets/annotate.mp4'
cap=cv2.VideoCapture(str(video))
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia Italic.ttf',57)
small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18)
bg=Image.new('RGB',(1920,1080),(10,15,20))
d=ImageDraw.Draw(bg);d.text((36,17),'Annotate a result.',font=font,fill='#f2f1ec');d.text((1742,47),'ANNOTATE',font=small,fill='#bfc5ba')
bg=np.asarray(bg)[:,:,::-1].copy()
enc=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s','1920x1080','-r','30','-i','-','-an','-c:v','libx264','-preset','veryfast','-threads','2','-crf','16','-pix_fmt','yuv420p',str(root/'annotation.mp4')],stdin=subprocess.PIPE)
for index in range(90):
 cap.set(cv2.CAP_PROP_POS_MSEC,index*1000/30)
 ok,im=cap.read()
 if not ok:break
 # The recorded popover opens above the selected restaurant in the left results pane.
 u=min(1,index/55);q=u**3*(10+u*(-15+6*u))
 width=1430-490*q;left=12+44*q;top=30+27*q
 k=1880/width;M=np.float32([[k,0,-left*k],[0,k,-top*k]])
 screen=cv2.warpAffine(im,M,(1880,934),flags=cv2.INTER_LINEAR)
 frame=bg.copy();frame[119:1053,20:1900]=screen
 enc.stdin.write(frame.tobytes())
enc.stdin.close();assert enc.wait()==0
