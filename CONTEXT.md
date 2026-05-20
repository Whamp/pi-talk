# Pi Talk Extension

A Pi extension that turns assistant responses into local speech using Supertonic.

## Language

**Spoken Response**:
An audio rendering of an assistant response.
_Avoid_: narration, read-aloud, TTS output

**Supertonic Server**:
The local HTTP service that synthesizes speech from text.
_Avoid_: TTS process, speech daemon, audio backend

**Lazy Autostart**:
Starting the **Supertonic Server** only when a **Spoken Response** is requested and no server is already ready.
_Avoid_: startup autoload, manual-only startup

**Manual Speech Trigger**:
A user action that requests one **Spoken Response** for the previous assistant response.
_Avoid_: speak shortcut, read command

**Auto Speech Mode**:
A setting that requests a **Spoken Response** after every future assistant response.
_Avoid_: always-on TTS, narration mode

**Talk Command**:
The `/talk` slash command that controls speech behavior.
_Avoid_: speech command, audio command

**Talk Keybinding**:
The keyboard shortcut that invokes the **Manual Speech Trigger**.
_Avoid_: hotkey, shortcut

**Speakable Text**:
The visible text blocks in an assistant response that can be rendered as a **Spoken Response**.
_Avoid_: response content, transcript text

**Interrupt Playback**:
Stopping the current **Spoken Response** so a newer requested **Spoken Response** can play immediately.
_Avoid_: cancel audio, kill speech

**Queued Playback**:
Waiting for the current **Spoken Response** to finish before playing the next requested **Spoken Response**.
_Avoid_: playlist, backlog

**Quiet Control**:
A user action that interrupts active speech and clears pending **Queued Playback** without changing **Auto Speech Mode**.
_Avoid_: stop command, mute mode, talk off

**Talk Config**:
A JSON configuration file that controls server, speech, playback, keybinding, and automatic speech settings.
_Avoid_: settings file, speech config

**Playback Command**:
The local command used to play synthesized audio.
_Avoid_: audio player, media player

**Complete Package Setup**:
Installing Pi Talk in a way that provides the runtime pieces needed for speech without requiring separate manual Supertonic installation.
_Avoid_: detect-only setup, manual prerequisite setup

**Setup Requirement**:
A tool that must already exist before **Complete Package Setup** can finish.
_Avoid_: optional dependency, soft prerequisite

**Pi Talk Runtime**:
The uv-managed Supertonic Python execution path used by Pi Talk to run the **Supertonic Server** without installing Supertonic globally or storing a large venv inside the installed Pi Talk package.
_Avoid_: user Python environment, global Supertonic install, package-local venv

**Python Server Engine**:
The v1 speech engine that runs Supertonic through a package-managed Python HTTP server.
_Avoid_: Node-native engine, embedded ONNX engine

**Model Cache**:
The stable per-user cache directory where Supertonic model assets are stored.
_Avoid_: package cache, runtime directory, Hugging Face cache

**Runtime Manifest**:
A small package-local record of the **Pi Talk Runtime** command strategy, pinned versions, model, cache directory, and setup timestamp.
_Avoid_: lock file, install log

**Synthesis Endpoint**:
The Supertonic HTTP endpoint Pi Talk calls to create speech audio.
_Avoid_: OpenAI-compatible endpoint, speech API

## Relationships

- A **Spoken Response** is generated from exactly one assistant response.
- A **Spoken Response** contains only **Speakable Text**.
- **Interrupt Playback** is the default when a new **Spoken Response** is requested while another is playing.
- **Queued Playback** is an optional user-configured alternative to **Interrupt Playback**.
- **Quiet Control** interrupts active speech and clears pending **Queued Playback** but does not disable **Auto Speech Mode**.
- **Talk Config** can be global or project-local; project-local settings override global settings.
- The default **Playback Command** is automatic selection, preferring PipeWire-native playback when available.
- **Complete Package Setup** verifies the **Pi Talk Runtime** command path during package setup and downloads model assets into the **Model Cache**.
- `uv` is a **Setup Requirement** for **Complete Package Setup**.
- The **Pi Talk Runtime** is separate from the user's global Python environment.
- The **Pi Talk Runtime** is resolved through uv's shared tool/cache storage during package setup or repair.
- The **Runtime Manifest** describes the current **Pi Talk Runtime** for diagnostics.
- The **Python Server Engine** uses the **Pi Talk Runtime** to run the **Supertonic Server**.
- The **Synthesis Endpoint** is Supertonic's native `POST /v1/tts` endpoint.
- The **Model Cache** survives package updates and follows OS-native cache conventions.
- A **Spoken Response** is synthesized by the **Supertonic Server**.
- **Lazy Autostart** happens before synthesis when the **Supertonic Server** is unavailable.
- The **Talk Keybinding** invokes the **Manual Speech Trigger**.
- The **Talk Command** can invoke the **Manual Speech Trigger** or control **Auto Speech Mode**.

## Example dialogue

> **Dev:** "Should Pi start the **Supertonic Server** every time it launches?"
> **Domain expert:** "No — use **Lazy Autostart** so the first requested **Spoken Response** starts it when needed."
>
> **Dev:** "How does a user request speech?"
> **Domain expert:** "Use the **Talk Keybinding** for one response, or the **Talk Command** to turn **Auto Speech Mode** on and off."
>
> **Dev:** "Should a **Spoken Response** include reasoning or tool output?"
> **Domain expert:** "No — only **Speakable Text** from the assistant response should be spoken."
>
> **Dev:** "What if the user requests another **Spoken Response** while one is already playing?"
> **Domain expert:** "Use **Interrupt Playback** by default, but let users choose **Queued Playback** in config."
>
> **Dev:** "Should **Quiet Control** turn off future automatic speech?"
> **Domain expert:** "No — it interrupts active speech and clears pending **Queued Playback**. Use `/talk off` to disable **Auto Speech Mode**."
>
> **Dev:** "Can **Talk Config** use YAML or TOML?"
> **Domain expert:** "No — use JSON in v1 to keep the extension dependency-free."
>
> **Dev:** "Which **Playback Command** should Linux use by default?"
> **Domain expert:** "Use automatic selection: prefer `pw-play`, then fall back to `paplay`, `aplay`, `ffplay`, and `mpv`."
>
> **Dev:** "Should users manually install Supertonic after installing Pi Talk?"
> **Domain expert:** "No — **Complete Package Setup** should provide a uv-managed **Pi Talk Runtime** without a global Supertonic install."
>
> **Dev:** "Should v1 embed Supertonic directly in TypeScript?"
> **Domain expert:** "No — v1 uses the **Python Server Engine** because it is the supported, lower-risk Supertonic integration."
>
> **Dev:** "Where do the downloaded model files go?"
> **Domain expert:** "Use the per-user **Model Cache**, with OS-native defaults and env/config overrides."
>
> **Dev:** "Can model download be skipped during package setup?"
> **Domain expert:** "No — v1 downloads the model during **Complete Package Setup** so installation leaves Pi Talk ready to speak."
>
> **Dev:** "What happens if `uv` is missing?"
> **Domain expert:** "**Complete Package Setup** fails with clear installation instructions because `uv` is a **Setup Requirement**."
>
> **Dev:** "Which runtime versions does v1 install?"
> **Domain expert:** "Use Python 3.12 and `supertonic[serve]==1.3.1`, then write a **Runtime Manifest**."
>
> **Dev:** "Should Pi Talk call the OpenAI-compatible speech endpoint?"
> **Domain expert:** "No — call the native **Synthesis Endpoint** because Pi Talk is integrating directly with Supertonic."

## Flagged ambiguities

- "autostart" could mean starting the server at Pi launch or starting it on first speech request — resolved: use **Lazy Autostart** for first speech request, not Pi startup.
- "trigger" could mean a keybinding, slash command, or always-on behavior — resolved: the **Talk Keybinding** and `/talk` both provide a **Manual Speech Trigger**; `/talk on` and `/talk off` control **Auto Speech Mode**.
- `ctrl+shift+s` was checked against active Omarchy/Hyprland, terminal, and Pi keybinding config; no conflict was found, so it is the default **Talk Keybinding**.
- "previous assistant response" could include visible text, thinking, tool calls, or tool results — resolved: **Spoken Response** uses **Speakable Text** only.
- "overlap" could mean interrupt, queue, or ignore new requests — resolved: default to **Interrupt Playback**, with v1 config support for **Queued Playback**.
- "quiet" could mean interrupt current speech, clear queued speech, or disable automatic speech — resolved: **Quiet Control** interrupts active speech and clears pending **Queued Playback**; `/talk off` disables **Auto Speech Mode**.
- "config" could mean JSON, YAML, TOML, or JSONC — resolved: **Talk Config** is JSON for v1 to avoid runtime dependencies.
- "audio playback" could use several installed commands — resolved: automatic **Playback Command** selection prefers `pw-play` after local testing confirmed `pw-play`, `paplay`, `aplay`, `ffplay`, and `mpv` all work on this machine.
- "setup" could mean detect-only guidance or fully provisioning dependencies — resolved: Pi Talk should use **Complete Package Setup**, not detect-only manual setup.
- "engine" could mean a TypeScript-native ONNX integration or the Python SDK server — resolved: v1 uses the **Python Server Engine**.
- "model cache" could live in the package, Pi config tree, Supertonic defaults, Hugging Face cache, or an OS-native user cache — resolved: use a **Model Cache** with `PI_TALK_SUPERTONIC_CACHE_DIR`, then `talk.json`, then OS-native defaults (`$XDG_CACHE_HOME`/`~/.cache` on Linux and WSL, `~/Library/Caches` on macOS, `%LOCALAPPDATA%` on Windows).
- "model download" could happen at install time or first speech request — resolved: v1 downloads the model during **Complete Package Setup**, with no skip option.
- "uv" could be bundled, optional, or required — resolved: `uv` is a **Setup Requirement** and setup fails hard when it is missing.
- "runtime version" could float or be pinned — resolved: v1 runs Supertonic through `uv tool run --python 3.12 --from 'supertonic[serve]==1.3.1'`, and records setup in a **Runtime Manifest**.
- "speech endpoint" could mean Supertonic's native endpoint or the OpenAI-compatible alias — resolved: use native `POST /v1/tts` as the **Synthesis Endpoint**.
