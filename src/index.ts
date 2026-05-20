import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_TALK_CONFIG, loadTalkConfig, resolveModelCacheDir, type LoadedTalkConfig } from "./config.js";
import { buildDoctorReport } from "./doctor.js";
import { createPlaybackController, type PlaybackController } from "./playback-controller.js";
import { createSupertonicServerManager, type SupertonicServerManager } from "./server-manager.js";
import { findPreviousAssistantMessage, extractSpeakableText, type SessionEntryLike } from "./speech-source.js";
import { detectRuntimeStatus, formatTalkStatus } from "./status.js";
import { synthesizeSpokenResponse } from "./synthesis-client.js";
import { showTalkOverlay, type TalkOverlayOptions } from "./talk-overlay.js";

const defaultPackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type CommandContextLike = {
  cwd: string;
  hasUI?: boolean;
  sessionManager?: { getBranch(): unknown[] };
  ui: {
    notify(message: string, level: "info" | "warning" | "error" | string): void;
    custom?: unknown;
  };
};

type CreatePiTalkExtensionOptions = {
  packageRoot?: string;
  loadConfig?: (cwd: string) => LoadedTalkConfig;
  createServerManager?: (loaded: LoadedTalkConfig) => SupertonicServerManager;
  synthesize?: (options: { baseUrl: string; text: string; config: LoadedTalkConfig["config"] }) => Promise<ArrayBuffer>;
  createPlaybackController?: (loaded: LoadedTalkConfig) => PlaybackController;
  doctor?: (options: { packageRoot: string; loaded: LoadedTalkConfig }) => Promise<string>;
  showOverlay?: (options: TalkOverlayOptions) => Promise<void>;
};

export function createPiTalkExtension(options: CreatePiTalkExtensionOptions = {}) {
  const packageRoot = options.packageRoot ?? defaultPackageRoot;
  let serverManager: SupertonicServerManager | undefined;
  let playbackController: PlaybackController | undefined;
  let autoSpeechEnabled = DEFAULT_TALK_CONFIG.autoSpeech.enabled;

  return function piTalk(pi: ExtensionAPI) {
    const loadConfig = options.loadConfig ?? ((cwd: string) => loadTalkConfig({ cwd }));
    const registrationConfig = loadConfig(process.cwd()).config;

    pi.registerShortcut(registrationConfig.keybindings.talk as never, {
      description: "Speak the previous assistant response with Pi Talk",
      handler: async (ctx) => {
        const commandCtx = ctx as CommandContextLike;
        await speakPreviousResponse(commandCtx, loadConfig(commandCtx.cwd));
      },
    });

    pi.registerShortcut(registrationConfig.keybindings.quiet as never, {
      description: "Interrupt Pi Talk speech",
      handler: async (ctx) => {
        const commandCtx = ctx as CommandContextLike;
        quiet(commandCtx, loadConfig(commandCtx.cwd));
      },
    });

    pi.registerCommand("talk", {
      description: "Open the Pi Talk control panel",
      handler: async (_args, ctx) => {
        const commandCtx = ctx as CommandContextLike;
        const loaded = loadConfig(commandCtx.cwd);
        await openOverlay(commandCtx, loaded);
      },
    });

    pi.registerCommand("speak", {
      description: "Speak the previous assistant response with Pi Talk",
      handler: async (_args, ctx) => {
        const commandCtx = ctx as CommandContextLike;
        await speakPreviousResponse(commandCtx, loadConfig(commandCtx.cwd));
      },
    });

    pi.registerCommand("quiet", {
      description: "Interrupt Pi Talk speech and clear queued playback",
      handler: async (_args, ctx) => {
        const commandCtx = ctx as CommandContextLike;
        quiet(commandCtx, loadConfig(commandCtx.cwd));
      },
    });

    pi.on("message_end", async (event, ctx) => {
      if (!autoSpeechEnabled) return;
      const commandCtx = ctx as CommandContextLike;
      await speakMessage(commandCtx, loadConfig(commandCtx.cwd), (event as { message?: unknown }).message);
    });
  };

  async function openOverlay(ctx: CommandContextLike, loaded: LoadedTalkConfig): Promise<void> {
    const effectiveLoaded = effectiveStatusConfig(loaded);
    const overlayOptions: TalkOverlayOptions = {
      ctx: ctx as never,
      autoSpeechEnabled,
      status: formatTalkStatus(effectiveLoaded, detectRuntimeStatus(packageRoot)),
      doctor: () => (options.doctor ?? buildDoctorReport)({ packageRoot, loaded: effectiveLoaded }),
      speak: () => speakPreviousResponse(ctx, loaded),
      quiet: () => quiet(ctx, loaded),
      setAutoSpeechEnabled: (enabled) => {
        autoSpeechEnabled = enabled;
        ctx.ui.notify(`Pi Talk: Auto Speech Mode ${enabled ? "on" : "off"}.`, "info");
      },
    };

    await (options.showOverlay ?? showTalkOverlay)(overlayOptions);
  }

  async function speakPreviousResponse(ctx: CommandContextLike, loaded: LoadedTalkConfig): Promise<void> {
    const message = findPreviousAssistantMessage((ctx.sessionManager?.getBranch() ?? []) as SessionEntryLike[]);
    await speakMessage(ctx, loaded, message, "previous assistant response");
  }

  async function speakMessage(
    ctx: CommandContextLike,
    loaded: LoadedTalkConfig,
    message: unknown,
    noTextSource = "assistant response",
  ): Promise<void> {
    const text = extractSpeakableText(message as never);
    if (!text) {
      ctx.ui.notify(`Pi Talk: no Speakable Text found in the ${noTextSource}.`, "warning");
      return;
    }

    serverManager ??= (options.createServerManager ?? defaultCreateServerManager)(loaded);
    playbackController ??= (options.createPlaybackController ?? defaultCreatePlaybackController)(loaded);
    const { baseUrl } = await serverManager.ensureReady();
    const audio = await (options.synthesize ?? defaultSynthesize)({ baseUrl, text, config: loaded.config });
    await playbackController.play(audio);
    ctx.ui.notify("Pi Talk: Spoken Response started.", "info");
  }

  function quiet(ctx: CommandContextLike, loaded: LoadedTalkConfig): void {
    playbackController ??= (options.createPlaybackController ?? defaultCreatePlaybackController)(loaded);
    playbackController.quiet();
    ctx.ui.notify("Pi Talk: quiet.", "info");
  }

  function effectiveStatusConfig(loaded: LoadedTalkConfig): LoadedTalkConfig {
    return { ...loaded, config: { ...loaded.config, autoSpeech: { enabled: autoSpeechEnabled } } };
  }

  function defaultCreateServerManager(loaded: LoadedTalkConfig): SupertonicServerManager {
    return createSupertonicServerManager({
      packageRoot,
      modelCacheDir: resolveModelCacheDir(loaded.config),
      config: loaded.config,
    });
  }

  function defaultCreatePlaybackController(loaded: LoadedTalkConfig): PlaybackController {
    return createPlaybackController({ config: loaded.config });
  }

  function defaultSynthesize(options: { baseUrl: string; text: string; config: LoadedTalkConfig["config"] }): Promise<ArrayBuffer> {
    return synthesizeSpokenResponse(options);
  }
}

export default createPiTalkExtension();
