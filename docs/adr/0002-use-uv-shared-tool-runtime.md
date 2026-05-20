# Use uv shared tool runtime instead of a package-local venv

Pi Talk setup originally created a package-local Python virtual environment at `<packageRoot>/.pi-talk-runtime/venv`. Installing from a Git package placed that venv under Pi's managed package checkout in `~/.pi/agent/git/...`, adding roughly 180 MiB of writable state beside the extension. Combined with the Supertonic model cache, this could push Pi's writable area over quota and cause Pi extension loading to fail with Linux `EDQUOT` (`errno -122`) on later writes.

Pi Talk now runs Supertonic through uv's shared tool/cache storage:

```bash
uv tool run --python 3.12 --from 'supertonic[serve]==1.3.1' supertonic ...
```

Install-time setup still requires `uv`, pins Python 3.12 and `supertonic[serve]==1.3.1`, downloads the Supertonic model into the OS-native Model Cache, and writes a small Runtime Manifest. It no longer creates or stores a large package-local venv inside Pi's installed package checkout.
