import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ["renderer.tsx"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  minify: true,
  jsx: "automatic",
  tsconfig: "../../../../tsconfig.json",
  legalComments: "eof",
});
