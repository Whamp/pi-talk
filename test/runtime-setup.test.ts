import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TALK_CONFIG } from "../src/config.js";
import { setupPiTalkRuntime, type RuntimeSetupOperations } from "../src/runtime-setup.js";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("Complete Package Setup", () => {
  it("fails clearly when uv is missing", async () => {
    const commands: Array<{ command: string; args: string[] }> = [];
    const ops: RuntimeSetupOperations = {
      commandExists: async () => false,
      execFile: async (command, args) => {
        commands.push({ command, args });
        return { stdout: "", stderr: "" };
      },
      fileIsNonEmpty: async () => false,
      readTextFile: async () => undefined,
      mkdir: async () => undefined,
      writeFile: async () => undefined,
      now: () => new Date("2026-05-20T00:00:00.000Z"),
    };

    await expect(
      setupPiTalkRuntime({
        packageRoot: tempDir("pi-talk-package-"),
        modelCacheDir: tempDir("pi-talk-model-cache-"),
        config: DEFAULT_TALK_CONFIG,
        ops,
      }),
    ).rejects.toThrow("uv is required for Pi Talk Complete Package Setup");
    expect(commands).toEqual([]);
  });

  it("uses uv's shared tool cache, downloads missing model files, and writes manifests", async () => {
    const packageRoot = tempDir("pi-talk-package-");
    const modelCacheDir = tempDir("pi-talk-model-cache-");
    const madeDirs: string[] = [];
    const writes: Array<{ path: string; content: string }> = [];
    const commands: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];
    const ops: RuntimeSetupOperations = {
      commandExists: async (command) => command === "uv",
      fileIsNonEmpty: async () => false,
      readTextFile: async () => undefined,
      execFile: async (command, args, options) => {
        commands.push({ command, args, env: options?.env });
        return { stdout: "", stderr: "" };
      },
      mkdir: async (path) => {
        madeDirs.push(path);
      },
      writeFile: async (path, content) => {
        writes.push({ path, content });
      },
      now: () => new Date("2026-05-20T00:00:00.000Z"),
    };

    const manifest = await setupPiTalkRuntime({ packageRoot, modelCacheDir, config: DEFAULT_TALK_CONFIG, ops });

    expect(madeDirs).toEqual([join(packageRoot, ".pi-talk-runtime"), modelCacheDir]);
    expect(commands.map(({ command, args }) => ({ command, args }))).toEqual([
      {
        command: "uv",
        args: ["tool", "run", "--python", "3.12", "--from", "supertonic[serve]==1.3.1", "supertonic", "download"],
      },
    ]);
    expect(commands[0].env?.SUPERTONIC_CACHE_DIR).toBe(modelCacheDir);
    expect(manifest).toEqual({
      runtimeStrategy: "uv-tool-run",
      pythonVersion: "3.12",
      supertonicVersion: "1.3.1",
      model: "supertonic-3",
      modelRevision: "724fb5abbf5502583fb520898d45929e62f02c0b",
      modelCacheDir,
      runtimeDir: join(packageRoot, ".pi-talk-runtime"),
      setupTimestamp: "2026-05-20T00:00:00.000Z",
    });
    expect(writes).toEqual([
      {
        path: join(packageRoot, ".pi-talk-runtime", "runtime-manifest.json"),
        content: `${JSON.stringify(manifest, null, 2)}\n`,
      },
      {
        path: join(modelCacheDir, "pi-talk-model-manifest.json"),
        content: `${JSON.stringify(
          {
            model: "supertonic-3",
            supertonicVersion: "1.3.1",
            modelRevision: "724fb5abbf5502583fb520898d45929e62f02c0b",
          },
          null,
          2,
        )}\n`,
      },
    ]);
  });

  it("reuses a complete model cache instead of downloading again", async () => {
    const packageRoot = tempDir("pi-talk-package-");
    const modelCacheDir = tempDir("pi-talk-model-cache-");
    const writes: Array<{ path: string; content: string }> = [];
    const commands: Array<{ command: string; args: string[] }> = [];
    const ops: RuntimeSetupOperations = {
      commandExists: async (command) => command === "uv",
      fileIsNonEmpty: async () => true,
      readTextFile: async (path) => {
        if (path.endsWith(".metadata")) return "724fb5abbf5502583fb520898d45929e62f02c0b\nsha\ntimestamp\n";
        return undefined;
      },
      execFile: async (command, args) => {
        commands.push({ command, args });
        return { stdout: "", stderr: "" };
      },
      mkdir: async () => undefined,
      writeFile: async (path, content) => {
        writes.push({ path, content });
      },
      now: () => new Date("2026-05-20T00:00:00.000Z"),
    };

    await setupPiTalkRuntime({ packageRoot, modelCacheDir, config: DEFAULT_TALK_CONFIG, ops });

    expect(commands).toEqual([]);
    expect(writes.map((write) => write.path)).toEqual([
      join(packageRoot, ".pi-talk-runtime", "runtime-manifest.json"),
      join(modelCacheDir, "pi-talk-model-manifest.json"),
    ]);
  });
});
