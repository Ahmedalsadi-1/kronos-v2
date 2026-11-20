import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const Root = fileURLToPath(new URL("../", import.meta.url));
const Compact = await readFile(path.join(Root, "assets/branding/kronos-mark.svg"), "utf8");
const Expanded = await readFile(path.join(Root, "assets/branding/kronos-expanded.svg"), "utf8");
const fixedTheme = (source, mode) =>
  source.replace(
    /<style>[\s\S]*?<\/style>/,
    () =>
      `<style>[class$="-art-light"]{display:${mode === "light" ? "inline" : "none"}}[class$="-art-dark"]{display:${mode === "dark" ? "inline" : "none"}}</style>`
  );
const save = async (file, data) => {
  const target = path.join(Root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
};
for (const file of [
  "frontend/app/asset/logo.svg",
  "website/public/assets/kronos-logo.svg",
  "website/public/assets/kronos-compact.svg",
  "website/public/assets/product/kronterm-icon.svg",
  "docs/static/img/logo/kronterm-icon.svg",
  "assets/onboarding/aside-demo/states/kronos-logo.svg",
])
  await save(file, Compact);
for (const file of [
  "frontend/app/asset/logo-expanded.svg",
  "website/public/assets/kronos-expanded.svg",
  "website/public/assets/product/kronterm-logo.svg",
])
  await save(file, Expanded);
for (const mode of ["light", "dark"]) {
  await save(`assets/branding/kronos-mark-${mode}.svg`, fixedTheme(Compact, mode));
  await save(`assets/branding/kronos-expanded-${mode}.svg`, fixedTheme(Expanded, mode));
}
await save("docs/static/img/logo/kronterm-icon-dark.svg", fixedTheme(Compact, "dark"));

// Native icon formats have no theme switch; use the supplied purple center mark.
const AppIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${fixedTheme(
  Compact,
  "light"
)
  .replace("<svg ", '<svg x="64" y="64" ')
  .replace(/width="[^"]*"/, 'width="896"')
  .replace(/height="[^"]*"/, 'height="896"')}</svg>`;
await save("assets/branding/kronos-app-icon.svg", AppIcon);
const png = async (size) => sharp(Buffer.from(AppIcon)).resize(size, size).png().toBuffer();
for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
  await save(`build/icons/${size}x${size}.png`, await png(size));
}
await save("public/logos/kronterm-icon.png", await png(512));
await save("website/public/apple-touch-icon.png", await png(180));

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = await Promise.all(icoSizes.map(png));
const icoHeader = Buffer.alloc(6 + 16 * icoSizes.length);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(icoSizes.length, 4);
let offset = icoHeader.length;
icoImages.forEach((data, index) => {
  const start = 6 + 16 * index;
  icoHeader[start] = icoHeader[start + 1] = icoSizes[index] % 256;
  icoHeader.writeUInt16LE(1, start + 4);
  icoHeader.writeUInt16LE(32, start + 6);
  icoHeader.writeUInt32LE(data.length, start + 8);
  icoHeader.writeUInt32LE(offset, start + 12);
  offset += data.length;
});
const Ico = Buffer.concat([icoHeader, ...icoImages]);
await save("build/icon.ico", Ico);
await save("website/public/favicon.ico", Ico);

const icnsChunks = [];
for (const [type, size] of [
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
]) {
  const data = await png(size);
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32BE(data.length + 8, 4);
  icnsChunks.push(header, data);
}
const icnsHeader = Buffer.alloc(8);
icnsHeader.write("icns");
icnsHeader.writeUInt32BE(8 + icnsChunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
const Icns = Buffer.concat([icnsHeader, ...icnsChunks]);
await save("build/kronos.icns", Icns);
await save("build/icon.icns", Icns);
console.log("Generated responsive KronOS chrome marks and packaged center icons.");
