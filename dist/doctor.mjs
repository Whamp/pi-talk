import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveModelCacheDir } from "./config.mjs";
import { nodeRuntimeSetupOperations } from "./runtime-setup.mjs";
import { nodePlaybackOperations, resolvePlaybackCommand } from "./playback-controller.mjs";
export async function buildDoctorReport(options) {
    const cacheDir = resolveModelCacheDir(options.loaded.config);
    const manifestPath = join(options.packageRoot, ".pi-talk-runtime", "runtime-manifest.json");
    const uvAvailable = await nodeRuntimeSetupOperations.commandExists("uv");
    let playback = "unavailable";
    try {
        playback = await resolvePlaybackCommand(options.loaded.config.playback.command, nodePlaybackOperations);
    }
    catch (error) {
        playback = error instanceof Error ? error.message : String(error);
    }
    return [
        "Pi Talk doctor",
        `Talk Config: ${options.loaded.sources.some((source) => source.error) ? "has errors" : "ok"}`,
        `uv: ${uvAvailable ? "available" : "missing"}`,
        `Runtime Manifest: ${existsSync(manifestPath) ? manifestPath : "missing"}`,
        `Model Cache: ${cacheDir}`,
        "Supertonic Server: not checked",
        `Playback Command: ${playback}`,
    ].join("\n");
}
