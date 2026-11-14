from pathlib import Path
import json
import re
import subprocess
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
MASTER = ROOT / 'brag.master.mp4'
FINAL = ROOT / 'brag.mp4'
FRAMES = ROOT / 'review-frames'
FRAMES.mkdir(exist_ok=True)

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

run(['ffmpeg', '-v', 'error', '-ss', '78.5', '-i', str(MASTER), '-frames:v', '1', '-q:v', '2', '-y', str(ROOT/'brag.jpg')])
run(['ffmpeg', '-v', 'error', '-i', str(MASTER), '-i', str(ROOT/'brag.jpg'), '-filter_complex', "[0:v][1:v]overlay=0:0:enable='eq(n,0)'[v]", '-map', '[v]', '-map', '0:a?', '-map_metadata', '-1', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'copy', '-metadata', 'title=KronTerm / The office comes alive', '-metadata', 'comment=Music: Cylinder Five by Chris Zabriskie, from Cylinders (2014). CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ https://chriszabriskie.com/cylinders/ . Trimmed, faded and mixed. Editorial companion startup; montage of recorded sessions.', '-movflags', '+faststart', '-y', str(FINAL)])

times = [1.8, 8, 18, 32, 38, 55, 65, 73, 78.5]
sheet = Image.new('RGB', (1920, 1143), '#08090c')
draw = ImageDraw.Draw(sheet)
for i, time in enumerate(times):
    target = FRAMES / f'{i+1:02}-at-{time:g}s.png'
    run(['ffmpeg', '-v', 'error', '-ss', str(time), '-i', str(FINAL), '-frames:v', '1', '-y', str(target)])
    with Image.open(target) as frame:
        thumb = frame.resize((640, 360), Image.Resampling.LANCZOS)
        x, y = (i % 3) * 640, (i // 3) * 381
        sheet.paste(thumb, (x, y))
        draw.text((x + 12, y + 363), f'{time:g} seconds', fill='#f0eff5')
sheet.save(ROOT/'review-contact-sheet.jpg', quality=95)

probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'quiet', '-show_format', '-show_streams', '-count_frames', '-of', 'json', str(FINAL)]))
video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
audio = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
assert (video['width'], video['height']) == (1920, 1080)
assert video['r_frame_rate'] == '30/1'
assert int(video['nb_read_frames']) == 2400
assert audio['channels'] == 2
assert abs(float(probe['format']['duration'])-80) < .05
run(['ffmpeg', '-v', 'error', '-i', str(FINAL), '-f', 'null', '-'], capture_output=True)
measured = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(FINAL), '-af', 'loudnorm=I=-17:TP=-1:LRA=9:print_format=json', '-f', 'null', '-'], capture_output=True, text=True, check=True)
audio_stats = json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}', measured.stderr)[-1])
report = dict(duration=float(probe['format']['duration']), width=video['width'], height=video['height'], fps=video['r_frame_rate'], frames=int(video['nb_read_frames']), videoCodec=video['codec_name'], audioCodec=audio['codec_name'], audioChannels=audio['channels'], audioSampleRate=audio['sample_rate'], audioMeasurement=audio_stats, fullDecode='pass', posterTime=78.5, posterBakedIntoFrameZero=True, reviewFrameTimes=times, audioListening='Measured, not heard by a human', evidenceGaps='See CAPTURE-GAPS.md')
(ROOT/'quality-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
