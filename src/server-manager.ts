import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import type { TalkConfig } from "./config.js";
import { venvExecutablePath } from "./runtime-setup.js";

export type ManagedProcess = {
  kill(signal?: NodeJS.Signals): boolean;
};

export type HealthResponse = {
  ok: boolean;
  json(): Promise<unknown>;
};

export type ServerManagerOperations = {
  findFreePort(): Promise<number>;
  spawn(command: string, args: string[], options: { env: NodeJS.ProcessEnv; detached?: boolean }): ManagedProcess;
  fetch(url: string): Promise<HealthResponse>;
  sleep(ms: number): Promise<void>;
  now(): number;
};

export type SupertonicServerManager = {
  ensureReady(): Promise<{ baseUrl: string }>;
  shutdown(): void;
};

export function createSupertonicServerManager(options: {
  packageRoot: string;
  modelCacheDir: string;
  config: TalkConfig;
  ops?: ServerManagerOperations;
}): SupertonicServerManager {
  const ops = options.ops ?? nodeServerManagerOperations;
  let child: ManagedProcess | undefined;
  let baseUrl: string | undefined;

  return {
    async ensureReady() {
      if (baseUrl && (await isHealthy(ops, baseUrl))) return { baseUrl };

      const port = options.config.server.port === "auto" ? await ops.findFreePort() : options.config.server.port;
      baseUrl = `http://${options.config.server.host}:${port}`;
      if (!child) {
        const command = venvExecutablePath(join(options.packageRoot, ".pi-talk-runtime", "venv"), "supertonic");
        child = ops.spawn(
          command,
          [
            "serve",
            "--host",
            options.config.server.host,
            "--port",
            String(port),
            "--model",
            options.config.runtime.model,
            "--log-level",
            "info",
          ],
          { env: { ...processEnv(), SUPERTONIC_CACHE_DIR: options.modelCacheDir }, detached: process.platform !== "win32" },
        );
      }

      await waitForHealth(ops, baseUrl, options.config.server.readinessTimeoutMs);
      return { baseUrl };
    },
    shutdown() {
      child?.kill("SIGTERM");
      child = undefined;
      baseUrl = undefined;
    },
  };
}

async function waitForHealth(ops: ServerManagerOperations, baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = ops.now() + timeoutMs;
  let lastError: unknown;
  while (ops.now() <= deadline) {
    try {
      if (await isHealthy(ops, baseUrl)) return;
    } catch (error) {
      lastError = error;
    }
    await ops.sleep(100);
  }
  throw new Error(`Supertonic Server did not become ready at ${baseUrl}: ${lastError instanceof Error ? lastError.message : "timeout"}`);
}

async function isHealthy(ops: ServerManagerOperations, baseUrl: string): Promise<boolean> {
  const response = await ops.fetch(`${baseUrl}/v1/health`);
  if (!response.ok) return false;
  const body = await response.json();
  return typeof body === "object" && body !== null && (body as { status?: unknown }).status === "ok";
}

export const nodeServerManagerOperations: ServerManagerOperations = {
  async findFreePort() {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        server.close(() => {
          if (typeof address === "object" && address) resolve(address.port);
          else reject(new Error("Could not allocate a free port"));
        });
      });
      server.on("error", reject);
    });
  },
  spawn(command, args, options) {
    return nodeSpawn(command, args, { env: options.env, detached: options.detached, stdio: "ignore" }) as ChildProcess;
  },
  async fetch(url) {
    return fetch(url) as Promise<HealthResponse>;
  },
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
  now: () => Date.now(),
};

function processEnv(): NodeJS.ProcessEnv {
  return process.env;
}
