const DEFAULT_BAR_WIDTH = 18;

export function formatProgressLine(label, frame, elapsedMs, width = DEFAULT_BAR_WIDTH) {
  const filled = (frame % width) + 1;
  const bar = "█".repeat(filled) + "─".repeat(Math.max(0, width - filled));
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return `[pi-talk setup] ${label} [${bar}] ${seconds}s`;
}

export function startProgress(label, options = {}) {
  const write = options.write ?? ((chunk) => process.stderr.write(chunk));
  const now = options.now ?? (() => Date.now());
  const intervalMs = options.intervalMs ?? 500;
  const startedAt = now();
  let frame = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    write(`\r${formatProgressLine(label, frame, now() - startedAt)}`);
    frame += 1;
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
