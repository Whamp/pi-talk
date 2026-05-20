const DEFAULT_BAR_WIDTH = 18;
const DEFAULT_ESTIMATED_MS = 50_000;
const DEFAULT_MAX_FILL_RATIO = 0.95;

export function formatProgressLine(label, elapsedMs, options = {}) {
  const width = options.width ?? DEFAULT_BAR_WIDTH;
  const estimatedMs = options.estimatedMs ?? DEFAULT_ESTIMATED_MS;
  const maxFillRatio = options.maxFillRatio ?? DEFAULT_MAX_FILL_RATIO;
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const ratio = Math.min(maxFillRatio, Math.max(0, elapsedMs / estimatedMs));
  const filled = Math.max(1, Math.min(width - 1, Math.floor(ratio * width)));
  const bar = "█".repeat(filled) + "─".repeat(Math.max(0, width - filled));
  return `[pi-talk setup] ${label} [${bar}] ${seconds}s`;
}

export function startProgress(label, options = {}) {
  const write = options.write ?? ((chunk) => process.stderr.write(chunk));
  const now = options.now ?? (() => Date.now());
  const intervalMs = options.intervalMs ?? 500;
  const startedAt = now();
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    write(`\r${formatProgressLine(label, now() - startedAt, options)}`);
  };

  tick();
  const timer = setInterval(tick, intervalMs);

  return {
    stop(finalMessage) {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      if (finalMessage) write(`\r[pi-talk setup] ${finalMessage}`);
      write("\n");
    },
  };
}
