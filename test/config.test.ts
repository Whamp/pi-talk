import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TALK_CONFIG, loadTalkConfig, resolveModelCacheDir } from "../src/config.js";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("Talk Config", () => {
  it("merges defaults, global config, and project config in order", () => {
    const home = tempDir("pi-talk-home-");
    const cwd = tempDir("pi-talk-project-");
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    mkdirSync(join(cwd, ".pi"), { recursive: true });

    writeFileSync(
      join(home, ".pi", "agent", "talk.json"),
      JSON.stringify({
        autoSpeech: { enabled: true },
        speech: { voice: "F1", speed: 1.2 },
        playback: { command: "paplay" },
      }),
    );
    writeFileSync(
      join(cwd, ".pi", "talk.json"),
      JSON.stringify({
        speech: { voice: "M2" },
        playback: { onOverlap: "queue" },
      }),
    );

    const loaded = loadTalkConfig({ cwd, home });

    expect(loaded.config.autoSpeech.enabled).toBe(true);
    expect(loaded.config.speech.voice).toBe("M2");
    expect(loaded.config.speech.speed).toBe(1.2);
    expect(loaded.config.speech.language).toBe("en");
    expect(loaded.config.playback.command).toBe("paplay");
    expect(loaded.config.playback.onOverlap).toBe("queue");
    expect(loaded.sources).toEqual([
      { path: join(home, ".pi", "agent", "talk.json"), loaded: true },
      { path: join(cwd, ".pi", "talk.json"), loaded: true },
    ]);
  });

  it("resolves Model Cache from env, config, and OS-native defaults", () => {
    expect(
      resolveModelCacheDir(
        DEFAULT_TALK_CONFIG,
        { PI_TALK_SUPERTONIC_CACHE_DIR: "/models/from-env" },
        "linux",
        "/home/will",
      ),
    ).toBe("/models/from-env");

    expect(
      resolveModelCacheDir(
        { ...DEFAULT_TALK_CONFIG, runtime: { ...DEFAULT_TALK_CONFIG.runtime, modelCacheDir: "~/models/from-config" } },
        {},
        "linux",
        "/home/will",
      ),
    ).toBe("/home/will/models/from-config");

    expect(resolveModelCacheDir(DEFAULT_TALK_CONFIG, { XDG_CACHE_HOME: "/xdg-cache" }, "linux", "/home/will")).toBe(
      "/xdg-cache/pi-talk/supertonic",
    );
    expect(resolveModelCacheDir(DEFAULT_TALK_CONFIG, {}, "linux", "/home/will")).toBe(
      "/home/will/.cache/pi-talk/supertonic",
    );
    expect(resolveModelCacheDir(DEFAULT_TALK_CONFIG, {}, "darwin", "/Users/will")).toBe(
      "/Users/will/Library/Caches/pi-talk/supertonic",
    );
    expect(
      resolveModelCacheDir(DEFAULT_TALK_CONFIG, { LOCALAPPDATA: "C:\\Users\\Will\\AppData\\Local" }, "win32", "C:\\Users\\Will"),
    ).toContain("pi-talk");
  });
});
