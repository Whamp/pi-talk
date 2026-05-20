import { spawn as nodeSpawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
const execFile = promisify(execFileCallback);
export function createPlaybackController(options) {
    const ops = options.ops ?? nodePlaybackOperations;
    let active;
    const queue = [];
    let quietGeneration = 0;
    return {
        async play(audio) {
            if (options.config.playback.onOverlap === "queue" && active) {
                queue.push(audio);
                return;
            }
            if (options.config.playback.onOverlap === "interrupt") {
                active?.kill("SIGTERM");
                active = undefined;
                queue.length = 0;
            }
            await start(audio, quietGeneration);
        },
        quiet() {
            quietGeneration += 1;
            queue.length = 0;
            active?.kill("SIGTERM");
            active = undefined;
        },
    };
    async function start(audio, generation) {
        const audioPath = await ops.writeTempAudio(audio);
        if (generation !== quietGeneration)
            return;
        const command = await resolvePlaybackCommand(options.config.playback.command, ops);
        if (generation !== quietGeneration)
            return;
        const args = playbackArgs(command, audioPath);
        active = ops.spawn(command, args);
        void active.done.finally(() => {
            if (generation !== quietGeneration)
                return;
            active = undefined;
            const next = queue.shift();
            if (next)
                void start(next, generation);
        });
    }
}
export async function resolvePlaybackCommand(configured, ops) {
    if (configured !== "auto")
        return configured;
    const candidates = ops.platform() === "darwin" ? ["afplay", "ffplay", "mpv"] : ["pw-play", "paplay", "aplay", "ffplay", "mpv"];
    for (const candidate of candidates) {
        if (await ops.commandExists(candidate))
            return candidate;
    }
    throw new Error(`No Playback Command found. Tried: ${candidates.join(", ")}`);
}
function playbackArgs(command, audioPath) {
    if (command === "ffplay")
        return ["-nodisp", "-autoexit", "-loglevel", "error", audioPath];
    if (command === "mpv")
        return ["--no-video", "--really-quiet", audioPath];
    return [audioPath];
}
export const nodePlaybackOperations = {
    platform: () => process.platform,
    async commandExists(command) {
        try {
            await execFile(process.platform === "win32" ? "where" : "/bin/sh", process.platform === "win32" ? [command] : ["-lc", `command -v '${command.replaceAll("'", "'\\''")}'`]);
            return true;
        }
        catch {
            return false;
        }
    },
    async writeTempAudio(audio) {
        const dir = await mkdtemp(join(tmpdir(), "pi-talk-"));
        const path = join(dir, "spoken-response.wav");
        await writeFile(path, Buffer.from(audio));
        return path;
    },
    spawn(command, args) {
        const child = nodeSpawn(command, args, { stdio: "ignore" });
        return {
            kill: (signal) => child.kill(signal),
            done: new Promise((resolve) => child.once("exit", resolve)),
        };
    },
};
