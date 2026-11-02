import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const version = "0.22.5";
const commit = "bf0203a794a07aac3ff764972ab9087baa4e4f4e";
const root = path.join(homedir(), ".kronterm", "runtimes", `hermes-${version}`);
const source = path.join(root, "source");
const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
try {
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (
    !(await access(path.join(source, ".git")).then(
      () => true,
      () => false
    ))
  ) {
    await run("git", [
      "clone",
      "--depth",
      "1",
      "--branch",
      `v${version}`,
      "https://github.com/NousResearch/hermes-agent.git",
      source,
    ]);
  }
  await run("git", ["-C", source, "cat-file", "-e", `${commit}^{commit}`]);
  const { execFileSync } = await import("node:child_process");
  if (execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== commit)
    throw new Error("Hermes checkout does not match the reviewed runtime pin.");
  await run("uv", [
    "sync",
    "--directory",
    source,
    "--locked",
    "--no-dev",
    "--python",
    "3.14",
    "--extra",
    "web",
    "--extra",
    "mcp",
    "--extra",
    "acp",
  ]);
  const bin = path.join(source, ".venv", process.platform === "win32" ? "Scripts" : "bin");
  await run(path.join(bin, process.platform === "win32" ? "python.exe" : "python"), [
    "-c",
    "import agent.delegation_provider; import hermes_cli.middleware; import fastapi; from hermes_cli.main import main; print('Hermes delegation runtime ready')",
  ]);
  await writeFile(path.join(root, "ready.json"), JSON.stringify({ version, commit, source }), { mode: 0o600 });
  process.stdout.write(`Prepared Hermes ${version} for KronTerm. Restart KronTerm to use this isolated runtime.\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
