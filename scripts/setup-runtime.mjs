#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = join(packageRoot, ".pi-talk-runtime");
const venvDir = join(runtimeDir, "venv");
const manifestPath = join(runtimeDir, "runtime-manifest.json");
const pythonVersion = "3.12";
const supertonicVersion = "1.3.1";
const model = "supertonic-3";

async function main() {
  if (!(await commandExists("uv"))) {
    throw new Error(
      "uv is required for Pi Talk Complete Package Setup. Install uv from https://docs.astral.sh/uv/getting-started/installation/ and run pi install again.",
    );
  }

  const modelCacheDir = resolveModelCacheDir();
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(modelCacheDir, { recursive: true });

  await run("uv", ["venv", "--python", pythonVersion, venvDir]);
  await run("uv", ["pip", "install", "--python", venvPythonPath(venvDir), `supertonic[serve]==${supertonicVersion}`]);
  await run(venvExecutablePath(venvDir, "supertonic"), ["download"], {
    env: { ...process.env, SUPERTONIC_CACHE_DIR: modelCacheDir },
  });

  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        pythonVersion,
        supertonicVersion,
        model,
        modelCacheDir,
        runtimeDir,
        setupTimestamp: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

async function run(command, args, options = {}) {
  console.log(`[pi-talk setup] ${command} ${args.join(" ")}`);
  await execFileAsync(command, args, { stdio: "inherit", env: options.env });
}

async function commandExists(command) {
  try {
    if (platform() === "win32") await execFileAsync("where", [command]);
    else await execFileAsync("/bin/sh", ["-lc", `command -v '${command.replaceAll("'", "'\\''")}'`]);
    return true;
  } catch {
    return false;
  }
}

function resolveModelCacheDir() {
  if (process.env.PI_TALK_SUPERTONIC_CACHE_DIR) return resolve(process.env.PI_TALK_SUPERTONIC_CACHE_DIR);

  const globalConfig = readJson(join(homedir(), ".pi", "agent", "talk.json"));
  const configured = globalConfig?.runtime?.modelCacheDir;
  if (typeof configured === "string" && configured.length > 0) {
    return resolve(configured.replace(/^~/, homedir()));
  }

  if (platform() === "darwin") return join(homedir(), "Library", "Caches", "pi-talk", "supertonic");
  if (platform() === "win32") return join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE || homedir(), ".cache"), "pi-talk", "supertonic");
  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "pi-talk", "supertonic");
}

function readJson(path) {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function venvExecutablePath(venv, executable) {
  return platform() === "win32" ? join(venv, "Scripts", `${executable}.exe`) : join(venv, "bin", executable);
}

function venvPythonPath(venv) {
  return platform() === "win32" ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
}

main().catch((error) => {
  console.error(`[pi-talk setup] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
