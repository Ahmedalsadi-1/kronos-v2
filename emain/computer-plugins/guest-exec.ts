// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

export const GuestExec = `import base64,json,sys,subprocess,tempfile,time
args=json.loads(base64.b64decode(sys.argv[1]))
started=time.monotonic()
with tempfile.TemporaryFile() as out,tempfile.TemporaryFile() as err:
 process=subprocess.run(['timeout','-k','2','55','sh','-lc',args['command']],stdout=out,stderr=err,cwd='/home/cua/workspace')
 out_size=out.tell();err_size=err.tell();out.seek(0);err.seek(0)
 result={'exitCode':process.returncode,'stdoutBase64':base64.b64encode(out.read(3000)).decode(),'stderrBase64':base64.b64encode(err.read(3000)).decode(),'truncated':out_size>3000 or err_size>3000,'durationMs':round((time.monotonic()-started)*1000),'timedOut':process.returncode in [124,137]}
 print(json.dumps(result,ensure_ascii=False))
`;
