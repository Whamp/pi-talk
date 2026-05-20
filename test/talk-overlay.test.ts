import { describe, expect, it, vi } from "vitest";
import { showTalkOverlay } from "../src/talk-overlay.js";

type OverlayComponent = {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
};

async function renderOverlay(status: string, autoSpeechEnabled = false, width = 80): Promise<string[]> {
  let component: OverlayComponent | undefined;

  await showTalkOverlay({
    ctx: {
      ui: {
        notify: vi.fn(),
        custom: async (factory: (tui: { requestRender(): void }, theme: unknown, keybindings: unknown, done: (value: string) => void) => OverlayComponent) => {
          component = factory({ requestRender: vi.fn() }, {}, {}, vi.fn()) as OverlayComponent;
          return "close";
        },
      },
    } as never,
    autoSpeechEnabled,
    status,
    doctor: async () => "doctor report",
    speak: async () => undefined,
    quiet: vi.fn(),
    setAutoSpeechEnabled: vi.fn(),
  });

  if (!component) throw new Error("Overlay component was not created");
  return component.render(width);
}

function visibleWidth(value: string): number {
  return Array.from(value.replace(/\u001B\[[0-9;]*m/g, "")).length;
}

describe("Talk overlay rendering", () => {
  const status = [
    "Pi Talk status",
    "Auto Speech Mode: off",
    "Talk Keybinding: alt+s",
    "Quiet Control: alt+q",
    "Playback overlap: interrupt",
    "Playback command: auto",
    "Voice: M1",
    "Language: en",
    "Runtime: installed",
  ].join("\n");

  it("renders a polished full-width control panel without leaking background text", async () => {
    const lines = await renderOverlay(status, false, 80);
    const text = lines.join("\n");
    const expectedWidth = visibleWidth(lines[0]!);

    expect(text).toContain("Pi Talk");
    expect(text).toContain("Local speech control");
    expect(text).toContain("Status");
    expect(text).toContain("Actions");
    expect(text).toContain("Auto Speech");
    expect(text).toContain("alt+s");
    expect(text).toContain("Runtime");
    expect(text).toContain("Speak previous response");
    expect(text).toContain("↑↓ navigate");
    expect(lines.every((line) => visibleWidth(line) === expectedWidth)).toBe(true);
  });

  it("keeps the status grid in sync with the live Auto Speech state", async () => {
    const lines = await renderOverlay(status, true, 80);
    const text = lines.join("\n");

    expect(text).toContain("AUTO ON");
    expect(text).toContain("Auto Speech Mode: on");
    expect(text).not.toContain("Auto Speech Mode: off");
  });
});
