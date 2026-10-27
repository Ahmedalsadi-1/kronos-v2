// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const base=fileURLToPath(new URL('./',import.meta.url));
const root=join(base,'upstream');
const manifest=JSON.parse(readFileSync(join(base,'upstream-source.json'),'utf8'));
const inputs=['apply-patches.mjs','build.mjs','upstream-source.json',...['src/components/Sidebar.tsx','src/components/Avatar.tsx','src/main.tsx','src/App.tsx','src/lib/brand.ts','server/brand.ts','server/index.ts','server/drivers/acp/core.ts'].map(x=>'upstream/'+x)];
function sourceFiles(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?sourceFiles(join(dir,x.name)):[join(dir,x.name)]);}
const hash=createHash('sha256').update(manifest.commit);
for(const file of [...inputs.map(x=>join(base,x)),...sourceFiles(join(root,'src/kronterm')),...sourceFiles(join(root,'server/kronterm'))])hash.update(readFileSync(file));
const fingerprint=hash.digest('hex');
const stamp=join(root,'dist-server/kronterm-build.json');
if(process.argv.includes('--if-needed')&&existsSync(stamp)&&existsSync(join(root,'dist/index.html'))&&JSON.parse(readFileSync(stamp,'utf8')).fingerprint===fingerprint){console.log('Agent workspace source build is current.');process.exit(0);}
if(!existsSync(join(root,'node_modules/vite/bin/vite.js'))){
 const installed=spawnSync(process.platform==='win32'?'npx.cmd':'npx',['--yes','pnpm@10.33.0','install','--frozen-lockfile','--ignore-scripts','--store-dir',join(tmpdir(),'kronterm-openmausbot-pnpm-store')],{cwd:root,stdio:'inherit',env:{...process.env,npm_config_manage_package_manager_versions:'false',PNPM_HOME:join(tmpdir(),'kronterm-openmausbot-pnpm')}});
 if(installed.status!==0)process.exit(installed.status??1);
}
for(const args of [[join(base,'apply-patches.mjs')],['node_modules/vite/bin/vite.js','build'],['scripts/bundle-server.mjs'],['scripts/mark-module-scope.mjs','dist-server']]){
 const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
}
writeFileSync(stamp,JSON.stringify({commit:manifest.commit,fingerprint})+'\n');
