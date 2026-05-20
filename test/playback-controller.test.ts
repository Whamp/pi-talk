import { describe, expect, it } from "vitest";
import { createPlaybackController, type PlaybackOperations } from "../src/playback-controller.js";
import { DEFAULT_TALK_CONFIG } from "../src/config.js";

describe("Playback controller", () => {
  it("auto-selects pw-play on Linux and interrupts active playback by default", async () => {
    const killed: string[] = [];
    const spawned: Array<{ command: string; args: string[] }> = [];
    const written: ArrayBuffer[] = [];
    let resolveFirst!: () => void;
    const ops: PlaybackOperations = {
      platform: () => "linux",
      commandExists: async (command) => command === "pw-play",
      writeTempAudio: async (audio) => {
        written.push(audio);
        return `/tmp/audio-${written.length}.wav`;
      },
      spawn: (command, args) => {
        spawned.push({ command, args });
        const id = `${command} ${args.join(" ")}`;
        return {
          kill: () => killed.push(id),
          done:
            spawned.length === 1
              ? new Promise<void>((resolve) => {
                  resolveFirst = resolve;
                })
              : Promise.resolve(),
        };
      },
    };

    const controller = createPlaybackController({ config: DEFAULT_TALK_CONFIG, ops });

    await controller.play(new Uint8Array([1]).buffer);
    await controller.play(new Uint8Array([2]).buffer);

    expect(spawned).toEqual([
      { command: "pw-play", args: ["/tmp/audio-1.wav"] },
      { command: "pw-play", args: ["/tmp/audio-2.wav"] },
    ]);
    expect(killed).toEqual(["pw-play /tmp/audio-1.wav"]);
    resolveFirst();
  });

  it("queues playback when configured and quiet clears active and pending speech", async () => {
    let resolveFirst!: () => void;
    const killed: string[] = [];
    const spawned: Array<{ command: string; args: string[] }> = [];
    const ops: PlaybackOperations = {
      platform: () => "linux",
      commandExists: async (command) => command === "pw-play",
      writeTempAudio: async (_audio) => `/tmp/audio-${spawned.length + 1}.wav`,
      spawn: (command, args) => {
        spawned.push({ command, args });
        const id = `${command} ${args.join(" ")}`;
        return {
          kill: () => killed.push(id),
          done:
            spawned.length === 1
              ? new Promise<void>((resolve) => {
                  resolveFirst = resolve;
                })
              : Promise.resolve(),
        };
      },
    };
    const controller = createPlaybackController({
      config: { ...DEFAULT_TALK_CONFIG, playback: { ...DEFAULT_TALK_CONFIG.playback, onOverlap: "queue" } },
      ops,
    });

    await controller.play(new Uint8Array([1]).buffer);
    await controller.play(new Uint8Array([2]).buffer);
    expect(spawned).toEqual([{ command: "pw-play", args: ["/tmp/audio-1.wav"] }]);

    controller.quiet();
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();

    expect(killed).toEqual(["pw-play /tmp/audio-1.wav"]);
    expect(spawned).toEqual([{ command: "pw-play", args: ["/tmp/audio-1.wav"] }]);
  });
});
