// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./upstream/',import.meta.url));
const manifest=JSON.parse(readFileSync(new URL('./upstream-source.json',import.meta.url),'utf8'));
const adapted=new Set(['src/components/Sidebar.tsx','src/components/Avatar.tsx','src/main.tsx','src/App.tsx','src/lib/brand.ts','server/brand.ts','server/index.ts','server/drivers/acp/core.ts']);
let identical=0,modified=0;
for(const file of manifest.files){
 const actual=createHash('sha256').update(readFileSync(root+file.path)).digest('hex');
 if(actual===file.sha256){identical++;continue;}
 if(!adapted.has(file.path))throw new Error(`Unrecorded upstream edit: ${file.path}`);
 modified++;
}
console.log(JSON.stringify({commit:manifest.commit,identicalFiles:identical,integrationAdaptations:modified}));
