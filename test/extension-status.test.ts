import { describe, expect, it } from "vitest";
import { DEFAULT_TALK_CONFIG, type LoadedTalkConfig } from "../src/config.js";
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
    customCalls: number;
    notify(message: string, level: string): void;
    custom<T>(factory: unknown, options?: unknown): Promise<T | undefined>;
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
      customCalls: 0,
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      async custom() {
        this.customCalls += 1;
        return undefined;
      },
    },
  };
}

function loadedConfig(config = DEFAULT_TALK_CONFIG): LoadedTalkConfig {
  return { config, sources: [] };
}

describe("Pi Talk extension commands", () => {
  it("registers only /talk, /speak, and /quiet commands", () => {
    const fake = createFakePi();

    createPiTalkExtension({ packageRoot: "/pkg" })(fake.pi as never);

    expect([...fake.commands.keys()].sort()).toEqual(["quiet", "speak", "talk"]);
  });

  it("/talk opens the overlay instead of executing subcommands", async () => {
    const fake = createFakePi();
    const overlayArgs: Array<{ autoSpeechEnabled: boolean; status: string; doctor: string }> = [];

    createPiTalkExtension({
      packageRoot: "/tmp/pi-talk-test-no-runtime",
      doctor: async () => "doctor report",
      showOverlay: async ({ autoSpeechEnabled, status, doctor }) => {
        overlayArgs.push({ autoSpeechEnabled, status, doctor: await doctor() });
      },
    })(fake.pi as never);

    const ctx = createFakeContext();
    await fake.commands.get("talk")!.handler("status", ctx);

    expect(overlayArgs).toEqual([
      {
        autoSpeechEnabled: false,
        status: [
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
        doctor: "doctor report",
      },
    ]);
    expect(ctx.ui.notifications).toEqual([]);
  });

  it("/speak notifies when the previous assistant response has no Speakable Text", async () => {
    const fake = createFakePi();
    createPiTalkExtension({ packageRoot: "/pkg" })(fake.pi as never);
    const ctx = createFakeContext("/project", [
      { type: "message", message: { role: "assistant", content: [{ type: "thinking", text: "hidden" }] } },
    ]);

    await fake.commands.get("speak")!.handler("", ctx);

    expect(ctx.ui.notifications).toEqual([
      { level: "warning", message: "Pi Talk: no Speakable Text found in the previous assistant response." },
    ]);
  });

  it("/speak speaks the previous assistant response through Supertonic and playback", async () => {
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

    await fake.commands.get("speak")!.handler("", ctx);

    expect(synthesized).toEqual(["spoken text"]);
    expect(played).toEqual([audio]);
    expect(ctx.ui.notifications).toEqual([{ level: "info", message: "Pi Talk: Spoken Response started." }]);
  });

  it("registers configured Talk and Quiet keybindings", () => {
    const fake = createFakePi();
    createPiTalkExtension({
      packageRoot: "/pkg",
      loadConfig: () =>
        loadedConfig({
          ...DEFAULT_TALK_CONFIG,
          keybindings: { talk: "ctrl+shift+x", quiet: "ctrl+shift+y" },
        }),
    })(fake.pi as never);

    expect([...fake.shortcuts.keys()].sort()).toEqual(["ctrl+shift+x", "ctrl+shift+y"]);
  });

  it("Talk and Quiet keybindings mirror /speak and /quiet", async () => {
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

  it("the overlay can toggle Auto Speech Mode for future assistant messages", async () => {
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
      showOverlay: async ({ setAutoSpeechEnabled }) => {
        setAutoSpeechEnabled(true);
      },
    })(fake.pi as never);

    const ctx = createFakeContext("/project");
    await fake.commands.get("talk")!.handler("", ctx);
    for (const handler of fake.events.get("message_end") ?? []) {
      await handler({ message: { role: "assistant", content: [{ type: "text", text: "automatic speech" }] } }, ctx);
    }

    expect(synthesized).toEqual(["automatic speech"]);
    expect(playCount).toBe(1);
  });
});
