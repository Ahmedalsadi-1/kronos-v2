from pathlib import Path
import subprocess
import cv2
import numpy as np

root = Path(__file__).resolve().parents[1]
source = cv2.VideoCapture(str(root / 'base.mp4'))
def frame_at(second):
    source.set(cv2.CAP_PROP_POS_FRAMES, round(second * 30))
    ok, frame = source.read()
    assert ok
    return frame

a, b = frame_at(17.8), frame_at(20.2)
old = (1232, 861, 1902, 1048)
new = (383, 960, 1552, 1063)
def lift(frame, rect):
    x, y, r, d = rect
    crop = frame[y:d, x:r].copy()
    frame[y:d, x:r] = cv2.resize(frame[y:d, x-4:x], (r-x,d-y))
    return crop
island, composer = lift(a,old), lift(b,new)
def ease(t):
    t=np.clip(t,0,1)
    return t*t*(3-2*t)
enc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s','1920x1080','-r','30','-i','-','-c:v','libx264','-preset','veryfast','-crf','16','-pix_fmt','yuv420p',str(root/'bridge.mp4')],stdin=subprocess.PIPE)
for i in range(72):
    t=i/72
    pos=ease((t-.05)/.88)
    change=ease((t-.25)/.59)
    frame=cv2.addWeighted(a,1-change,b,change,0)
    x,y,r,d=np.rint(np.array(old)*(1-pos)+np.array(new)*pos).astype(int)
    frame[y:d,x:r]=cv2.addWeighted(cv2.resize(island,(r-x,d-y)),1-change,cv2.resize(composer,(r-x,d-y)),change,0)
    enc.stdin.write(frame.tobytes())
enc.stdin.close()
assert enc.wait()==0
