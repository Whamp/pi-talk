# Use the Python Server Engine for v1

Pi Talk v1 uses a package-managed Python runtime with `uv` and `supertonic[serve]` instead of embedding Supertonic through the Node.js ONNX example. The Python server path is the supported Supertonic integration, already benchmarked on the target machine with cached readiness around one second, and avoids Pi Talk owning model loading, asset management, style APIs, and long-term maintenance for a vendored Node implementation.
