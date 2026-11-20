from pathlib import Path
import subprocess
import cv2
import numpy as np

root = Path(__file__).resolve().parents[1]
source = cv2.VideoCapture(str(root.parent / 'graphite-recut/base.mp4'))
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
    return t*t*t*(t*(t*6-15)+10)
enc=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s','1920x1080','-r','30','-i','-','-c:v','libx264','-preset','veryfast','-crf','16','-pix_fmt','yuv420p',str(root/'bridge.mp4')],stdin=subprocess.PIPE)
for i in range(72):
    t=i/71
    pos=ease(t)
    change=ease((t-.08)/.84)
    frame=cv2.addWeighted(a,1-change,b,change,0)
    # Change the editorial caption between moves so the two lines never overlap.
    header_mix=ease((t-.36)/.28)
    header_base=np.broadcast_to(a[:118,1:2],a[:118].shape)
    if t<.5:
        frame[:118]=cv2.addWeighted(a[:118],1-2*header_mix,header_base,2*header_mix,0)
    else:
        frame[:118]=cv2.addWeighted(header_base,2-2*header_mix,b[:118],2*header_mix-1,0)
    x,y,r,d=np.array(old)*(1-pos)+np.array(new)*pos
    # Subpixel placement preserves the slow movement at the ends of the glide.
    def position(tile):
        h,w=tile.shape[:2]
        m=np.float32([[(r-x)/w,0,x],[0,(d-y)/h,y]])
        return cv2.warpAffine(tile,m,(1920,1080),flags=cv2.INTER_LINEAR)
    layer=cv2.addWeighted(position(island),1-change,position(composer),change,0)
    mask=position(np.ones(island.shape[:2],dtype=np.float32))
    frame=(frame*(1-mask[:,:,None])+layer).clip(0,255).astype(np.uint8)
    enc.stdin.write(frame.tobytes())
enc.stdin.close()
assert enc.wait()==0
