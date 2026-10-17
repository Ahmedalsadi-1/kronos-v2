export const computerOutputLimit = 128 * 1024;
export interface DockerResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
    interrupted: boolean;
    truncated: boolean;
}
export function computerOutput(maxOutputBytes = computerOutputLimit) {
    const limit = Math.min(maxOutputBytes, 15 * 1024 * 1024);
    const result: DockerResult = {
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: false,
        interrupted: false,
        truncated: false,
    };
    const stdout: Buffer[] = [],
        stderr: Buffer[] = [];
    let count = 0;
    const capture = (chunks: Buffer[]) => (data: string | Buffer) => {
        const chunk = Buffer.from(data);
        const remaining = Math.max(0, limit - count);
        if (chunk.length > remaining) result.truncated = true;
        if (remaining) chunks.push(chunk.subarray(0, remaining));
        count += Math.min(remaining, chunk.length);
    };
    return {
        result,
        limit,
        stdout: capture(stdout),
        stderr: capture(stderr),
        finish() {
            result.stdout = Buffer.concat(stdout).toString("utf8");
            result.stderr = Buffer.concat(stderr).toString("utf8");
            return result;
        },
    };
}
