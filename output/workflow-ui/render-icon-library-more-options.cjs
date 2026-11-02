const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = '/tmp/kronterm-icon-options';
const roles = ['Terminal','Browser','Files','Agent','Workflow','Canvas','Settings','Search'];
const phosphor = ['terminal','globe','folder','robot','flow-arrow','squares-four','gear','magnifying-glass'];
const hero = ['command-line','globe-alt','folder','cpu-chip','share','view-columns','cog-6-tooth','magnifying-glass'];
const rows = [
 {label:'Phosphor Regular',pkg:'@phosphor-icons/core · 2.1.1',dir:'phosphor-icons-core-2.1.1/package/assets/regular',names:phosphor,caption:'Soft, open outlines'},
 {label:'Phosphor Duotone',pkg:'@phosphor-icons/core · 2.1.1',dir:'phosphor-icons-core-2.1.1/package/assets/duotone',names:phosphor.map(n=>n+'-duotone'),caption:'Two-tone fill + outline'},
 {label:'Heroicons Outline',pkg:'heroicons · 2.2.0',dir:'heroicons-2.2.0/package/24/outline',names:hero,caption:'Fine rounded outlines'},
 {label:'Heroicons Solid',pkg:'heroicons · 2.2.0',dir:'heroicons-2.2.0/package/24/solid',names:hero,caption:'Solid silhouettes'},
 {label:'Fluent Regular',pkg:'@fluentui/svg-icons · 1.1.345',dir:'fluentui-svg-icons-1.1.345/package/icons',names:['prompt','globe','folder','bot','flowchart','grid','settings','search'].map(n=>n+'_24_regular'),caption:'Microsoft Fluent outlines'},
 {label:'Bootstrap Icons',pkg:'bootstrap-icons · 1.13.2',dir:'bootstrap-icons-1.13.2/package/icons',names:['terminal','globe2','folder','robot','diagram-3','grid-1x2','gear','search'],caption:'Compact geometric forms'},
];
const w=1240,h=1116,left=226,cw=122;
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const text=(x,y,v,size=13,color='#b8b8bd',anchor='start',weight=400)=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}">${esc(v)}</text>`;
let out=`<rect width="${w}" height="${h}" rx="18" fill="#080809"/><rect x="1" y="1" width="1238" height="1114" rx="17" fill="none" stroke="#303034"/>`;
out+=text(34,46,'KronTerm OS / more icon options',25,'#f3f3f5','start',600);
out+=text(34,75,'Six more styles. Official package SVGs at 32 px; native geometry, weights and duotone opacity preserved.',14);
out+=text(34,114,'LIBRARY / STYLE',11,'#9999a1','start',600);
roles.forEach((r,i)=>out+=text(left+i*cw+cw/2,114,r,13,'#d7d7dc','middle',500));
out+='<path d="M28 132H1212" stroke="#303034"/>';
rows.forEach((row,ri)=>{
 const top=148+ri*146;
 out+=text(34,top+42,row.label,18,'#f2f2f5','start',600)+text(34,top+67,row.pkg,11)+text(34,top+91,row.caption,11,'#a9a9b1');
 row.names.forEach((name,i)=>{
  const file=path.join(root,row.dir,name+'.svg');
  let svg=fs.readFileSync(file,'utf8').replace(/<\?xml[^>]*>/g,'');
  svg=svg.replace(/<svg\b([^>]*)>/,(_,attrs)=>'<svg'+attrs.replace(/\s(?:width|height)="[^"]*"/g,'')+' width="32" height="32" color="#f2f2f5">');
  svg=svg.replace(/fill="#212121"/g,'fill="currentColor"');
  const cx=left+i*cw+cw/2;
  out+=`<g transform="translate(${cx-16} ${top+27})" color="#f2f2f5" fill="currentColor">${svg}</g>`;
  const label=name.replace(/-duotone$/,'').replace(/_24_regular$/,'').replaceAll('_','-');
  out+=text(cx,top+91,label,label.length>16?9:10,'#b8b8bd','middle');
 });
 out+=`<path d="M28 ${top+126}H1212" stroke="#242427"/>`;
});
out+=text(34,1063,'Same eight OS roles · all genuine SVG assets · no application icons changed',13);
out+=text(34,1089,'Labels beneath glyphs show source asset names. Heroicons uses cpu-chip for Agent; Fluent uses prompt for Terminal.',12,'#a9a9b1');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">Six additional KronTerm OS icon styles</title><desc id="desc">Official icons compared across Phosphor Regular and Duotone, Heroicons Outline and Solid, Fluent Regular, and Bootstrap.</desc><g font-family="Arial,sans-serif">${out}</g></svg>`;
const stem=path.join(__dirname,'icon-library-more-options');
fs.writeFileSync(stem+'.svg',svg);
fs.writeFileSync(stem+'.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KronTerm OS — More icon options</title><style>body{margin:0;padding:24px;background:#080809;color:#eee;font-family:Arial,sans-serif}main{max-width:1240px;margin:auto}svg{width:100%;height:auto}nav{display:flex;gap:24px;margin:20px 8px}a{color:#c9c9d4}</style><main>${svg}<nav><a href="icon-library-more-options.png" download>Download PNG</a><a href="icon-library-more-options.svg" download>Download SVG</a><a href="icon-library-comparison.html">First three libraries</a></nav></main></html>`);
sharp(Buffer.from(svg)).png().toFile(stem+'.png').then(()=>console.log(stem+'.png'));
