# Supertonic startup benchmark

Date: 2026-05-20

## Environment summary

- Host OS/kernel: Arch Linux, Linux 7.0.3-arch1-2 x86_64
- CPU: AMD Ryzen AI 7 350 w/ Radeon 860M
- CPU cores reported by `nproc`: 16
- RAM: 46 GiB total, 35 GiB available at measurement start
- Project cwd: `/home/will/projects/pi-talk`
- System Python: Python 3.14.3
- Isolated benchmark Python: Python 3.12.12 via `uv venv --python 3.12`
- `uv`: 0.10.2
- Global `supertonic`: not found on `PATH`
- Installed package for benchmark: `supertonic==1.3.1`
- Temporary benchmark root/cache: `/tmp/supertonic-bench.kEbs8S`
- Model cache override: `SUPERTONIC_CACHE_DIR=/tmp/supertonic-bench.kEbs8S/model-cache`
- Downloaded model cache size: 385 MiB (`supertonic-3`, 26 files)

Readiness definition used: `GET /v1/health` on the chosen localhost port returns HTTP 200 with JSON:

```json
{"status":"ok","model":"supertonic-3","sample_rate":44100,"version":"1.3.1","voices_loaded":10}
```

## Commands used

Environment/setup checks:

```bash
uname -srmo
source /etc/os-release && printf '%s\n' "$PRETTY_NAME"
lscpu | awk -F: '/Model name/{sub(/^ +/,"",$2); print $2; exit}'
nproc
free -h
python3 --version
uv --version
command -v supertonic
```

Isolated setup:

```bash
TMPROOT=$(mktemp -d /tmp/supertonic-bench.XXXXXX)
uv venv --python 3.12 "$TMPROOT/venv"
uv pip install --python "$TMPROOT/venv/bin/python" 'supertonic[serve]'
"$TMPROOT/venv/bin/supertonic" version
"$TMPROOT/venv/bin/supertonic" serve --help
```

Separate model download:

```bash
export SUPERTONIC_CACHE_DIR="$TMPROOT/model-cache"
"$TMPROOT/venv/bin/supertonic" download
du -sh "$SUPERTONIC_CACHE_DIR"
```

Startup benchmark shape, repeated 3 times with a free port:

```bash
export SUPERTONIC_CACHE_DIR="$TMPROOT/model-cache"
"$TMPROOT/venv/bin/supertonic" serve --host 127.0.0.1 --port <free-port> --log-level info
# Poll: GET http://127.0.0.1:<free-port>/v1/health until HTTP 200 healthy JSON.
# Then SIGTERM the server process group and wait for clean shutdown.
```

## Timings

| Step | Timing | Notes |
|---|---:|---|
| Create isolated venv | 0.040 s | `uv venv --python 3.12` |
| Install `supertonic[serve]` | 5.705 s | Downloaded `numpy` and `onnxruntime`; installed 43 packages. |
| Model download | 60.736 s | Default `supertonic-3`; 26 files; 385 MiB in temp cache. |
| Cold ready attempt 1 | 1.028 s | First server start after explicit model download; `/v1/health` HTTP 200. |
| Warm ready attempt 2 | 0.764 s | Same temp cache; `/v1/health` HTTP 200. |
| Warm ready attempt 3 | 0.814 s | Same temp cache; `/v1/health` HTTP 200. |

Warm startup average over attempts 2-3: **0.789 s**. Startup range after model is cached: **0.764-1.028 s**.

If model download is not already complete, first-use user-visible delay is approximately **61.8 s** on this run (60.736 s download + 1.028 s first ready). This should be treated as network/cache dependent, not a stable startup-time number.

## Observed logs / errors

No server startup errors were observed. Each server was terminated after readiness and shut down cleanly.

Representative attempt 1 log excerpt:

```text
0.517s INFO:     Started server process [97023]
0.517s INFO:     Waiting for application startup.
0.972s INFO:     Application startup complete.
0.973s INFO:     Uvicorn running on http://127.0.0.1:34361 (Press CTRL+C to quit)
1.027s supertonic serve listening on http://127.0.0.1:34361
1.027s   docs:  http://127.0.0.1:34361/docs
1.027s   model: supertonic-3
1.027s INFO:     127.0.0.1:42678 - "GET /v1/health HTTP/1.1" 200 OK
1.073s INFO:     Shutting down
1.173s INFO:     Application shutdown complete.
```

Setup observations:

- `/usr/bin/time` is absent on this machine, so timing was done with Python `time.monotonic()`.
- `uv venv` created a venv without `pip`; `uv pip install --python ...` worked and was the measured install path.

## Recommendation

Use **lazy autostart on first keybinding / first `/talk` use**, with a readiness spinner/status message.

Rationale:

- Cached startup is fast enough (<~1.1 s observed, ~0.8 s warm) that lazy startup should feel acceptable.
- Pi startup autostart is not necessary unless the extension needs zero-delay speech on every Pi launch.
- Manual-only startup is probably worse UX than needed because the process can be brought up automatically in about a second once the model exists.
- The real outlier is first model download (~61 s and 385 MiB here), which should be handled as explicit setup/preflight or a clearly messaged first-run download, not hidden inside activation.

Confidence: **high** for cached startup behavior on this machine; **medium** for first-run download time because it depends on network and HuggingFace cache state.
