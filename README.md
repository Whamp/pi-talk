# Pi Talk

Pi Talk is a Pi package/extension for turning assistant responses into local speech with Supertonic.

## What works

- `/talk` opens the Pi Talk TUI overlay/control panel.
- `/speak` speaks the previous assistant response.
- `/quiet` interrupts current speech and clears pending queued playback.
- The Pi Talk overlay hosts status, doctor diagnostics, **Auto Speech Mode**, configuration, and customization activities.
- Default **Talk Keybinding**: `ctrl+shift+s` (same behavior as `/speak`).
- Default **Quiet Control** keybinding: `ctrl+shift+q` (same behavior as `/quiet`).
- Speech uses visible assistant text only; thinking, tool calls, and tool results are excluded.
- Playback defaults to **Interrupt Playback** and can be configured for **Queued Playback**.
- `pi install` runs **Complete Package Setup** through `scripts/setup-runtime.mjs`.

## Setup requirement

Pi Talk requires [`uv`](https://docs.astral.sh/uv/getting-started/installation/) before install.

If `uv` is missing, package setup fails with a clear error. Pi Talk does not install Supertonic globally.

## Runtime setup

Package setup shows an indeterminate progress bar while downloading Supertonic model files so first install does not look hung.

Package setup creates:

- **Pi Talk Runtime**: `<packageRoot>/.pi-talk-runtime/venv`
- **Runtime Manifest**: `<packageRoot>/.pi-talk-runtime/runtime-manifest.json`
- **Model Cache**: OS-native per-user cache directory unless overridden

Pinned runtime:

- Python `3.12`
- `supertonic[serve]==1.3.1`
- Supertonic model `supertonic-3`

## Talk Config

Pi Talk uses JSON config only.

Merge order:

1. Built-in defaults
2. Global `~/.pi/agent/talk.json`
3. Project `.pi/talk.json`

Example:

```json
{
  "speech": {
    "voice": "M1",
    "language": "en",
    "speed": 1.05,
    "quality": 8
  },
  "playback": {
    "command": "auto",
    "onOverlap": "interrupt"
  },
  "keybindings": {
    "talk": "ctrl+shift+s",
    "quiet": "ctrl+shift+q"
  },
  "runtime": {
    "modelCacheDir": "/optional/custom/cache"
  }
}
```

Model cache override precedence:

1. `PI_TALK_SUPERTONIC_CACHE_DIR`
2. `runtime.modelCacheDir` in Talk Config
3. OS-native default

Linux/WSL playback auto-selection prefers `pw-play`, then `paplay`, `aplay`, `ffplay`, and `mpv`.

## Development

```bash
npm test
npm run typecheck
node --check scripts/setup-runtime.mjs
```

The automated test suite uses TDD-style module-contract tests with fake process, HTTP, filesystem, TUI overlay, and playback boundaries.

## Design notes

See:

- [`CONTEXT.md`](./CONTEXT.md)
- [`docs/adr/0001-use-python-server-engine.md`](./docs/adr/0001-use-python-server-engine.md)
- [`supertonic-startup-benchmark.md`](./supertonic-startup-benchmark.md)
- [`decision/`](./decision/)
