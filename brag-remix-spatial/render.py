from subprocess import run
src='../brag-output-2026-11-17-seamless/brag.mp4';starts=[7.7,19.8,29.8,35.8,39.3,42.3,46.3]
args=['ffmpeg','-v','error','-y','-i',src]
for i in range(6):args+=['-i',f'plate{i}.png']
g=['[0:v]split=2[base][panel]','[panel]crop=1760:878:80:172,scale=1432:714[small]']
prev='base'
for i in range(6):
 g.append(f"[{prev}][{i+1}:v]overlay=enable='gte(t,{starts[i]})*lt(t,{starts[i+1]})'[b{i}]");prev=f'b{i}'
g.append("[b5][small]overlay=428:180:enable='gte(t,7.7)*lt(t,46.3)'[v]")
args+=['-filter_complex',';'.join(g),'-map','[v]','-map','0:a','-threads','2','-c:v','libx264','-preset','veryfast','-crf','18','-c:a','copy','-movflags','+faststart','final.mp4'];run(args,check=True)
