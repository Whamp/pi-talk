import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LoadedTalkConfig } from "./config.js";

export type RuntimeStatus = "installed" | "not installed";

export function detectRuntimeStatus(packageRoot: string): RuntimeStatus {
  return existsSync(join(packageRoot, ".pi-talk-runtime", "runtime-manifest.json")) ? "installed" : "not installed";
}

export function formatTalkStatus(loaded: LoadedTalkConfig, runtimeStatus: RuntimeStatus): string {
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
