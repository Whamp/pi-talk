import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
export const DEFAULT_TALK_CONFIG = {
    autoSpeech: { enabled: false },
    keybindings: {
        talk: "ctrl+shift+s",
        quiet: "ctrl+shift+q",
    },
    playback: {
        command: "auto",
        onOverlap: "interrupt",
    },
    speech: {
        voice: "M1",
        language: "en",
        speed: 1.05,
        quality: 8,
        responseFormat: "wav",
    },
    server: {
        host: "127.0.0.1",
        port: "auto",
        readinessTimeoutMs: 30_000,
    },
    runtime: {
        model: "supertonic-3",
    },
};
export function defaultGlobalConfigPath(home = homedir()) {
    return join(home, ".pi", "agent", "talk.json");
}
export function defaultProjectConfigPath(cwd) {
    return join(cwd, ".pi", "talk.json");
}
export function loadTalkConfig(options = { cwd: process.cwd() }) {
    const home = options.home ?? homedir();
    const paths = [defaultGlobalConfigPath(home), defaultProjectConfigPath(options.cwd)];
    let config = cloneDefaultConfig();
    const sources = [];
    for (const path of paths) {
        if (!existsSync(path)) {
            sources.push({ path, loaded: false });
            continue;
        }
        try {
            const raw = JSON.parse(readFileSync(path, "utf8"));
            if (!isRecord(raw))
                throw new Error("Talk Config must be a JSON object");
            config = normalizeConfig(deepMerge(config, raw));
            sources.push({ path, loaded: true });
        }
        catch (error) {
            sources.push({ path, loaded: false, error: error instanceof Error ? error.message : String(error) });
        }
    }
    const envCacheDir = process.env.PI_TALK_SUPERTONIC_CACHE_DIR;
    if (envCacheDir) {
        config = normalizeConfig(deepMerge(config, { runtime: { modelCacheDir: envCacheDir } }));
    }
    return { config, sources };
}
export function resolveModelCacheDir(config, env = process.env, osPlatform = platform(), home = homedir()) {
    if (env.PI_TALK_SUPERTONIC_CACHE_DIR)
        return resolve(env.PI_TALK_SUPERTONIC_CACHE_DIR);
    if (config.runtime.modelCacheDir)
        return resolve(config.runtime.modelCacheDir.replace(/^~/, home));
    if (osPlatform === "darwin")
        return join(home, "Library", "Caches", "pi-talk", "supertonic");
    if (osPlatform === "win32") {
        const root = env.LOCALAPPDATA || join(env.USERPROFILE || home, ".cache");
        return join(root, "pi-talk", "supertonic");
    }
    const xdg = env.XDG_CACHE_HOME;
    return join(xdg || join(home, ".cache"), "pi-talk", "supertonic");
}
function cloneDefaultConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_TALK_CONFIG));
}
function normalizeConfig(raw) {
    const config = deepMerge(DEFAULT_TALK_CONFIG, raw);
    if (config.playback.onOverlap !== "interrupt" && config.playback.onOverlap !== "queue") {
        throw new Error('playback.onOverlap must be "interrupt" or "queue"');
    }
    if (!Number.isFinite(config.speech.speed) || config.speech.speed <= 0) {
        throw new Error("speech.speed must be a positive number");
    }
    if (!Number.isInteger(config.speech.quality) || config.speech.quality < 5 || config.speech.quality > 12) {
        throw new Error("speech.quality must be an integer between 5 and 12");
    }
    if (config.speech.responseFormat !== "wav" && config.speech.responseFormat !== "flac" && config.speech.responseFormat !== "ogg") {
        throw new Error('speech.responseFormat must be "wav", "flac", or "ogg"');
    }
    if (config.server.port !== "auto" && (!Number.isInteger(config.server.port) || config.server.port <= 0 || config.server.port > 65_535)) {
        throw new Error('server.port must be "auto" or a TCP port number');
    }
    return config;
}
function deepMerge(base, override) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(override)) {
        if (isRecord(value) && isRecord(base[key])) {
            merged[key] = deepMerge(base[key], value);
        }
        else {
            merged[key] = value;
        }
    }
    return merged;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
