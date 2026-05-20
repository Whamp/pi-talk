import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type { TalkConfig } from "./config.js";

const execFilePromise = promisify(execFileCallback);

export type ExecResult = {
  stdout: string;
  stderr: string;
};

export type RuntimeSetupOperations = {
  commandExists(command: string): Promise<boolean>;
  execFile(command: string, args: string[], options?: { env?: NodeJS.ProcessEnv }): Promise<ExecResult>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  now(): Date;
};

export type RuntimeManifest = {
  pythonVersion: "3.12";
  supertonicVersion: "1.3.1";
  model: "supertonic-3";
  modelCacheDir: string;
  runtimeDir: string;
  setupTimestamp: string;
};

export type RuntimeSetupOptions = {
  packageRoot: string;
  modelCacheDir: string;
  config: TalkConfig;
  ops?: RuntimeSetupOperations;
};

export async function setupPiTalkRuntime(options: RuntimeSetupOptions): Promise<RuntimeManifest> {
  const ops = options.ops ?? nodeRuntimeSetupOperations;
  if (!(await ops.commandExists("uv"))) {
    throw new Error(
      "uv is required for Pi Talk Complete Package Setup. Install uv from https://docs.astral.sh/uv/getting-started/installation/ and run pi install again.",
    );
  }

  const runtimeDir = join(options.packageRoot, ".pi-talk-runtime");
  const venvDir = join(runtimeDir, "venv");
  await ops.mkdir(runtimeDir, { recursive: true });
  await ops.mkdir(options.modelCacheDir, { recursive: true });

  await ops.execFile("uv", ["venv", "--clear", "--python", "3.12", venvDir]);
  const python = venvPythonPath(venvDir);
  const supertonic = venvExecutablePath(venvDir, "supertonic");
  await ops.execFile("uv", ["pip", "install", "--python", python, "supertonic[serve]==1.3.1"]);
  await ops.execFile(supertonic, ["download"], {
    env: { ...process.env, SUPERTONIC_CACHE_DIR: options.modelCacheDir },
  });

  const manifest: RuntimeManifest = {
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

export function venvExecutablePath(venvDir: string, executable: string): string {
  return process.platform === "win32" ? join(venvDir, "Scripts", `${executable}.exe`) : join(venvDir, "bin", executable);
}

export function venvPythonPath(venvDir: string): string {
  return process.platform === "win32" ? join(venvDir, "Scripts", "python.exe") : join(venvDir, "bin", "python");
}

export const nodeRuntimeSetupOperations: RuntimeSetupOperations = {
  async commandExists(command) {
    try {
      await execFilePromise(process.platform === "win32" ? "where" : "command", process.platform === "win32" ? [command] : ["-v", command]);
      return true;
    } catch {
      if (process.platform !== "win32") {
        try {
          await execFilePromise("/bin/sh", ["-lc", `command -v ${shellQuote(command)}`]);
          return true;
        } catch {
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
