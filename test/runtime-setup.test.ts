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

  it("creates a package-local runtime, downloads the model, and writes a manifest", async () => {
    const packageRoot = tempDir("pi-talk-package-");
    const modelCacheDir = tempDir("pi-talk-model-cache-");
    const madeDirs: string[] = [];
    const writes: Array<{ path: string; content: string }> = [];
    const commands: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];
    const ops: RuntimeSetupOperations = {
      commandExists: async (command) => command === "uv",
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
      { command: "uv", args: ["venv", "--clear", "--python", "3.12", join(packageRoot, ".pi-talk-runtime", "venv")] },
      {
        command: "uv",
        args: ["pip", "install", "--python", join(packageRoot, ".pi-talk-runtime", "venv", "bin", "python"), "supertonic[serve]==1.3.1"],
      },
      { command: join(packageRoot, ".pi-talk-runtime", "venv", "bin", "supertonic"), args: ["download"] },
    ]);
    expect(commands[2].env?.SUPERTONIC_CACHE_DIR).toBe(modelCacheDir);
    expect(manifest).toEqual({
      pythonVersion: "3.12",
      supertonicVersion: "1.3.1",
      model: "supertonic-3",
      modelCacheDir,
      runtimeDir: join(packageRoot, ".pi-talk-runtime"),
      setupTimestamp: "2026-05-20T00:00:00.000Z",
    });
    expect(writes).toEqual([
      {
        path: join(packageRoot, ".pi-talk-runtime", "runtime-manifest.json"),
        content: `${JSON.stringify(manifest, null, 2)}\n`,
      },
    ]);
  });
});
