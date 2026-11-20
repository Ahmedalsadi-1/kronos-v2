#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
D=graphite-five/glide
ffmpeg -hide_banner -loglevel error -y -threads 3 -i graphite-device-cut/kronos.mp4 -threads 2 -i "$D/annotation.mp4" -threads 2 -i "$D/ending.mp4" -filter_complex_threads 3 -filter_complex "
[0:v]split[head][tail];
[head]trim=end=35.3,setpts=PTS-STARTPTS,settb=AVTB[a];
[1:v]setpts=PTS-STARTPTS,settb=AVTB[b];
[tail]trim=start=42.5:end=46.2,setpts=PTS-STARTPTS,settb=AVTB[c];
[2:v]setpts=PTS-STARTPTS,settb=AVTB[d];
[a][b]xfade=duration=0.3:offset=35.0[ab];
[ab][c]xfade=duration=0.3:offset=37.7[abc];
[abc][d]xfade=duration=0.4:offset=41.0,setpts=PTS/1.085,fps=30,scale=1856:1044:flags=lanczos,pad=1920:1080:32:18:color=0x172023,drawbox=x=31:y=17:w=1858:h=1046:color=0x899b95@0.54:t=1,setsar=1[v];
[0:a]asplit[ah][at];[ah]atrim=end=35.30,asetpts=PTS-STARTPTS[a0];[at]atrim=start=39.60,asetpts=PTS-STARTPTS[a1];[a0][a1]acrossfade=d=0.3,atempo=1.085,atrim=duration=54.38,afade=t=out:st=53.4:d=0.95[aud]" -map '[v]' -map '[aud]' -c:v libx264 -threads 4 -preset veryfast -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$D/kronos-glide.mp4"
