import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type { TalkConfig } from "./config.js";

const execFilePromise = promisify(execFileCallback);

const PYTHON_VERSION = "3.12" as const;
const SUPERTONIC_VERSION = "1.3.1" as const;
const MODEL = "supertonic-3" as const;
const MODEL_REVISION = "724fb5abbf5502583fb520898d45929e62f02c0b" as const;
const MODEL_CACHE_MANIFEST = "pi-talk-model-manifest.json";
const REQUIRED_MODEL_CACHE_FILES = [
  "onnx/duration_predictor.onnx",
  "onnx/text_encoder.onnx",
  "onnx/vector_estimator.onnx",
  "onnx/vocoder.onnx",
  "onnx/tts.json",
  "onnx/unicode_indexer.json",
  "voice_styles/F1.json",
  "voice_styles/F2.json",
  "voice_styles/F3.json",
  "voice_styles/F4.json",
  "voice_styles/F5.json",
  "voice_styles/M1.json",
  "voice_styles/M2.json",
  "voice_styles/M3.json",
  "voice_styles/M4.json",
  "voice_styles/M5.json",
] as const;

export type ExecResult = {
  stdout: string;
  stderr: string;
};

export type RuntimeSetupOperations = {
  commandExists(command: string): Promise<boolean>;
  execFile(command: string, args: string[], options?: { env?: NodeJS.ProcessEnv }): Promise<ExecResult>;
  fileIsNonEmpty(path: string): Promise<boolean>;
  readTextFile(path: string): Promise<string | undefined>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  now(): Date;
};

export type RuntimeManifest = {
  runtimeStrategy: "uv-tool-run";
  pythonVersion: typeof PYTHON_VERSION;
  supertonicVersion: typeof SUPERTONIC_VERSION;
  model: typeof MODEL;
  modelRevision: typeof MODEL_REVISION;
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
  await ops.mkdir(runtimeDir, { recursive: true });
  await ops.mkdir(options.modelCacheDir, { recursive: true });

  if (!(await modelCacheIsComplete(options.modelCacheDir, ops))) {
    await ops.execFile("uv", supertonicToolArgs("download"), {
      env: { ...process.env, SUPERTONIC_CACHE_DIR: options.modelCacheDir },
    });
  }

  const manifest: RuntimeManifest = {
    runtimeStrategy: "uv-tool-run",
    pythonVersion: PYTHON_VERSION,
    supertonicVersion: SUPERTONIC_VERSION,
    model: options.config.runtime.model,
    modelRevision: MODEL_REVISION,
    modelCacheDir: options.modelCacheDir,
    runtimeDir,
    setupTimestamp: options.ops?.now().toISOString() ?? new Date().toISOString(),
  };
  await ops.writeFile(join(runtimeDir, "runtime-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await ops.writeFile(join(options.modelCacheDir, MODEL_CACHE_MANIFEST), `${JSON.stringify(modelCacheManifest(), null, 2)}\n`);
  return manifest;
}

async function modelCacheIsComplete(cacheDir: string, ops: RuntimeSetupOperations): Promise<boolean> {
  const hasRequiredFiles = await Promise.all(REQUIRED_MODEL_CACHE_FILES.map((path) => ops.fileIsNonEmpty(join(cacheDir, path))));
  if (!hasRequiredFiles.every(Boolean)) return false;

  const cacheManifest = parseJsonRecord(await ops.readTextFile(join(cacheDir, MODEL_CACHE_MANIFEST)));
  if (cacheManifest) return cacheManifestMatches(cacheManifest);

  const metadataRevisions = await Promise.all(REQUIRED_MODEL_CACHE_FILES.map((path) => readHuggingFaceMetadataRevision(cacheDir, path, ops)));
  const hasMetadata = metadataRevisions.some((revision) => revision !== undefined);
  if (hasMetadata) return metadataRevisions.every((revision) => revision === MODEL_REVISION);

  return true;
}

async function readHuggingFaceMetadataRevision(cacheDir: string, relativePath: string, ops: RuntimeSetupOperations): Promise<string | undefined> {
  const content = await ops.readTextFile(join(cacheDir, ".cache", "huggingface", "download", `${relativePath}.metadata`));
  return content?.split(/\r?\n/, 1)[0]?.trim() || undefined;
}

function cacheManifestMatches(manifest: Record<string, unknown>): boolean {
  return manifest.model === MODEL && manifest.supertonicVersion === SUPERTONIC_VERSION && manifest.modelRevision === MODEL_REVISION;
}

function modelCacheManifest(): Record<string, string> {
  return {
    model: MODEL,
    supertonicVersion: SUPERTONIC_VERSION,
    modelRevision: MODEL_REVISION,
  };
}

function parseJsonRecord(content: string | undefined): Record<string, unknown> | undefined {
  if (!content) return undefined;
  try {
    const parsed = JSON.parse(content) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function supertonicToolArgs(...supertonicArgs: string[]): string[] {
  return ["tool", "run", "--python", PYTHON_VERSION, "--from", `supertonic[serve]==${SUPERTONIC_VERSION}`, "supertonic", ...supertonicArgs];
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
  async fileIsNonEmpty(path) {
    try {
      const stats = await stat(path);
      return stats.isFile() && stats.size > 0;
    } catch {
      return false;
    }
  },
  async readTextFile(path) {
    try {
      return await readFile(path, "utf8");
    } catch {
      return undefined;
    }
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
