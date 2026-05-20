import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The install progress helper is a plain Node .mjs script used by postinstall.
const progress = await import("../scripts/progress.mjs");

describe("install progress output", () => {
  it("formats an indeterminate progress bar with elapsed seconds", () => {
    expect(progress.formatProgressLine("Downloading Supertonic model (~385 MiB)", 4, 12_345)).toBe(
      "[pi-talk setup] Downloading Supertonic model (~385 MiB) [█████─────────────] 12s",
    );
  });

  it("writes progress ticks and a final newline", () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const reporter = progress.startProgress("Downloading Supertonic model (~385 MiB)", {
      write: (chunk: string) => writes.push(chunk),
      now: (() => {
        let current = 0;
        return () => (current += 1_000);
      })(),
      intervalMs: 1_000,
    });

    vi.advanceTimersByTime(2_000);
    reporter.stop("done");
    vi.useRealTimers();

    expect(writes.join("")).toContain("Downloading Supertonic model (~385 MiB)");
    expect(writes.join("")).toContain("done");
    expect(writes.at(-1)).toBe("\n");
  });
});
