import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { GuestExec } from "./guest-exec";
const exec = promisify(execFile);
it("retains failing command diagnostics and bounds large output without losing the exit code", async () => {
    const source = GuestExec.replace("'/home/cua/workspace'", JSON.stringify(tmpdir())).replace("'-lc'", "'-c'");
    const command = "python3 -c \"import sys; print('x'*9000); print('test failed',file=sys.stderr); sys.exit(7)\"";
    const result = JSON.parse(
        (await exec("python3", ["-c", source, Buffer.from(JSON.stringify({ command })).toString("base64")])).stdout
    );
    expect(result).toMatchObject({ exitCode: 7, truncated: true, timedOut: false });
    expect(Buffer.from(result.stdoutBase64, "base64").toString()).toHaveLength(3000);
    expect(Buffer.from(result.stderrBase64, "base64").toString()).toBe("test failed\n");
});
