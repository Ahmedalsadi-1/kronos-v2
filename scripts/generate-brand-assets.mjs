import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const Root = fileURLToPath(new URL("../", import.meta.url));
const Source = await readFile(path.join(Root, "assets/branding/kronos-mark.svg"), "utf8");
const Light = "#141414";
const Dark = "#faf9f6";
const Body = Source.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
const svg = (fill, content = Body, viewBox = "0 0 288 288", width = 48, height = 48) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" fill="${fill}">${content}</svg>\n`;
const Themed = svg(
  "currentColor",
  `<style>svg:root{color:${Light}}@media(prefers-color-scheme:dark){svg:root{color:${Dark}}}</style>${Body}`
);
const save = async (file, data) => {
  const target = path.join(Root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
};

for (const file of [
  "frontend/app/asset/logo.svg",
  "website/public/assets/kronos-logo.svg",
  "website/public/assets/product/kronterm-icon.svg",
  "docs/static/img/logo/kronterm-icon.svg",
  "assets/onboarding/aside-demo/states/kronos-logo.svg",
]) {
  await save(file, Themed);
}
await save("assets/branding/kronos-mark-light.svg", svg(Light));
await save("assets/branding/kronos-mark-dark.svg", svg(Dark));
await save("docs/static/img/logo/kronterm-icon-dark.svg", svg(Dark));
await save(
  "website/public/assets/product/kronterm-logo.svg",
  svg(
    "currentColor",
    `<style>svg:root{color:${Light}}@media(prefers-color-scheme:dark){svg:root{color:${Dark}}}</style><g transform="translate(0 2) scale(.333333)">${Body}</g><text x="106" y="70" font-family="Arial,sans-serif" font-size="61" font-weight="600">KronOS</text>`,
    "0 0 370 100",
    370,
    100
  )
);

// The neutral tile keeps the installed icon legible on either desktop appearance.
const AppIcon = svg(
  Light,
  `<rect x="64" y="64" width="896" height="896" rx="200" fill="${Dark}"/><g transform="translate(144 144) scale(2.555556)">${Body}</g>`,
  "0 0 1024 1024",
  1024,
  1024
);
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
console.log("Generated KronOS 04-E website, app, and packaged icons.");
