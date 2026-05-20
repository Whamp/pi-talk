import { existsSync } from "node:fs";
import { join } from "node:path";
export function detectRuntimeStatus(packageRoot) {
    return existsSync(join(packageRoot, ".pi-talk-runtime", "runtime-manifest.json")) ? "installed" : "not installed";
}
export function formatTalkStatus(loaded, runtimeStatus) {
    const { config } = loaded;
    return [
        "Pi Talk status",
        `Auto Speech Mode: ${config.autoSpeech.enabled ? "on" : "off"}`,
        `Talk Keybinding: ${config.keybindings.talk}`,
        `Quiet Control: ${config.keybindings.quiet}`,
        `Playback overlap: ${config.playback.onOverlap}`,
        `Playback command: ${config.playback.command}`,
        `Voice: ${config.speech.voice}`,
        `Language: ${config.speech.language}`,
        `Runtime: ${runtimeStatus}`,
    ].join("\n");
}
