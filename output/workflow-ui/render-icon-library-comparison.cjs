const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const roles = ['Terminal', 'Browser', 'Files', 'Agent', 'Workflow', 'Canvas', 'Settings', 'Search'];
const libraries = [
    { label: 'Lucide', package: 'lucide-react', module: require('lucide-react'), names: ['Terminal', 'Globe', 'Folder', 'Bot', 'Workflow', 'PanelsTopLeft', 'Settings', 'Search'], detail: 'Outline · native default stroke' },
    { label: 'Tabler', package: '@tabler/icons-react', module: require('@tabler/icons-react'), names: ['IconTerminal2', 'IconWorld', 'IconFolder', 'IconRobot', 'IconSchema', 'IconLayoutDashboard', 'IconSettings', 'IconSearch'], detail: 'Outline · native default stroke' },
    { label: 'Remix Icon', package: '@remixicon/react', module: require('@remixicon/react'), names: ['RiTerminalBoxLine', 'RiGlobalLine', 'RiFolder3Line', 'RiRobot2Line', 'RiNodeTree', 'RiLayoutMasonryLine', 'RiSettings3Line', 'RiSearchLine'], detail: 'Line variants · native filled paths' },
];
const width = 1240, height = 674, left = 226, cellWidth = 122;
const text = (x, y, value, size = 13, color = '#b8b8bd', anchor = 'start', weight = 400) => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}">${value}</text>`;
let contents = `<rect width="${width}" height="${height}" rx="18" fill="#080809"/><rect x="1" y="1" width="1238" height="672" rx="17" fill="none" stroke="#303034"/>`;
contents += text(34, 46, 'KronTerm OS / icon library comparison', 25, '#f3f3f5', 'start', 600);
contents += text(34, 75, 'Choose a library before changing the OS. Actual installed components, rendered at 32 px.', 14);
contents += text(34, 114, 'LIBRARY', 11, '#8d8d94', 'start', 600);
roles.forEach((role, index) => contents += text(left + index * cellWidth + cellWidth / 2, 114, role, 13, '#d7d7dc', 'middle', 500));
contents += '<path d="M28 132H1212" stroke="#303034"/>';
libraries.forEach((library, row) => {
    const top = 148 + row * 146;
    contents += text(34, top + 42, library.label, 19, '#f2f2f5', 'start', 600);
    contents += text(34, top + 67, library.package, 12, '#b8b8bd');
    contents += text(34, top + 91, library.detail, 10, '#9d9da5');
    library.names.forEach((name, index) => {
        const center = left + index * cellWidth + cellWidth / 2;
        const component = library.module[name];
        if (!component) throw Error(`Missing real icon: ${library.package}/${name}`);
        const icon = renderToStaticMarkup(React.createElement(component, { size: 32, width: 32, height: 32, color: '#f2f2f5', 'aria-hidden': true }));
        contents += `<g transform="translate(${center - 16} ${top + 27})">${icon}</g>`;
        const display = name.replace(/^Icon/, '').replace(/^Ri/, '');
        contents += text(center, top + 91, display, display.length > 16 ? 9 : 10, '#a9a9b1', 'middle');
    });
    contents += `<path d="M28 ${top + 126}H1212" stroke="#242427"/>`;
});
contents += text(34, 621, 'Same OS roles • native proportions and weights preserved • no application icons changed', 13, '#b8b8bd');
contents += text(34, 647, 'Labels below each glyph identify the actual component export (Tabler: Icon… / Remix: Ri…).', 12, '#96969f');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">KronTerm OS icon libraries</title><desc id="desc">Eight identical OS roles compared across Lucide, Tabler, and Remix Icon using installed SVG components.</desc><g font-family="Arial, sans-serif">${contents}</g></svg>`;
const directory = __dirname;
fs.writeFileSync(path.join(directory, 'icon-library-comparison.svg'), svg);
fs.writeFileSync(path.join(directory, 'icon-library-comparison.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>KronTerm OS icon library comparison</title><style>body{margin:0;background:#080809;color:#f2f2f5;font-family:Arial,sans-serif;padding:24px}main{max-width:1240px;margin:auto}svg{width:100%;height:auto}a{color:#c9c9d4}nav{display:flex;gap:24px;margin:20px 8px;font-size:14px}</style><main>${svg}<nav aria-label="Download comparison"><a href="icon-library-comparison.png" download>Download PNG</a><a href="icon-library-comparison.svg" download>Download SVG</a></nav></main></html>`);
sharp(Buffer.from(svg)).png().toFile(path.join(directory, 'icon-library-comparison.png')).then(() => console.log(path.join(directory, 'icon-library-comparison.png')));
