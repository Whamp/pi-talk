I did **not** write `/home/will/projects/pi-talk/decision/python-uv-runtime.md` because the task also said **“Do not edit files”**. Per instruction priority, I left files unchanged.

```md
# Option A: package-managed Python runtime with uv + supertonic[serve]

## Recommendation

Option A is viable and likely a good fit for Pi Talk, with one important constraint: `pi install` can run npm lifecycle setup, but “complete setup” is only reliable if Pi Talk either vendors/bootstraps a trusted uv binary or clearly requires `uv` on PATH. Relying on global `uv` alone weakens the complete-setup goal.

Best shape:

- Pi package `postinstall` runs `node scripts/setup-runtime.mjs`.
- Setup creates a package-local venv under the installed package.
- Setup installs pinned `supertonic[serve]`.
- Setup downloads the Supertonic model into a stable user cache, not the package directory.
- Extension lazy-starts the venv-local `supertonic serve` binary and polls `/v1/health`.

## Evidence

- Pi package docs say npm/git package installs run `npm install`; runtime deps belong in `dependencies`.
- Pi source confirms:
  - npm packages install via `npm install <spec> --prefix <installRoot>`.
  - git packages run `npm install --omit=dev` by default in the cloned package dir.
  - git updates run `git clean -fdx` before reinstalling deps, which would delete untracked package-local runtime/cache files.
- Temporary npm tarball test confirmed `postinstall` runs and can invoke `uv`:
  - lifecycle event: `postinstall`
  - cwd: installed package dir under `node_modules`
  - observed `uv 0.10.2` on PATH
- `@manzt/uv` exists as an npm dependency exposing a `uv` bin, but it reported `uv 0.6.14` despite package version `0.8.13`; treat as third-party/needs trust review.
- Benchmark artifact:
  - `uv venv --python 3.12`: 0.040s
  - `uv pip install 'supertonic[serve]'`: 5.705s
  - `supertonic download`: 60.736s
  - model cache: 385 MiB
  - cached `supertonic serve` ready: 0.764–1.028s, ~0.789s warm average

## Postinstall feasibility

Yes, npm postinstall can reasonably run uv commands in a Pi install context.

Caveats:

- If `uv` is missing and not bundled/bootstrap-installed, package install fails.
- User/global npm config `ignore-scripts=true` would skip setup.
- Network failures during Python/package/model download can fail install.
- `npmCommand` may wrap npm with pnpm/bun/mise/asdf; lifecycle behavior should be validated under supported wrappers.
- Local-path Pi packages are not copied/installed the same way as npm/git packages; do not rely on postinstall for local dev installs.
- Long model download makes `pi install` slow by design.

## Runtime path

Recommended:

- Package runtime:
  - `<packageRoot>/.pi-talk-runtime/venv`
  - `<packageRoot>/.pi-talk-runtime/runtime.json`
  - optional package-local uv:
    - `<packageRoot>/.pi-talk-runtime/bin/uv`
- Model cache:
  - `$PI_TALK_SUPERTONIC_CACHE_DIR`, else
  - `$XDG_CACHE_HOME/pi-talk/supertonic`, else
  - `~/.cache/pi-talk/supertonic`

Reasoning:

- Venv is package-local and avoids global Python pollution.
- Model cache should survive package updates; package-local model cache would be redownloaded often, especially for git installs because Pi cleans untracked files on update.
- Package-local venv can be recreated quickly compared with model download.

## Command paths

For extension lazy start:

- POSIX:
  - `<packageRoot>/.pi-talk-runtime/venv/bin/supertonic`
- Windows:
  - `<packageRoot>/.pi-talk-runtime/venv/Scripts/supertonic.exe`

Spawn:

```sh
supertonic serve --host 127.0.0.1 --port <free-port>
```

With env:

```sh
SUPERTONIC_CACHE_DIR=<model-cache-dir>
```

Readiness:

```http
GET http://127.0.0.1:<port>/v1/health
```

Expect JSON like benchmark:

```json
{"status":"ok","model":"supertonic-3","sample_rate":44100,"version":"1.3.1","voices_loaded":10}
```

## Pinning strategy

Use all of:

- Pin Pi package install source:
  - npm version: `npm:@scope/pi-talk@x.y.z`
  - git ref/tag: `git:...@vX.Y.Z`
- Pin Python:
  - Prefer `3.12.12` or at least `3.12`.
  - Benchmark used Python 3.12.12.
- Pin Supertonic:
  - `supertonic[serve]==1.3.1`
- Prefer committed lock file:
  - `runtime/requirements.lock`
  - generated via uv
  - installed with `uv pip sync` or exact `uv pip install -r`
- Store runtime manifest:
  - Python version
  - Supertonic version
  - lockfile hash
  - model name
  - setup timestamp/status

## Model-cache strategy

Default should download during setup for complete package setup:

```sh
SUPERTONIC_CACHE_DIR=<cache-dir> <venv>/bin/supertonic download
```

But provide escape hatches:

- `PI_TALK_SKIP_MODEL_DOWNLOAD=1`
- `PI_TALK_SKIP_RUNTIME_SETUP=1`
- `/talk doctor` or `npm run setup-runtime` to repair/retry

Tradeoff:

- Downloading in postinstall satisfies complete setup.
- It adds ~61s and ~385 MiB on the benchmark machine.
- Network/model-host failure can fail `pi install`.

## Update behavior

- npm unpinned packages update to latest with `pi update`; postinstall should rerun when npm reinstalls/upgrades.
- Version-pinned npm specs are skipped by Pi updates.
- Git refs are pinned and skipped by updates.
- Unpinned git updates clean untracked files with `git clean -fdx`, so package-local venv/model cache would be deleted.
- Stable user model cache avoids expensive redownload across updates.
- Setup script must be idempotent and able to repair partial installs.

## Pros

- Meets “no global Python pollution.”
- Can make `pi install` provide full speech runtime.
- Cached lazy startup is fast enough: ~0.8s warm in benchmark.
- Package-local Supertonic binary gives deterministic extension behavior.
- Easy health-check model via local HTTP `/v1/health`.
- Setup can be self-diagnosing with a runtime manifest.
- Removal/update story is understandable if models are in user cache.

## Cons

- Slow first install due to model download.
- Large disk footprint: at least venv + 385 MiB model cache.
- Postinstall network work is fragile.
- Full reproducibility requires pinning transitive Python deps, not only `supertonic`.
- Complete setup needs a uv distribution decision.
- npm lifecycle scripts are powerful but can be skipped/blocked by user policy.
- Cross-platform behavior needs validation, especially Windows and non-x86 Linux.

## Key risks

- `uv` absent if relying on PATH.
- Third-party npm uv wrapper trust/version mismatch.
- Model download fails or HuggingFace/cache endpoint changes.
- onnxruntime wheel/platform incompatibility.
- Package update deletes package-local runtime.
- Partial setup leaves broken venv.
- Multiple Pi sessions race to start or repair the same runtime.
- Port conflict if fixed port is used.
- Security/supply-chain risk from postinstall downloads.

## Validation checks

Minimum before choosing Option A:

1. `pi install npm:<package>` runs postinstall and creates venv.
2. `pi install git:<repo>` runs postinstall and creates venv.
3. `npm_config_ignore_scripts=true pi install ...` failure mode is clear.
4. Install succeeds with no global `supertonic`.
5. Install succeeds with no global Python package pollution.
6. `supertonic version` from venv reports pinned version.
7. `supertonic download` populates configured cache.
8. Lazy start reaches `/v1/health` within expected time.
9. `pi update` preserves model cache and repairs/recreates venv.
10. Interrupted setup can be retried.
11. Low-disk/network failure produces actionable error.
12. Validate on target OS/arch matrix.

## Implementation sketch

`package.json`:

```json
{
  "name": "@scope/pi-talk",
  "version": "0.1.0",
  "keywords": ["pi-package"],
  "scripts": {
    "postinstall": "node scripts/setup-runtime.mjs",
    "setup-runtime": "node scripts/setup-runtime.mjs",
    "doctor": "node scripts/doctor.mjs"
  },
  "pi": {
    "extensions": ["./extensions"]
  }
}
```

Setup script outline:

```js
const runtimeRoot = path.join(packageRoot, ".pi-talk-runtime");
const venv = path.join(runtimeRoot, "venv");
const modelCache =
  process.env.PI_TALK_SUPERTONIC_CACHE_DIR ??
  path.join(xdgCacheHome(), "pi-talk", "supertonic");

const uv = await resolveOrBootstrapUv(runtimeRoot);

await exec(uv, ["venv", "--python", "3.12.12", venv]);
await exec(uv, ["pip", "sync", "--python", pythonPath(venv), "runtime/requirements.lock"]);

await exec(supertonicPath(venv), ["version"]);

if (!process.env.PI_TALK_SKIP_MODEL_DOWNLOAD) {
  await exec(supertonicPath(venv), ["download"], {
    env: { ...process.env, SUPERTONIC_CACHE_DIR: modelCache }
  });
}

writeRuntimeManifest();
```

Extension lazy-start outline:

```js
const bin = supertonicPath(runtimeVenv);
const port = await findFreePort();

const child = spawn(bin, ["serve", "--host", "127.0.0.1", "--port", String(port)], {
  env: {
    ...process.env,
    SUPERTONIC_CACHE_DIR: modelCache
  },
  stdio: ["ignore", "pipe", "pipe"]
});

await pollHealth(`http://127.0.0.1:${port}/v1/health`);
```

## Bottom line

Option A should work and is aligned with Pi Talk’s Complete Package Setup goal, provided the design treats uv acquisition, model-cache location, idempotent repair, and postinstall failure UX as first-class decisions. The strongest implementation is package-local venv plus stable user model cache plus pinned Supertonic/runtime manifest, with lazy server startup.
```