# Option B: TypeScript/Node-native Supertonic integration

Date: 2026-05-20

## Bottom line

Node-native Supertonic is viable, but today it is an example implementation, not a complete supported Node SDK. For Pi Talk it would mean vendoring/adapting Supertonic's MIT-licensed `nodejs/helper.js` into TypeScript, adding asset download/cache management, and building Pi Talk's own synthesis/playback API around ONNX Runtime.

This option reduces the Python/runtime-process surface area and keeps speech generation inside the Pi extension/package, but it does **not** meaningfully reduce setup size: Supertonic 3 assets are ~383 MiB and `onnxruntime-node` itself is a large native npm package. It also shifts API/server/voice-management maintenance burden from `supertonic[serve]` onto Pi Talk.

Recommendation: keep Option B as a plausible v2 / advanced path, but prefer the Python `supertonic[serve]` path for v1 unless a prototype proves Node synthesis latency, memory, and platform support are clearly better for Pi's extension lifecycle.

## Evidence inspected

Local checkout: `/home/will/utils/supertonic`.

Relevant files:

- `nodejs/README.md`: documents Node v16+, `npm install`, `node example_onnx.js`, 31-language support, long-form chunking, batch mode, `--speed`, `--total-step`, and notes that GPU is not supported.
- `nodejs/package.json`: declares `onnxruntime-node@^1.19.2`, `fft.js@^4.0.3`, `js-yaml@^4.1.0`, ESM module, Node >=16.
- `nodejs/example_onnx.js`: CLI wrapper around helper exports; loads ONNX dir, voice style JSON, synthesizes, writes WAV.
- `nodejs/helper.js`: actual runtime implementation; imports only `onnxruntime-node` plus Node built-ins in the current local copy. It exports `loadTextToSpeech`, `loadVoiceStyle`, `writeWavFile`, `timer`, `sanitizeFilename`.
- `README.md`: says Python SDK auto-downloads; Python `supertonic serve` exposes `/v1/tts`, `/v1/audio/speech`, `/v1/health`, `/v1/styles`, `/v1/styles/import`, `/v1/tts/batch`.
- `supertonic-startup-benchmark.md`: local Python server benchmark already measured `supertonic==1.3.1`: install 5.7s, model download 60.7s / 385 MiB, cached server readiness 0.76-1.03s.

Local state:

- `/home/will/utils/supertonic/assets` is absent.
- `nodejs/assets` is a symlink to `../assets`, currently broken because root assets are absent.
- `nodejs/node_modules` is absent.

## Published npm / SDK status

- Official-looking `supertonic` npm package exists at version `0.0.1`, repository `github.com/supertone-inc/supertonic-js`, author `Supertone Inc.`, but its tarball contains only:
  - `index.js` that prints a placeholder warning and exports `{}`
  - `package.json`
  It is **not usable as a Node SDK**.
- `easy-supertonic-tts@1.0.0` exists as a third-party TypeScript package. It downloads from `Supertone/supertonic-2`, supports only the v2 language list in its processor (`en`, `ko`, `es`, `pt`, `fr`), and wraps an adapted implementation. Not a good dependency for Supertonic 3 / Pi Talk v1.
- Other npm results such as `@qvac/tts-onnx` are larger multi-engine/native packages, not a minimal Supertonic 3 Node SDK.

Conclusion: for Supertonic 3 Node-native support, Pi Talk should assume **vendor/adapt source**, not depend on an official npm SDK.

## Required setup for a complete `pi install`

### npm/runtime dependencies

Minimum likely runtime dependency if adapting current local `helper.js`:

- `onnxruntime-node`

Optional / implementation dependencies:

- `@huggingface/hub` or small custom HTTPS downloader for model assets.
- No current evidence that `fft.js` or `js-yaml` are needed by the local Node helper despite being declared in Supertonic's Node example package.

`onnxruntime-node@1.23.2` metadata:

- `os`: `win32`, `darwin`, `linux`
- bundled native binaries observed for `darwin arm64/x64`, `linux arm64/x64`, `win32 arm64/x64`
- unpacked size: ~258 MiB

Platform implication: likely OK for modern Linux x64 and 64-bit ARM; risky for 32-bit ARM/Raspberry Pi OS variants or unsupported libc environments. Needs explicit validation on Pi's target install platforms.

### Supertonic 3 model assets

Assets come from Hugging Face repo `Supertone/supertonic-3`. Required files for the Node helper's default contract:

- `onnx/duration_predictor.onnx` (~3.5 MiB)
- `onnx/text_encoder.onnx` (~34.7 MiB)
- `onnx/vector_estimator.onnx` (~244.7 MiB)
- `onnx/vocoder.onnx` (~96.7 MiB)
- `onnx/tts.json`
- `onnx/unicode_indexer.json` (~0.3 MiB)
- `voice_styles/M1.json` ... `M5.json`
- `voice_styles/F1.json` ... `F5.json`

Hugging Face API with LFS metadata reports ~382.7 MiB for those ONNX + voice-style files, matching the prior Python benchmark cache size (~385 MiB / 26 files).

Complete setup needs one of:

1. `pi install` downloads assets into a package-managed cache, e.g. `~/.cache/pi-talk/supertonic-3`, with checksums/manifest; or
2. first speech request downloads assets with explicit progress/status; or
3. package ships assets, which is probably too large for normal npm extension distribution.

Avoid relying on `git lfs clone` during install if possible; use direct HF file downloads or `@huggingface/hub` with resumability/checking.

### Synthesis API shape

A Pi Talk wrapper would need to expose something like:

```ts
type SpeakOptions = {
  text: string;
  lang?: string;        // default "en" or "na"
  voice?: string;       // default "M1"
  totalStep?: number;   // default 8
  speed?: number;       // default 1.05
};

class SupertonicNodeEngine {
  static create({ assetDir }): Promise<SupertonicNodeEngine>;
  synthesizeToWavBuffer(opts: SpeakOptions): Promise<Buffer>;
  synthesizeToWavFile(opts: SpeakOptions, outputPath: string): Promise<void>;
}
```

Under the hood:

1. Ensure/download assets.
2. Lazily load ONNX sessions via `loadTextToSpeech(assetDir/onnx, false)`.
3. Resolve `voice_styles/${voice}.json` or custom style JSON.
4. `loadVoiceStyle([stylePath])`.
5. `textToSpeech.call(text, lang, style, totalStep, speed)`.
6. Trim by reported duration.
7. Encode WAV to `Buffer` or temp file.
8. Spawn configured Playback Command (`pw-play`, `paplay`, `aplay`, `ffplay`, `mpv`) for playback.

The upstream Node example returns the full generated WAV only after synthesis completes; it is not a streaming playback API.

## Pros

- **Single language/package surface**: Pi extension can stay TypeScript/Node; no uv/venv/Python process orchestration.
- **No local HTTP server**: no port selection, health polling, server lifecycle, or localhost API failures.
- **Potentially simpler lazy lifecycle**: load ONNX sessions only when the first Spoken Response is requested and keep them in-process.
- **Direct control over playback**: synthesize directly to a temp WAV/buffer and invoke Pi Talk's Playback Command.
- **No extra API serialization hop**: avoids HTTP request/response and base64 paths; may help small utterances, though unproven.
- **MIT vendoring path**: Supertonic repo license permits adapting `helper.js` if attribution/license is retained.
- **Can trim declared deps**: local helper currently uses only `onnxruntime-node`; Pi Talk does not need to inherit unused `fft.js`/`js-yaml` unless future upstream code requires them.

## Cons

- **No complete official Node SDK today**: official npm package is only a placeholder. Pi Talk owns the integration.
- **API parity work**: Python server already provides health, styles listing/import, OpenAI-compatible endpoint, batch endpoint, docs, response formats, and cache behavior. Node option starts with only helper functions.
- **Asset management burden**: must implement download, cache layout, partial-download recovery, version pinning, checksums, upgrades, and user-facing progress.
- **Native npm payload remains large**: `onnxruntime-node` unpacked size is ~258 MiB and Supertonic 3 assets are ~383 MiB. Minimal-dependency goal is only partially met.
- **Platform risk**: Node ONNX prebuilds cover linux/darwin/win arm64/x64, but not all possible Pi user machines; Python `onnxruntime` may have better-known install behavior in the existing benchmark path.
- **Maintenance burden**: upstream helper is JavaScript example code, not stable package API; Pi Talk must track upstream changes for Supertonic 3+.
- **Text/voice feature gaps**: custom Voice Builder imports, style registry, batch limits, response formats, and OpenAI compatibility would be Pi Talk code if needed.
- **Performance unknown**: local Python server has measured cached readiness under ~1.1s. Node ONNX load/synthesis latency has not been measured locally because assets and node_modules are absent.
- **Memory behavior risk**: Node helper uses large JS arrays and repeated flattening/conversion into tensors. Supertonic's Node README warns Node may consume significant memory.
- **No GPU support in Node helper**: `--use-gpu` throws `GPU mode is not supported yet`.

## Risks to validate before choosing Option B

1. **Install success**: `npm install onnxruntime-node` on target Pi platforms and current Pi Node version.
2. **Asset download robustness**: direct HF download without Git LFS, with resume/retry/checksum.
3. **Cold model load time**: time from first speech request to ONNX sessions loaded.
4. **First synthesis latency**: short assistant response and long response, totalStep 8, voice M1/F1, lang `en` and `na`.
5. **Warm synthesis latency/RTF**: compare to Python server on identical text/voice/settings.
6. **Peak RSS**: Node helper's JS arrays may materially exceed Python server memory for long text.
7. **Audio correctness**: generated WAV sample rate 44.1 kHz, no clipping, playable by `pw-play` and fallbacks.
8. **Voice compatibility**: all ten preset JSON files plus a Voice Builder custom JSON.
9. **Language coverage**: at least `en`, `na`, and one non-English language from the 31-code list.
10. **Long-form chunking**: verify boundaries, silence insertion, and duration trimming.
11. **Concurrency policy**: decide whether engine serializes synthesis requests; ONNX sessions may not be safe or memory-efficient for concurrent Pi responses.
12. **Upgrade path**: model version pinning and cache invalidation for future Supertonic releases.

## Concrete implementation sketch

1. Add `src/supertonic-node/engine.ts` adapted from `nodejs/helper.js`:
   - convert to TypeScript types
   - keep a small public API (`create`, `synthesizeToWavBuffer/File`)
   - hide ONNX/session internals
2. Add `src/supertonic-node/assets.ts`:
   - manifest for `Supertone/supertonic-3` asset paths and expected sizes/hashes if available
   - cache root in Pi Talk-managed data/cache dir
   - atomic downloads to `.partial`, rename on success
3. Add `src/speech/playback.ts`:
   - write temp WAV
   - run selected Playback Command
   - implement Interrupt Playback / Queued Playback semantics
4. Add config:
   - `engine: "node-native" | "python-server"`
   - `voice`, `lang`, `speed`, `totalStep`, `assetDir`
5. Add validation command:
   - `/talk doctor` or install-time check that verifies native ONNX load and one tiny synthesis.
6. Keep Python-server option available behind config until Node-native proves stable.

## Comparison to Python `supertonic[serve]`

| Area | Node-native | Python server |
|---|---|---|
| Setup | npm native package + asset downloader Pi Talk must build | `uv` venv + `pip install 'supertonic[serve]'`; SDK handles model download |
| Runtime shape | In-process TypeScript API | Separate local HTTP Supertonic Server |
| Measured readiness | Not measured locally | Cached ready 0.76-1.03s in existing benchmark |
| Asset size | Same ~383 MiB model assets | Same ~385 MiB observed cache |
| Extra package size | `onnxruntime-node` ~258 MiB unpacked | Python deps installed 43 packages in benchmark |
| API completeness | Minimal helper; Pi Talk builds features | Health, styles, import, native TTS, OpenAI-compatible speech, batch, docs |
| Playback | Pi Talk directly writes WAV and plays | Pi Talk downloads/receives WAV then plays |
| Maintenance | Pi Talk owns vendored helper and downloader | Supertonic Python SDK owns server/API/cache behavior |
| Platform support | Depends on Node ONNX prebuilds | Depends on Python/onnxruntime wheels; already proven on this machine |
| Dependency philosophy | No Python, but large native npm dep | Adds Python runtime, but cleaner supported product surface |

## Decision guidance

Choose Node-native if Pi Talk strongly prioritizes a pure TypeScript package and is willing to own the Supertonic integration surface.

Choose Python server if Pi Talk prioritizes fastest path to a complete, supported, and already benchmarked local speech backend with good API coverage.

For v1, Python server remains lower product risk. For Option B to overtake it, run a prototype benchmark with assets installed and compare warm synthesis latency/RSS against the existing Python-server baseline.
