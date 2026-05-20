#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { startProgress } from "./progress.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = join(packageRoot, ".pi-talk-runtime");
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

  await run("uv", supertonicToolArgs("download"), {
    env: { ...process.env, SUPERTONIC_CACHE_DIR: modelCacheDir },
    progressLabel: "Downloading Supertonic model (~385 MiB)",
  });

  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        runtimeStrategy: "uv-tool-run",
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
  if (options.progressLabel) {
    console.log("[pi-talk setup] First install may take about a minute while Supertonic model files download.");
    await runWithProgress(command, args, options);
    return;
  }
  await runStreaming(command, args, options);
}

async function runStreaming(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: options.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} ${args.join(" ")} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}

async function runWithProgress(command, args, options) {
  await new Promise((resolve, reject) => {
    const progress = startProgress(options.progressLabel);
    const child = spawn(command, args, { env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];

    child.stdout?.on("data", (chunk) => chunks.push(chunk));
    child.stderr?.on("data", (chunk) => chunks.push(chunk));
    child.on("error", (error) => {
      progress.stop(`${options.progressLabel} failed`);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (code === 0) {
        progress.stop(`${options.progressLabel} complete`);
        resolve(undefined);
        return;
      }

      progress.stop(`${options.progressLabel} failed`);
      const output = Buffer.concat(chunks).toString("utf8").trim();
      if (output) console.error(output);
      reject(new Error(`${command} ${args.join(" ")} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
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

function supertonicToolArgs(...supertonicArgs) {
  return ["tool", "run", "--python", pythonVersion, "--from", `supertonic[serve]==${supertonicVersion}`, "supertonic", ...supertonicArgs];
}

main().catch((error) => {
  console.error(`[pi-talk setup] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
