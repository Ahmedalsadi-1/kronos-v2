from pathlib import Path
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
MEDIA = ROOT / 'composition/assets/media'
MEDIA.mkdir(parents=True, exist_ok=True)

CLIPS = [
    dict(id='os', source=ROOT.name+'/sources/Screen Recording 2026-10-27 at 5.47.46\u202fAM.mov', start=39, end=50.7, speed=1, crop=[20, 14, 694, 588], status='macOS private-beta development', drive='1MqgdXU4Nv2sBxT44jHkuPzG2xcwslZyX'),
    dict(id='browser', source='assets/Screen Recording 2026-10-28 at 12.48.42\u202fAM.mov', start=0, end=16.5, speed=16.5/18, crop=[230, 0, 1240, 790], status='macOS private-beta development', drive='1Wjzv-lp64NVJhS9rce5Z4FCc5j6Lrvh6'),
    dict(id='selector', source='assets/Screen Recording 2026-10-28 at 12.43.03\u202fAM.mov', start=0, end=18, speed=1.5, crop=[261, 40, 960, 704], status='macOS private-beta development', drive='1Nxhfur4pK4l3rtmkx-0JQXuskt5jLyib'),
    dict(id='flights', source=ROOT.name+'/sources/Screen Recording 2026-10-28 at 12.10.55\u202fAM.mov', start=118, end=133, speed=1, crop=[66, 58, 828, 432], status='macOS private-beta development', drive='18WUFmHpjqoN3pAMPs0dv4cWhz5SZcFbd'),
    dict(id='android', source='assets/Screen Recording 2026-10-28 at 12.49.45\u202fAM.mov', start=73, end=88, speed=1, crop=[230, 0, 1240, 790], status='Phone control / Android / Labs'),
]

CAMERAS = {
    'browser': [dict(t=0, scale=1, x=0, y=0, rotationY=-4),dict(t=2,scale=1.28,x=300,y=-40,rotationY=0),dict(t=5,scale=1.28,x=300,y=-40,rotationY=0),dict(t=8,scale=1.18,x=-220,y=0,rotationY=0),dict(t=13,scale=1.18,x=-220,y=0,rotationY=0),dict(t=16,scale=1,x=0,y=0,rotationY=0)],
    'selector': [dict(t=0,scale=.98,x=0,y=0),dict(t=3,scale=1.07,x=130,y=0),dict(t=7.8,scale=1.07,x=130,y=0),dict(t=10,scale=1,x=0,y=0)],
    'os': [dict(t=0,scale=1,x=0,y=0),dict(t=9,scale=1.04,x=-20,y=0)],
}

ledger=[]
for clip in CLIPS:
    src=REPO / clip['source']
    target=MEDIA / (clip['id']+'.mp4')
    x,y,w,h=clip['crop']
    vf=f'crop={w}:{h}:{x}:{y},setpts=(PTS-STARTPTS)/{clip["speed"]},fps=30,format=yuv420p'
    if not target.exists():
        subprocess.run(['ffmpeg','-v','error','-ss',str(clip['start']),'-t',str(clip['end']-clip['start']),'-i',str(src),'-vf',vf,'-an','-c:v','libx264','-crf','16','-preset','veryfast','-movflags','+faststart','-y',str(target)],check=True)
    ledger.append(dict(clip,originalSourcePath=str(src),media='assets/media/'+target.name,cameraKeyframes=CAMERAS.get(clip['id'],[]),kind='moving recording',redaction='Desktop wallpaper and unrelated outer UI removed by crop; original UI text preserved.'))

out=ROOT/'composition/assets/source-ledger.json'
out.write_text(json.dumps(dict(reference='https://launchscene.app/v/linear-agent',branch='feat/kronsettings-from-kronoschamber',clips=ledger,notes=['Fleet is an editorial arrangement of recorded sessions, not a captured simultaneous fleet run.','No complete selected-element prompt/result is claimed.','Office and companion startup are editorial animation.']),indent=2))
shutil.copy2(out,ROOT/'source-ledger.json')
print('Prepared',len(ledger),'moving media sources')
