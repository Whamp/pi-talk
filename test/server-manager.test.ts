import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSupertonicServerManager, type ServerManagerOperations } from "../src/server-manager.js";
import { DEFAULT_TALK_CONFIG } from "../src/config.js";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("Supertonic Server manager", () => {
  it("lazy-starts Supertonic from uv's shared tool cache and waits for health readiness", async () => {
    const packageRoot = tempDir("pi-talk-package-");
    const modelCacheDir = tempDir("pi-talk-cache-");
    const spawned: Array<{ command: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];
    const healthUrls: string[] = [];
    const ops: ServerManagerOperations = {
      findFreePort: async () => 45678,
      spawn: (command, args, options) => {
        spawned.push({ command, args, env: options.env });
        return { kill: () => true };
      },
      fetch: async (url) => {
        healthUrls.push(url);
        return { ok: true, json: async () => ({ status: "ok", model: "supertonic-3", sample_rate: 44100, version: "1.3.1" }) };
      },
      sleep: async () => undefined,
      now: (() => {
        let time = 0;
        return () => (time += 100);
      })(),
    };

    const manager = createSupertonicServerManager({ packageRoot, modelCacheDir, config: DEFAULT_TALK_CONFIG, ops });

    await expect(manager.ensureReady()).resolves.toEqual({ baseUrl: "http://127.0.0.1:45678" });
    expect(spawned).toEqual([
      {
        command: "uv",
        args: [
          "tool",
          "run",
          "--python",
          "3.12",
          "--from",
          "supertonic[serve]==1.3.1",
          "supertonic",
          "serve",
          "--host",
          "127.0.0.1",
          "--port",
          "45678",
          "--model",
          "supertonic-3",
          "--log-level",
          "info",
        ],
        env: expect.objectContaining({ SUPERTONIC_CACHE_DIR: modelCacheDir }),
      },
    ]);
    expect(healthUrls).toEqual(["http://127.0.0.1:45678/v1/health"]);
  });
});
