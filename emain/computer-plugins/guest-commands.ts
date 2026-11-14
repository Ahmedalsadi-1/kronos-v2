// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { BrowserLoginSignals } from "./browser-login-signals";

export function guestPython(source: string, input: Record<string, unknown>): string {
    const code = Buffer.from(source).toString("base64");
    const data = Buffer.from(JSON.stringify(input)).toString("base64");
    return `python3 -c "import base64; exec(base64.b64decode('${code}'))" '${data}'`;
}

export const GuestFiles = `import base64,json,sys,pathlib
args=json.loads(base64.b64decode(sys.argv[1]))
p=pathlib.Path(args.get('path','/home/cua/workspace')).expanduser()
if not p.is_absolute(): p=pathlib.Path('/home/cua/workspace')/p
op=args['action']
if op=='list': result=[{'name':x.name,'directory':x.is_dir()} for x in sorted(p.iterdir())][:1000]
elif op=='read':
 if p.stat().st_size>1048576: raise ValueError('File exceeds 1 MB')
 text=p.read_text(); offset=max(0,args.get('offset',0)); result={'path':str(p),'text':text[offset:offset+4000],'nextOffset':offset+4000 if len(text)>offset+4000 else None}
elif op in ['write','append']:
 text=args.get('text','')
 if len(text.encode())>1048576: raise ValueError('File exceeds 1 MB')
 p.parent.mkdir(parents=True,exist_ok=True)
 with p.open('a' if op=='append' else 'w') as f:f.write(text)
 result={'path':str(p),'written':len(text.encode())}
elif op=='commit':
 dest=pathlib.Path(args['target']).expanduser(); dest=dest if dest.is_absolute() else pathlib.Path('/home/cua/workspace')/dest
 p.replace(dest);result={'path':str(dest)}
elif op=='mkdir': p.mkdir(parents=True,exist_ok=True);result={'path':str(p)}
else: raise ValueError('Unknown file action')
print(json.dumps(result,ensure_ascii=False))
`;

const BrowserStateExpression = `(() => {
    const { autoPrompt } = (${BrowserLoginSignals})();
    const signInOrigin = location.protocol === "https:" && autoPrompt ? location.origin : null;
    return JSON.stringify({
        url: location.href,
        signInOrigin,
        title: document.title,
        text: document.body.innerText.slice(0, 8000),
        links: [...document.links].slice(0, 15).map((link) => ({
            text: link.innerText.slice(0, 100),
            url: link.href.slice(0, 400),
        })),
    });
})()`;

export const GuestBrowser = `import base64,json,sys,urllib.request,socket,struct,os,subprocess,time,shutil
args=json.loads(base64.b64decode(sys.argv[1]))
base='http://127.0.0.1:9222'
def tabs():
 with urllib.request.urlopen(base+'/json/list',timeout=3) as r: return json.load(r)
try: pages=tabs()
except Exception:
 binary=next((shutil.which(x) for x in ['chromium','chromium-browser','google-chrome'] if shutil.which(x)),None)
 if not binary: raise ValueError('Install Chromium in this computer first')
 log=open('/tmp/kronterm-browser.log','ab')
 launch=[binary,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=9222','--user-data-dir=/home/cua/workspace/.browser','--no-first-run','--disable-dev-shm-usage','--no-sandbox','about:blank']
 subprocess.Popen(launch,env={**os.environ,'DISPLAY':':1'},stdout=log,stderr=log,start_new_session=True)
 for attempt in range(30):
  time.sleep(.5)
  try: pages=tabs();break
  except Exception: pass
 else: raise ValueError('Guest browser did not start; inspect /tmp/kronterm-browser.log')
pages=[p for p in pages if p.get('type')=='page' and not str(p.get('url','')).startswith(('devtools:','chrome-devtools:'))]
if not pages: raise ValueError('No browser page is available')
from urllib.parse import urlparse
u=urlparse(pages[0]['webSocketDebuggerUrl'])
if u.hostname not in ['127.0.0.1','localhost'] or u.port!=9222: raise ValueError('Invalid guest browser endpoint')
s=socket.create_connection(('127.0.0.1',9222),5);s.settimeout(15)
key=base64.b64encode(os.urandom(16)).decode()
s.sendall(('GET '+u.path+' HTTP/1.1\\r\\nHost: 127.0.0.1:9222\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Key: '+key+'\\r\\nSec-WebSocket-Version: 13\\r\\n\\r\\n').encode())
buffer=b''
while b'\\r\\n\\r\\n' not in buffer: buffer+=s.recv(1)
if b' 101 ' not in buffer: raise ValueError('Browser websocket upgrade failed')
def send(payload):
 raw=json.dumps(payload).encode();n=len(raw);mask=os.urandom(4)
 head=bytes([129,128|n]) if n<126 else bytes([129,254])+struct.pack('!H',n) if n<65536 else bytes([129,255])+struct.pack('!Q',n)
 s.sendall(head+mask+bytes(c^mask[i%4] for i,c in enumerate(raw)))
def read(n):
 out=b''
 while len(out)<n:
  part=s.recv(n-len(out))
  if not part: raise ValueError('Browser disconnected')
  out+=part
 return out
def receive():
 while True:
  h=read(2);n=h[1]&127
  if n==126:n=struct.unpack('!H',read(2))[0]
  elif n==127:n=struct.unpack('!Q',read(8))[0]
  if n>4194304:raise ValueError('Browser response exceeds 4 MB')
  mask=read(4) if h[1]&128 else None;raw=read(n)
  if mask:raw=bytes(c^mask[i%4] for i,c in enumerate(raw))
  if h[0]&15==8:raise ValueError('Browser closed')
  if h[0]&15!=1:continue
  value=json.loads(raw)
  if value.get('id')==1:return value
op=args['action']
if op=='navigate':
 url=args.get('url','')
 if urlparse(url).scheme not in ['https','http','about']:raise ValueError('Use an HTTP or HTTPS browser URL')
 payload={'id':1,'method':'Page.navigate','params':{'url':url}}
else:
 expression=args.get('expression') if op=='evaluate' else ${JSON.stringify(BrowserStateExpression)}
 payload={'id':1,'method':'Runtime.evaluate','params':{'expression':expression,'returnByValue':True,'awaitPromise':True}}
send(payload);response=receive();s.close()
if response.get('error') or response.get('result',{}).get('exceptionDetails'):raise ValueError(json.dumps(response))
print(json.dumps(response,ensure_ascii=False))
`;
