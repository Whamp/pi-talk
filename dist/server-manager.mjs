import { spawn as nodeSpawn } from "node:child_process";
import { createServer } from "node:net";
import { supertonicToolArgs } from "./runtime-setup.mjs";
export function createSupertonicServerManager(options) {
    const ops = options.ops ?? nodeServerManagerOperations;
    let child;
    let baseUrl;
    return {
        async ensureReady() {
            if (baseUrl && (await isHealthy(ops, baseUrl)))
                return { baseUrl };
            const port = options.config.server.port === "auto" ? await ops.findFreePort() : options.config.server.port;
            baseUrl = `http://${options.config.server.host}:${port}`;
            if (!child) {
                child = ops.spawn("uv", supertonicToolArgs("serve", "--host", options.config.server.host, "--port", String(port), "--model", options.config.runtime.model, "--log-level", "info"), { env: { ...processEnv(), SUPERTONIC_CACHE_DIR: options.modelCacheDir }, detached: process.platform !== "win32" });
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
async function waitForHealth(ops, baseUrl, timeoutMs) {
    const deadline = ops.now() + timeoutMs;
    let lastError;
    while (ops.now() <= deadline) {
        try {
            if (await isHealthy(ops, baseUrl))
                return;
        }
        catch (error) {
            lastError = error;
        }
        await ops.sleep(100);
    }
    throw new Error(`Supertonic Server did not become ready at ${baseUrl}: ${lastError instanceof Error ? lastError.message : "timeout"}`);
}
async function isHealthy(ops, baseUrl) {
    const response = await ops.fetch(`${baseUrl}/v1/health`);
    if (!response.ok)
        return false;
    const body = await response.json();
    return typeof body === "object" && body !== null && body.status === "ok";
}
export const nodeServerManagerOperations = {
    async findFreePort() {
        return new Promise((resolve, reject) => {
            const server = createServer();
            server.listen(0, "127.0.0.1", () => {
                const address = server.address();
                server.close(() => {
                    if (typeof address === "object" && address)
                        resolve(address.port);
                    else
                        reject(new Error("Could not allocate a free port"));
                });
            });
            server.on("error", reject);
        });
    },
    spawn(command, args, options) {
        return nodeSpawn(command, args, { env: options.env, detached: options.detached, stdio: "ignore" });
    },
    async fetch(url) {
        return fetch(url);
    },
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    },
    now: () => Date.now(),
};
function processEnv() {
    return process.env;
}
