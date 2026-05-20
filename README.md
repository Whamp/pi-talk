# Pi Talk

Pi Talk is a Pi extension for turning assistant responses into local speech with Supertonic.

## Status

Design and planning are in progress. The current repository captures the domain glossary, architecture decision record, benchmark notes, and implementation tradeoff research.

## Key decisions

- Uses a package-managed Python runtime with `uv` and `supertonic[serve]` for v1.
- Uses lazy autostart for the local Supertonic server.
- Speaks visible assistant text only.
- Defaults to interrupting active playback; queued playback will be configurable.
- Uses OS-native per-user cache locations for Supertonic model assets.

See:

- [`CONTEXT.md`](./CONTEXT.md)
- [`docs/adr/0001-use-python-server-engine.md`](./docs/adr/0001-use-python-server-engine.md)
- [`supertonic-startup-benchmark.md`](./supertonic-startup-benchmark.md)
- [`decision/`](./decision/)
