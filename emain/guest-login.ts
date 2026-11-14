// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { SandboxLoginProvider } from "../frontend/types/sandbox-login";
import { BrowserLoginSignals } from "./computer-plugins/browser-login-signals";
import { GuestBrowser } from "./computer-plugins/guest-commands";

export type PrivateBrowserInput =
    | { origin: string; action: "inspect"; agentId?: string }
    | { origin: string; action: "fill"; username: string; password: string }
    | { origin: string; action: "provider"; provider: SandboxLoginProvider }
    | { origin: string; action: "signup" };
export type PrivateBrowserResult = {
    phase: "submitted" | "needs-user" | "ready";
    passwordVisible: boolean;
    status: "required" | "authenticated" | "unknown";
    providers: SandboxLoginProvider[];
    registration?: boolean;
    signUpAvailable?: boolean;
};

// Credentials travel on SSH stdin, never in argv, generic tool arguments, or browser-observation results.
export const GuestLogin =
    GuestBrowser.slice(0, GuestBrowser.indexOf("op=args['action']"))
        .replace("args=json.loads(base64.b64decode(sys.argv[1]))", "args=json.load(sys.stdin)")
        .replace(/try: pages=tabs\(\)[\s\S]*?\npages=\[/, "pages=tabs()\npages=[")
        .replace(
            "u=urlparse(pages[0]['webSocketDebuggerUrl'])",
            "pages=[p for p in pages if (lambda u: u.scheme+'://'+u.netloc)(urlparse(p.get('url','')))==args['origin']]\nif len(pages)!=1: raise ValueError('Open exactly one login tab for this website')\nu=urlparse(pages[0]['webSocketDebuggerUrl'])"
        ) +
    `
def evaluate(expression):
 send({'id':1,'method':'Runtime.evaluate','params':{'expression':expression,'returnByValue':True,'awaitPromise':True,'userGesture':args['action'] in ('provider','signup')}})
 response=receive()
 if response.get('error') or 'exceptionDetails' in response.get('result',{}): raise ValueError('Browser operation failed')
 return response.get('result',{}).get('result',{}).get('value')
origin=json.dumps(args['origin'])
signals=${JSON.stringify(BrowserLoginSignals)}
inspect="(()=>{if(location.origin!=="+origin+")throw Error();const {status,passwordVisible,providers,registration,signUpControl}=("+signals+")();return {phase:'ready',status,passwordVisible,providers:Object.keys(providers),registration,signUpAvailable:!!signUpControl}})()"
if args['action']=='inspect':
 result=evaluate(inspect)
elif args['action'] in ('provider','signup'):
 send({'id':1,'method':'Page.bringToFront'});receive()
 provider=json.dumps(args.get('provider'))
 result=evaluate("(()=>{if(location.origin!=="+origin+")throw Error();const {providers,passwordVisible,signUpControl}=("+signals+")();const control="+provider+"===null?signUpControl:providers["+provider+"];if(!control)throw Error();if(control instanceof HTMLIFrameElement)control.focus();else control.click();return {phase:'needs-user',status:'required',passwordVisible,providers:[]}})()")
else:
 send({'id':1,'method':'Page.bringToFront'});receive()
 config=json.dumps({'origin':args['origin'],'username':args.get('username',''),'password':args.get('password','')})
 expression="""((config)=>{
 if(location.origin!==config.origin)throw Error();
 const {passwordField:password}=(SIGNALS)();
 if(!password || !password.form)return {phase:'needs-user',passwordVisible:!!password};
 const form=password.form;
 if(new URL(form.action||location.href,location.href).origin!==config.origin)throw Error();
 const fields=Array.from(form.querySelectorAll('input')).filter(e=>e.getClientRects().length&&!e.disabled);
 const user=fields.find(e=>e.autocomplete==='username'||e.type==='email')||fields.find(e=>e.type==='text');
 const set=(field,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));};
 if(user)set(user,config.username);
 set(password,config.password);
 if(location.origin!==config.origin || new URL(form.action||location.href,location.href).origin!==config.origin){set(password,'');throw Error();}
 if(!form.reportValidity()){set(password,'');return {phase:'needs-user',passwordVisible:true};}
 form.requestSubmit();return {phase:'submitted',passwordVisible:true};
 })(CONFIG)""".replace('SIGNALS',signals).replace('CONFIG',config)
 try:
  result=evaluate(expression)
  time.sleep(1)
 finally:
  try: evaluate("(()=>{if(location.origin!=="+origin+")return false;const {passwordField}=("+signals+")();if(passwordField)Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(passwordField,'');return true})()")
  except Exception: pass
 try:
  status=evaluate(inspect)
  result.update({key:status[key] for key in ('status','passwordVisible','providers')})
 except Exception: result.update(status='unknown',passwordVisible=True,providers=[])
print(json.dumps(result))
s.close()
`;
