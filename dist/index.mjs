import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_TALK_CONFIG, loadTalkConfig, resolveModelCacheDir } from "./config.mjs";
import { buildDoctorReport } from "./doctor.mjs";
import { createPlaybackController } from "./playback-controller.mjs";
import { createSupertonicServerManager } from "./server-manager.mjs";
import { findPreviousAssistantMessage, extractSpeakableText } from "./speech-source.mjs";
import { detectRuntimeStatus, formatTalkStatus } from "./status.mjs";
import { synthesizeSpokenResponse } from "./synthesis-client.mjs";
import { showTalkOverlay } from "./talk-overlay.mjs";
const defaultPackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function createPiTalkExtension(options = {}) {
    const packageRoot = options.packageRoot ?? defaultPackageRoot;
    let serverManager;
    let playbackController;
    let autoSpeechEnabled = DEFAULT_TALK_CONFIG.autoSpeech.enabled;
    return function piTalk(pi) {
        const loadConfig = options.loadConfig ?? ((cwd) => loadTalkConfig({ cwd }));
        const registrationConfig = loadConfig(process.cwd()).config;
        pi.registerShortcut(registrationConfig.keybindings.talk, {
            description: "Speak the previous assistant response with Pi Talk",
            handler: async (ctx) => {
                const commandCtx = ctx;
                await speakPreviousResponse(commandCtx, loadConfig(commandCtx.cwd));
            },
        });
        pi.registerShortcut(registrationConfig.keybindings.quiet, {
            description: "Interrupt Pi Talk speech",
            handler: async (ctx) => {
                const commandCtx = ctx;
                quiet(commandCtx, loadConfig(commandCtx.cwd));
            },
        });
        pi.registerCommand("talk", {
            description: "Open the Pi Talk control panel",
            handler: async (_args, ctx) => {
                const commandCtx = ctx;
                const loaded = loadConfig(commandCtx.cwd);
                await openOverlay(commandCtx, loaded);
            },
        });
        pi.registerCommand("speak", {
            description: "Speak the previous assistant response with Pi Talk",
            handler: async (_args, ctx) => {
                const commandCtx = ctx;
                await speakPreviousResponse(commandCtx, loadConfig(commandCtx.cwd));
            },
        });
        pi.registerCommand("quiet", {
            description: "Interrupt Pi Talk speech and clear queued playback",
            handler: async (_args, ctx) => {
                const commandCtx = ctx;
                quiet(commandCtx, loadConfig(commandCtx.cwd));
            },
        });
        pi.on("message_end", async (event, ctx) => {
            if (!autoSpeechEnabled)
                return;
            const commandCtx = ctx;
            await speakMessage(commandCtx, loadConfig(commandCtx.cwd), event.message);
        });
    };
    async function openOverlay(ctx, loaded) {
        const effectiveLoaded = effectiveStatusConfig(loaded);
        const overlayOptions = {
            ctx: ctx,
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
    async function speakPreviousResponse(ctx, loaded) {
        const message = findPreviousAssistantMessage((ctx.sessionManager?.getBranch() ?? []));
        await speakMessage(ctx, loaded, message, "previous assistant response");
    }
    async function speakMessage(ctx, loaded, message, noTextSource = "assistant response") {
        const text = extractSpeakableText(message);
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
    function quiet(ctx, loaded) {
        playbackController ??= (options.createPlaybackController ?? defaultCreatePlaybackController)(loaded);
        playbackController.quiet();
        ctx.ui.notify("Pi Talk: quiet.", "info");
    }
    function effectiveStatusConfig(loaded) {
        return { ...loaded, config: { ...loaded.config, autoSpeech: { enabled: autoSpeechEnabled } } };
    }
    function defaultCreateServerManager(loaded) {
        return createSupertonicServerManager({
            packageRoot,
            modelCacheDir: resolveModelCacheDir(loaded.config),
            config: loaded.config,
        });
    }
    function defaultCreatePlaybackController(loaded) {
        return createPlaybackController({ config: loaded.config });
    }
    function defaultSynthesize(options) {
        return synthesizeSpokenResponse(options);
    }
}
export default createPiTalkExtension();
