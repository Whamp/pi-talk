import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type OverlayContext = {
  hasUI?: boolean;
  ui: {
    notify(message: string, level: "info" | "warning" | "error" | string): void;
    custom<T>(factory: (tui: { requestRender(): void }, theme: OverlayTheme, keybindings: unknown, done: (value: T) => void) => unknown, options?: unknown): Promise<T>;
  };
};

type OverlayTheme = {
  fg?(color: string, text: string): string;
  bold?(text: string): string;
};

export type TalkOverlayOptions = {
  ctx: OverlayContext;
  autoSpeechEnabled: boolean;
  status: string;
  doctor(): Promise<string>;
  speak(): Promise<void>;
  quiet(): void;
  setAutoSpeechEnabled(enabled: boolean): void;
};

type OverlayResult = "speak" | "quiet" | "toggle-auto" | "doctor" | "close";

export async function showTalkOverlay(options: TalkOverlayOptions): Promise<void> {
  if (options.ctx.hasUI === false || typeof options.ctx.ui.custom !== "function") {
    options.ctx.ui.notify(options.status, "info");
    return;
  }

  let autoSpeechEnabled = options.autoSpeechEnabled;
  while (true) {
    const result = await options.ctx.ui.custom<OverlayResult>((tui, theme, _keybindings, done) => {
      return new TalkOverlayComponent({
        theme,
        status: options.status,
        autoSpeechEnabled,
        done,
        requestRender: () => tui.requestRender(),
      });
    }, { overlay: true, overlayOptions: { anchor: "center", width: 72, maxHeight: "80%" } });

    if (result === "speak") {
      await options.speak();
      continue;
    }
    if (result === "quiet") {
      options.quiet();
      continue;
    }
    if (result === "toggle-auto") {
      autoSpeechEnabled = !autoSpeechEnabled;
      options.setAutoSpeechEnabled(autoSpeechEnabled);
      continue;
    }
    if (result === "doctor") {
      options.ctx.ui.notify(await options.doctor(), "info");
      continue;
    }
    return;
  }
}

class TalkOverlayComponent {
  private selected = 0;
  private readonly items: Array<{ label: string; result: OverlayResult }>;

  constructor(
    private readonly options: {
      theme: OverlayTheme;
      status: string;
      autoSpeechEnabled: boolean;
      done(result: OverlayResult): void;
      requestRender(): void;
    },
  ) {
    this.items = [
      { label: "Speak previous response", result: "speak" },
      { label: `Auto Speech Mode: ${options.autoSpeechEnabled ? "on" : "off"}`, result: "toggle-auto" },
      { label: "Quiet now", result: "quiet" },
      { label: "Doctor diagnostics", result: "doctor" },
      { label: "Configuration and customization", result: "close" },
      { label: "Close", result: "close" },
    ];
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.options.done("close");
      return;
    }
    if (matchesKey(data, "up")) {
      this.selected = this.selected === 0 ? this.items.length - 1 : this.selected - 1;
      this.options.requestRender();
      return;
    }
    if (matchesKey(data, "down")) {
      this.selected = (this.selected + 1) % this.items.length;
      this.options.requestRender();
      return;
    }
    if (matchesKey(data, "enter") || matchesKey(data, "return")) {
      this.options.done(this.items[this.selected]!.result);
    }
  }

  render(width: number): string[] {
    const overlayWidth = Math.min(Math.max(48, width), 72);
    const innerWidth = overlayWidth - 2;
    const lines: string[] = [];
    const border = (s: string) => this.color("border", s);
    const accent = (s: string) => this.color("accent", s);
    const dim = (s: string) => this.color("dim", s);
    const title = ` ${this.bold("Pi Talk")} `;
    const titleWidth = visibleWidth(stripAnsi(title));
    const left = Math.floor((innerWidth - titleWidth) / 2);
    const right = Math.max(0, innerWidth - titleWidth - left);

    lines.push(border(`╭${"─".repeat(left)}`) + accent(title) + border(`${"─".repeat(right)}╮`));
    for (const line of this.options.status.split("\n").slice(1)) {
      lines.push(this.row(line, innerWidth));
    }
    lines.push(border(`├${"─".repeat(innerWidth)}┤`));
    for (let index = 0; index < this.items.length; index += 1) {
      const item = this.items[index]!;
      const marker = index === this.selected ? accent("▸") : dim("·");
      lines.push(this.row(`${marker} ${item.label}`, innerWidth));
    }
    lines.push(this.row(dim("↑↓ navigate • enter select • esc close"), innerWidth));
    lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
    return lines.map((line) => truncateToWidth(line, width, "", true));
  }

  invalidate(): void {}

  private row(content: string, innerWidth: number): string {
    return `${this.color("border", "│")}${truncateToWidth(` ${content}`, innerWidth, "…", true)}${this.color("border", "│")}`;
  }

  private color(color: string, text: string): string {
    return this.options.theme.fg?.(color, text) ?? text;
  }

  private bold(text: string): string {
    return this.options.theme.bold?.(text) ?? text;
  }
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}
