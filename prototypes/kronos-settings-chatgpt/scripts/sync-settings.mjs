import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from '../../../node_modules/typescript/lib/typescript.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const out = path.join(root, 'prototypes/kronos-settings-chatgpt/src');
const source = fs.readFileSync(path.join(root,'frontend/hermes/app/settings/constants.ts'),'utf8');
const wanted = ['PROVIDER_GROUPS','ENUM_OPTIONS','FIELD_LABELS','FIELD_DESCRIPTIONS','SECTIONS'];
const ast = ts.createSourceFile('constants.ts',source,ts.ScriptTarget.Latest,true);
const chunks = [];
for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
        if (wanted.includes(declaration.name.getText(ast))) chunks.push(`const ${declaration.name.getText(ast)} = ${declaration.initializer.getText(ast)};`);
    }
}
function flatten(tree,prefix='',out={}) { for(const [key,value] of Object.entries(tree)) { const id=prefix?`${prefix}.${key}`:key; if(typeof value==='string')out[id]=value;else flatten(value,id,out); } return out; }
const context={defineFieldCopy:flatten,REASONING_EFFORTS:['minimal','low','medium','high','xhigh','max','ultra']};
for(const name of ['Box','Brain','Lock','MessageCircle','Mic','Monitor','Moon','Palette','Sun','Wrench']) context[name]=null;
const js=ts.transpile(chunks.join('\n'),{target:ts.ScriptTarget.ES2022});
const ui=vm.runInNewContext(js+`; ({${wanted.join(',')}})`,context);
fs.writeFileSync(path.join(out,'hermes-ui.json'),JSON.stringify(ui,null,4));
const result=spawnSync('python3',[path.join(root,'prototypes/kronos-settings-chatgpt/scripts/sync-settings.py'),root],{stdio:'inherit'});
if(result.status)process.exit(result.status);
function metadata(relative, names, extras={}) {
    const file=path.join(root,relative);
    const source=fs.readFileSync(file,'utf8');
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    const statements=ast.statements.filter(s=>!ts.isImportDeclaration(s)&&!ts.isExportDeclaration(s)).map(s=>s.getText(ast).replace(/^export\s+/,''));
    const code=ts.transpile(statements.join('\n'),{target:ts.ScriptTarget.ES2022});
    return vm.runInNewContext(code+`; ({${names.join(',')}})`,extras);
}
const locale=metadata('frontend/hermes/i18n/en.ts',['en'],ui).en;
const binds=metadata('frontend/hermes/lib/keybinds/actions.ts',['KEYBIND_ACTIONS','KEYBIND_READONLY'],{IS_MAC:true});
fs.writeFileSync(path.join(out,'interface-metadata.json'),JSON.stringify({shortcuts:binds.KEYBIND_ACTIONS.map(a=>({...a,label:locale.keybinds.actions[a.id]||a.id})),readonlyShortcuts:binds.KEYBIND_READONLY.map(a=>({...a,label:locale.keybinds.actions[a.id]||a.id})),notifications:locale.settings.notifications,settings:locale.settings.nav},null,4));
// Parse pinned integration metadata as syntax; callbacks and imported code are never executed.
function literal(node) {
    if (!node) return undefined;
    if (ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind===ts.SyntaxKind.TrueKeyword)return true;
    if (node.kind===ts.SyntaxKind.FalseKeyword)return false;
    if (node.kind===ts.SyntaxKind.NullKeyword)return null;
    if (ts.isArrayLiteralExpression(node))return node.elements.map(literal);
    if (ts.isObjectLiteralExpression(node))return Object.fromEntries(node.properties.filter(ts.isPropertyAssignment).map(p=>[p.name.text??p.name.getText(),literal(p.initializer)]));
    if (ts.isConditionalExpression(node)&&ts.isIdentifier(node.condition)&&node.condition.text==='isCloud')return literal(node.whenFalse);
    return undefined;
}
const renderSource=fs.readFileSync(path.join(root,'prototypes/kronos-settings-chatgpt/scripts/source/kronrender-core-settings.ts'),'utf8');
const renderAst=ts.createSourceFile('render.ts',renderSource,ts.ScriptTarget.Latest,true);
let renderFields=[];
function scan(node){
    if(ts.isVariableDeclaration(node)&&node.name.getText(renderAst)==='CORE_SETTINGS'){
        renderFields=node.initializer.elements.filter(ts.isObjectLiteralExpression).map(obj=>{
            const values=Object.fromEntries(obj.properties.filter(ts.isPropertyAssignment).map(p=>[p.name.text??p.name.getText(renderAst),literal(p.initializer)]));
            if(!values.id)return null;
            const options=Array.isArray(values.options)?values.options.map(v=>typeof v==='object'&&v?v.value:v).filter(v=>v!=null):undefined;
            const type=values.type==='boolean'?'toggle':values.type==='number'||values.type==='slider'?'number':values.defaultValue&&typeof values.defaultValue==='object'?'json':options?.length?'select':'text';
            return {key:values.id,label:values.name||values.id,value:values.defaultValue??'',type,options,description:values.tooltip||'',category:Array.isArray(values.category)?values.category.slice(0,2).join(' / '):values.id.split('.').slice(0,2).join(' / '),source:'KronRender',runtimeDefault:values.defaultValue==null,internal:values.type==='hidden',min:values.attrs?.min,max:values.attrs?.max};
        }).filter(Boolean);
    }
    ts.forEachChild(node,scan);
}scan(renderAst);
fs.writeFileSync(path.join(out,'render-fields.json'),JSON.stringify(renderFields,null,4));
const flowSource=fs.readFileSync(path.join(root,'integrations/n8n/upstream/packages/workflow/src/interfaces.ts'),'utf8');
const flowAst=ts.createSourceFile('flow.ts',flowSource,ts.ScriptTarget.Latest,true);
const flowFields=[];
for(const statement of flowAst.statements){
    if(!ts.isInterfaceDeclaration(statement)||statement.name.text!=='IWorkflowSettings')continue;
    for(const member of statement.members){
        if(!ts.isPropertySignature(member))continue;
        const key=member.name.getText(flowAst);
        const typeText=member.type.getText(flowAst);
        let options=ts.isUnionTypeNode(member.type)?member.type.types.filter(ts.isLiteralTypeNode).map(n=>literal(n.literal)).filter(v=>typeof v==='string'):undefined;
        if(typeText.includes('SaveDataExecution'))options=['DEFAULT','all','none'];
        if(typeText.includes('RedactionPolicy'))options=['none','all','non-manual','manual-only'];
        if(typeText.includes('CallerPolicy'))options=['workflowsFromSameOwner','workflowsFromAList','any','none'];
        const type=typeText.includes('boolean')&&!typeText.includes('DEFAULT')?'toggle':typeText==='number'?'number':typeText.includes('[]')?'json':options?.length>1?'select':'text';
        flowFields.push({key:'flow.'+key,label:key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase()),value:type==='toggle'?false:type==='json'?[]:options?.[0]??'',type,options:options?.length>1?options:undefined,category:'Workflow',source:'KronFlow',description:'Applies to the selected workflow.'});
    }
}
fs.writeFileSync(path.join(out,'flow-fields.json'),JSON.stringify(flowFields,null,4));
console.log(`Included ${renderFields.length} KronRender core settings and ${flowFields.length} KronFlow workflow settings`);
const interfaceFields=[];
const interfaceAudit=[];
const settingsDir=path.join(root,'frontend/hermes/app/settings');
function lookup(object,parts){return parts.reduce((value,key)=>value?.[key],object);}
for(const filename of fs.readdirSync(settingsDir,{recursive:true}).filter(name=>name.endsWith('.tsx')&&!name.includes('.test.')&&!name.includes('.preview.'))){
    const source=fs.readFileSync(path.join(settingsDir,filename),'utf8');
    const aliases={t:locale};
    for(const match of source.matchAll(/const\s+(\w+)\s*=\s*t\.([\w.]+)/g))aliases[match[1]]=lookup(locale,match[2].split('.'));
    const ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function resolve(node){
        if(!node)return undefined;
        if(ts.isJsxExpression(node))return resolve(node.expression);
        if(ts.isStringLiteral(node))return node.text;
        const ref=node.getText(ast);
        const parts=ref.split('.');
        if(parts.every(part=>/^\w+$/.test(part)))return lookup(aliases[parts[0]],parts.slice(1));
        return undefined;
    }
    function visit(node){
        if(ts.isJsxSelfClosingElement(node)||ts.isJsxElement(node)){
            const opening=ts.isJsxElement(node)?node.openingElement:node;
            const component=opening.tagName.getText(ast);
            if(['ToggleRow','ListRow'].includes(component)){
                const props=Object.fromEntries(opening.attributes.properties.filter(ts.isJsxAttribute).map(p=>[p.name.getText(ast),p.initializer]));
                const label=resolve(props.label||props.title);
                const description=resolve(props.description);
                if(typeof label==='string'){
                    const key=`interface.${filename.replace('.tsx','')}.${(props.label||props.title).getText(ast).replace(/[^\w.]/g,'')}`;
                    const body=node.getText(ast);
                    const isToggle=component==='ToggleRow'||body.includes('<Switch')||/id:\s*['"]off['"]/.test(body);
                    const type=component==='ListRow'&&!props.action?'info':isToggle?'toggle':/type=['"]number['"]/.test(body)?'number':body.includes('<Button')&&!body.includes('<Input')?'action':'text';
                    interfaceFields.push({key,label,description:typeof description==='string'?description:'',type,value:type==='toggle'?false:'',source:'Agent interface',category:filename.replace('-settings.tsx','').replace('.tsx',''),component,sourceFile:`frontend/hermes/app/settings/${filename}`});
                    interfaceAudit.push({file:filename,component,label,status:'captured'});
                }else interfaceAudit.push({file:filename,component,labelExpression:(props.label||props.title)?.getText(ast)||'',status:'dynamic-row'});
            }
        }
        ts.forEachChild(node,visit);
    }visit(ast);
}
const deduplicated=[...new Map(interfaceFields.map(field=>[field.key,field])).values()];
fs.writeFileSync(path.join(out,'interface-fields.json'),JSON.stringify(deduplicated,null,4));
fs.writeFileSync(path.join(out,'interface-copy.json'),JSON.stringify(locale.settings,null,4));
fs.writeFileSync(path.join(root,'prototypes/kronos-settings-chatgpt/settings-inventory.json'),JSON.stringify({controls:interfaceAudit,staticRows:deduplicated.length,dynamicRows:interfaceAudit.filter(row=>row.status==='dynamic-row').length},null,4));
console.log(`Inventoried ${deduplicated.length} static interface controls; dynamic rows covered by their schema or collection editors`);
