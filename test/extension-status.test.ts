import { describe, expect, it } from "vitest";
import { createPiTalkExtension } from "../src/index.js";

type RegisteredCommand = {
  description?: string;
  handler: (args: string, ctx: FakeCommandContext) => Promise<void> | void;
};

type RegisteredShortcut = {
  description?: string;
  handler: (ctx: FakeCommandContext) => Promise<void> | void;
};

type FakeCommandContext = {
  cwd: string;
  sessionManager?: { getBranch(): unknown[] };
  ui: {
    notifications: Array<{ message: string; level: string }>;
    notify(message: string, level: string): void;
  };
};

function createFakePi() {
  const commands = new Map<string, RegisteredCommand>();
  const shortcuts = new Map<string, RegisteredShortcut>();
  const events = new Map<string, Array<(event: any, ctx: FakeCommandContext) => Promise<void> | void>>();
  return {
    commands,
    shortcuts,
    events,
    pi: {
      registerCommand(name: string, command: RegisteredCommand) {
        commands.set(name, command);
      },
      registerShortcut(key: string, shortcut: RegisteredShortcut) {
        shortcuts.set(key, shortcut);
      },
      on(name: string, handler: (event: any, ctx: FakeCommandContext) => Promise<void> | void) {
        events.set(name, [...(events.get(name) ?? []), handler]);
      },
    },
  };
}

function createFakeContext(cwd = process.cwd(), branch: unknown[] = []): FakeCommandContext {
  const notifications: Array<{ message: string; level: string }> = [];
  return {
    cwd,
    sessionManager: { getBranch: () => branch },
    ui: {
      notifications,
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };
}

describe("Pi Talk extension status", () => {
  it("registers /talk status with default Talk Config", async () => {
    const fake = createFakePi();

    createPiTalkExtension({ packageRoot: "/tmp/pi-talk-test-no-runtime" })(fake.pi as never);

    const talk = fake.commands.get("talk");
    expect(talk).toBeDefined();

    const ctx = createFakeContext();
    await talk!.handler("status", ctx);

    expect(ctx.ui.notifications).toEqual([
      {
        level: "info",
        message: [
          "Pi Talk status",
          "Auto Speech Mode: off",
          "Talk Keybinding: ctrl+shift+s",
          "Quiet Control: ctrl+shift+q",
          "Playback overlap: interrupt",
          "Playback command: auto",
          "Voice: M1",
          "Language: en",
          "Runtime: not installed",
        ].join("\n"),
      },
    ]);
  });

  it("/talk notifies when the previous assistant response has no Speakable Text", async () => {
    const fake = createFakePi();
    createPiTalkExtension({ packageRoot: "/pkg" })(fake.pi as never);
    const ctx = createFakeContext("/project", [
      { type: "message", message: { role: "assistant", content: [{ type: "thinking", text: "hidden" }] } },
    ]);

    await fake.commands.get("talk")!.handler("", ctx);

    expect(ctx.ui.notifications).toEqual([
      { level: "warning", message: "Pi Talk: no Speakable Text found in the previous assistant response." },
    ]);
  });

  it("/talk speaks the previous assistant response through Supertonic and playback", async () => {
    const fake = createFakePi();
    const played: ArrayBuffer[] = [];
    const synthesized: string[] = [];
    const audio = new Uint8Array([1, 2, 3]).buffer;

    createPiTalkExtension({
      packageRoot: "/pkg",
      createServerManager: () => ({
        ensureReady: async () => ({ baseUrl: "http://127.0.0.1:45678" }),
        shutdown: () => undefined,
      }),
      synthesize: async ({ text }) => {
        synthesized.push(text);
        return audio;
      },
      createPlaybackController: () => ({
        play: async (buffer) => {
          played.push(buffer);
        },
        quiet: () => undefined,
      }),
    })(fake.pi as never);

    const ctx = createFakeContext("/project", [
      { type: "message", message: { role: "user", content: [{ type: "text", text: "question" }] } },
      { type: "message", message: { role: "assistant", content: [{ type: "text", text: "spoken text" }] } },
    ]);

    await fake.commands.get("talk")!.handler("", ctx);

    expect(synthesized).toEqual(["spoken text"]);
    expect(played).toEqual([audio]);
    expect(ctx.ui.notifications).toEqual([{ level: "info", message: "Pi Talk: Spoken Response started." }]);
  });

  it("registers configured Talk and Quiet keybindings", () => {
    const fake = createFakePi();
    createPiTalkExtension({
      packageRoot: "/pkg",
      loadConfig: () => ({
        config: {
          ...structuredClone({
            autoSpeech: { enabled: false },
            keybindings: { talk: "ctrl+shift+x", quiet: "ctrl+shift+y" },
            playback: { command: "auto", onOverlap: "interrupt" as const },
            speech: { voice: "M1", language: "en", speed: 1.05, quality: 8, responseFormat: "wav" as const },
            server: { host: "127.0.0.1", port: "auto" as const, readinessTimeoutMs: 30000 },
            runtime: { model: "supertonic-3" as const },
          }),
        },
        sources: [],
      }),
    })(fake.pi as never);

    expect([...fake.shortcuts.keys()].sort()).toEqual(["ctrl+shift+x", "ctrl+shift+y"]);
  });

  it("registers Talk and Quiet keybindings and /quiet interrupts playback", async () => {
    const fake = createFakePi();
    let quietCount = 0;

    createPiTalkExtension({
      packageRoot: "/pkg",
      createServerManager: () => ({ ensureReady: async () => ({ baseUrl: "http://127.0.0.1:45678" }), shutdown: () => undefined }),
      synthesize: async () => new Uint8Array([1]).buffer,
      createPlaybackController: () => ({
        play: async () => undefined,
        quiet: () => {
          quietCount += 1;
        },
      }),
    })(fake.pi as never);

    expect([...fake.shortcuts.keys()].sort()).toEqual(["ctrl+shift+q", "ctrl+shift+s"]);

    const ctx = createFakeContext("/project", [
      { type: "message", message: { role: "assistant", content: [{ type: "text", text: "spoken" }] } },
    ]);
    await fake.shortcuts.get("ctrl+shift+s")!.handler(ctx);
    await fake.commands.get("quiet")!.handler("", ctx);
    await fake.shortcuts.get("ctrl+shift+q")!.handler(ctx);

    expect(quietCount).toBe(2);
    expect(ctx.ui.notifications.at(-1)).toEqual({ level: "info", message: "Pi Talk: quiet." });
  });

  it("/talk on speaks future assistant messages until /talk off", async () => {
    const fake = createFakePi();
    const synthesized: string[] = [];
    let playCount = 0;

    createPiTalkExtension({
      packageRoot: "/pkg",
      createServerManager: () => ({ ensureReady: async () => ({ baseUrl: "http://127.0.0.1:45678" }), shutdown: () => undefined }),
      synthesize: async ({ text }) => {
        synthesized.push(text);
        return new Uint8Array([1]).buffer;
      },
      createPlaybackController: () => ({
        play: async () => {
          playCount += 1;
        },
        quiet: () => undefined,
      }),
    })(fake.pi as never);

    const ctx = createFakeContext("/project");
    await fake.commands.get("talk")!.handler("on", ctx);
    for (const handler of fake.events.get("message_end") ?? []) {
      await handler({ message: { role: "assistant", content: [{ type: "text", text: "automatic speech" }] } }, ctx);
    }
    await fake.commands.get("talk")!.handler("off", ctx);
    for (const handler of fake.events.get("message_end") ?? []) {
      await handler({ message: { role: "assistant", content: [{ type: "text", text: "should not speak" }] } }, ctx);
    }

    expect(synthesized).toEqual(["automatic speech"]);
    expect(playCount).toBe(1);
    expect(ctx.ui.notifications).toContainEqual({ level: "info", message: "Pi Talk: Auto Speech Mode on." });
    expect(ctx.ui.notifications).toContainEqual({ level: "info", message: "Pi Talk: Auto Speech Mode off." });
  });

  it("/talk doctor reports user-facing diagnostics", async () => {
    const fake = createFakePi();
    createPiTalkExtension({
      packageRoot: "/pkg",
      doctor: async () => [
        "Pi Talk doctor",
        "Talk Config: ok",
        "uv: available",
        "Runtime Manifest: missing",
        "Model Cache: /cache",
        "Supertonic Server: not running",
        "Playback Command: pw-play",
      ].join("\n"),
    })(fake.pi as never);

    const ctx = createFakeContext("/project");
    await fake.commands.get("talk")!.handler("doctor", ctx);

    expect(ctx.ui.notifications).toEqual([
      {
        level: "info",
        message: [
          "Pi Talk doctor",
          "Talk Config: ok",
          "uv: available",
          "Runtime Manifest: missing",
          "Model Cache: /cache",
          "Supertonic Server: not running",
          "Playback Command: pw-play",
        ].join("\n"),
      },
    ]);
  });
});
