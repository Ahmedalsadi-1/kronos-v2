# QEMU process inspection benchmark (2026-11-10)

The Rust addon cut the median repeat identity check from **3.296 ms to 0.0131 ms** on the live Linux desktop VM. It eliminated one short-lived `ps` child per check. The median resident memory increase in a fresh Node parent was 336 KiB smaller after its first check. This measures the host identity check only; it does not establish lower guest RAM, faster boot, or lower whole-app memory.

| Host measurement | Legacy Node + `ps` | Rust addon |
| --- | ---: | ---: |
| First check, median / p95 | 5.611 / 12.254 ms | 1.019 / 1.901 ms |
| Repeat check, median / p95 | 3.296 / 4.848 ms | 0.0131 / 0.0278 ms |
| Parent baseline RSS, median | 46,816 KiB | 46,896 KiB |
| Parent RSS after first check, median | 47,856 KiB | 47,584 KiB |
| Parent RSS increase, median / p95 | 1,040 / 1,088 KiB | 704 / 720 KiB |
| Child process peak RSS, median / p95 | 1,424 / 1,440 KiB | No child |

The same running QEMU process (PID 50702) had host RSS of 305,984–410,944 KiB during the trial, with a median of 347,184 KiB. Its configured guest RAM was 2,048 MiB. Host QEMU RSS varies with activity; these were samples of one VM across both paths. Guest memory use was not measured. Parent RSS and child peak RSS use different sampling points and should not be added.

The benchmark used macOS 26.1 on arm64 and Node 24.13.0. It alternated the order of the two paths across 12 fresh Node parents per path. Each parent timed its first check and 100 repeat checks (1,200 repeat samples per path). First-call latency includes loading the addon or spawning the first child, but excludes Node startup. The legacy check uses signal 0 and the original command substring match; the native check uses the full production `-drive` argument. Both paths had to accept the actual disk and reject a wrong path. Parent RSS came from `process.memoryUsage.rss()`; separately launched `ps` children were measured with `/usr/bin/time -l`. The VM stayed running throughout and received no input.

To reproduce from the repository root on arm64 macOS, with a running managed Linux VM and permission to inspect it:

```sh
node scripts/build-vm-process.mjs
node analyses/performance/benchmark-vm-process.mjs <PID> /absolute/path/to/ubuntu.qcow2
```
