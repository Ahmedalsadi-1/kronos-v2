import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseProcesses(output) {
    return output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
            if (!match) throw new Error(`Invalid process row: ${line}`);
            return { pid: Number(match[1]), ppid: Number(match[2]), rssKiB: Number(match[3]), command: match[4] };
        });
}
export function descendants(processes, roots) {
    const selected = new Set(roots);
    let changed = true;
    while (changed) {
        changed = false;
        for (const process of processes) {
            if (selected.has(process.ppid) && !selected.has(process.pid)) {
                selected.add(process.pid);
                changed = true;
            }
        }
    }
    return processes.filter((process) => selected.has(process.pid));
}
export function summarize(samples) {
    const values = samples.map((sample) => sample.rssMiB).sort((a, b) => a - b);
    if (!values.length) throw new Error("No memory samples");
    return {
        minMiB: values[0],
        medianMiB: values[Math.floor(values.length / 2)],
        maxMiB: values.at(-1),
        samples: values.length,
    };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const session = JSON.parse(await readFile(path.join(here, ".runtime/session.json"), "utf8"));
    if (session.development) throw new Error("Run with built release assets before measuring memory");
    const label = process.argv[2] ?? "workspace";
    if (!/^[a-z0-9-]+$/i.test(label)) throw new Error("Use a simple workload label");
    const extraPids = (process.env.KRONTERM_WEBKIT_PIDS ?? "").split(",").filter(Boolean).map(Number);
    if (extraPids.some((pid) => !Number.isSafeInteger(pid) || pid < 1)) throw new Error("Invalid WebKit PID");
    const samples = [];
    for (let index = 0; index < 15; index++) {
        const processes = parseProcesses(
            execFileSync("ps", ["-axo", "pid=,ppid=,rss=,command="], { encoding: "utf8" })
        );
        if (
            extraPids.some(
                (pid) =>
                    !processes.some((process) => process.pid === pid && process.command.includes("com.apple.WebKit"))
            )
        ) {
            throw new Error("An explicitly attributed WebKit process is missing or has a different identity");
        }
        const own = descendants(processes, [session.launcherPid, ...extraPids]);
        if (!own.some((process) => process.pid === session.launcherPid))
            throw new Error("Prototype launcher is no longer running");
        const physical =
            process.platform === "darwin"
                ? JSON.parse(
                      execFileSync(
                          "python3",
                          [path.join(here, "scripts/footprint.py"), ...own.map((process) => String(process.pid))],
                          { encoding: "utf8" }
                      )
                  )
                : [];
        samples.push({
            physicalFootprintMiB:
                physical.length && physical.every((process) => process.physicalFootprintBytes != null)
                    ? physical.reduce((sum, process) => sum + process.physicalFootprintBytes, 0) / 1024 / 1024
                    : null,
            physicalMeasurements: physical,
            timestamp: new Date().toISOString(),
            rssMiB: own.reduce((sum, process) => sum + process.rssKiB, 0) / 1024,
            processes: own.map(({ pid, ppid, rssKiB, command }) => ({
                pid,
                ppid,
                rssKiB,
                executable: path.basename(command.split(" ")[0]),
            })),
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const functional = JSON.parse(await readFile(path.join(here, ".runtime/renderer-report.json"), "utf8"));
    const browserProof = JSON.parse(await readFile(path.join(here, ".runtime/browser-proof.json"), "utf8"));
    if (
        !functional.checks?.shell?.pass ||
        !functional.checks?.terminalOutput?.pass ||
        !functional.checks?.terminalIdentity?.pass ||
        functional.browser?.url !== "http://127.0.0.1:14291/"
    ) {
        throw new Error("The controlled shell, terminal, and browser workload did not pass");
    }
    if (functional.host !== session.host || browserProof.host !== session.host || !browserProof.desktopDenied) {
        throw new Error("Functional evidence does not match this host or browser isolation failed");
    }
    const result = {
        functionalEvidence: {
            status: functional.status,
            checks: functional.checks,
            geometry: functional.agentControl?.snapshot?.rects,
            browser: functional.browser,
            browserProof,
        },
        host: session.host,
        label,
        metric: "sum RSS; shared pages may be counted more than once",
        attributionComplete: session.host === "electron" || extraPids.length > 0,
        caveat:
            session.host === "tauri"
                ? "macOS WebKit XPC processes may not be descendants. Supply independently verified KRONTERM_WEBKIT_PIDS; otherwise this is a lower bound, not a valid savings estimate."
                : "Electron controlled host comparison; not the full production Electron app.",
        system: {
            platform: process.platform,
            loadAverage: os.loadavg(),
            swap:
                process.platform === "darwin"
                    ? execFileSync("sysctl", ["-n", "vm.swapusage"], { encoding: "utf8" }).trim()
                    : null,
        },
        physicalFootprintSummary: samples.every((sample) => sample.physicalFootprintMiB != null)
            ? summarize(samples.map((sample) => ({ rssMiB: sample.physicalFootprintMiB })))
            : null,
        summary: summarize(samples),
        samples,
    };
    await mkdir(path.join(here, "results"), { recursive: true });
    const output = path.join(here, "results", `${session.host}-${label}-${Date.now()}.json`);
    await writeFile(output, JSON.stringify(result, null, 2));
    console.log(
        JSON.stringify(
            {
                output,
                summary: result.summary,
                physicalFootprintSummary: result.physicalFootprintSummary,
                attributionComplete: result.attributionComplete,
                caveat: result.caveat,
            },
            null,
            2
        )
    );
}
