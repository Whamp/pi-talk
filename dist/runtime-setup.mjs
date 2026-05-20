import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
const execFilePromise = promisify(execFileCallback);
export async function setupPiTalkRuntime(options) {
    const ops = options.ops ?? nodeRuntimeSetupOperations;
    if (!(await ops.commandExists("uv"))) {
        throw new Error("uv is required for Pi Talk Complete Package Setup. Install uv from https://docs.astral.sh/uv/getting-started/installation/ and run pi install again.");
    }
    const runtimeDir = join(options.packageRoot, ".pi-talk-runtime");
    await ops.mkdir(runtimeDir, { recursive: true });
    await ops.mkdir(options.modelCacheDir, { recursive: true });
    await ops.execFile("uv", supertonicToolArgs("download"), {
        env: { ...process.env, SUPERTONIC_CACHE_DIR: options.modelCacheDir },
    });
    const manifest = {
        runtimeStrategy: "uv-tool-run",
        pythonVersion: "3.12",
        supertonicVersion: "1.3.1",
        model: options.config.runtime.model,
        modelCacheDir: options.modelCacheDir,
        runtimeDir,
        setupTimestamp: options.ops?.now().toISOString() ?? new Date().toISOString(),
    };
    await ops.writeFile(join(runtimeDir, "runtime-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
}
export function supertonicToolArgs(...supertonicArgs) {
    return ["tool", "run", "--python", "3.12", "--from", "supertonic[serve]==1.3.1", "supertonic", ...supertonicArgs];
}
export const nodeRuntimeSetupOperations = {
    async commandExists(command) {
        try {
            await execFilePromise(process.platform === "win32" ? "where" : "command", process.platform === "win32" ? [command] : ["-v", command]);
            return true;
        }
        catch {
            if (process.platform !== "win32") {
                try {
                    await execFilePromise("/bin/sh", ["-lc", `command -v ${shellQuote(command)}`]);
                    return true;
                }
                catch {
                    return false;
                }
            }
            return false;
        }
    },
    async execFile(command, args, options) {
        const result = await execFilePromise(command, args, { env: options?.env });
        return { stdout: result.stdout, stderr: result.stderr };
    },
    async mkdir(path, options) {
        await mkdir(path, options);
    },
    writeFile,
    now: () => new Date(),
};
function shellQuote(value) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}
