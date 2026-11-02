import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
test('overlapping mounts serialize and stale cleanup cannot dispose the replacement editor', async()=>{
    const calls=[];let release;
    const firstGate=new Promise(resolve=>release=resolve);
    globalThis.window={};globalThis.localStorage={setItem(){}};
    globalThis.__nativeMount=async(_element,host)=>{
        calls.push('mount:'+host.id);
        if(host.id==='first')await firstGate;
        return()=>{calls.push('dispose:'+host.id);if(window.__KRONTERM_WORKFLOW_HOST__===host)delete window.__KRONTERM_WORKFLOW_HOST__;};
    };
    const mock='data:text/javascript,'+encodeURIComponent('export const mount=(...args)=>globalThis.__nativeMount(...args)');
    const source=ts.transpileModule(fs.readFileSync(new URL('./native-entry.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/(['"])\.\/kronterm-native-bootstrap\1/g,JSON.stringify(mock));
    const entry=await import('data:text/javascript,'+encodeURIComponent(source));
    const first={id:'first',backendUrl:'http://localhost:5678',browserId:'one'};
    const second={...first,id:'second'};
    const a=entry.mountKronTermWorkflow({},first);const b=entry.mountKronTermWorkflow({},second);
    await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(calls,['mount:first']);
    release();const [disposeFirst,disposeSecond]=await Promise.all([a,b]);
    assert.deepEqual(calls,['mount:first','dispose:first','mount:second']);
    disposeFirst();assert.equal(window.__KRONTERM_WORKFLOW_HOST__,second);
    disposeSecond();disposeSecond();assert.deepEqual(calls,['mount:first','dispose:first','mount:second','dispose:second']);
    delete globalThis.__nativeMount;
});
