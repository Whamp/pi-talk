export async function showTalkOverlay(options) {
    if (options.ctx.hasUI === false || typeof options.ctx.ui.custom !== "function") {
        options.ctx.ui.notify(options.status, "info");
        return;
    }
    let autoSpeechEnabled = options.autoSpeechEnabled;
    while (true) {
        const result = await options.ctx.ui.custom((tui, theme, _keybindings, done) => {
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
    options;
    selected = 0;
    items;
    constructor(options) {
        this.options = options;
        this.items = [
            { label: "Speak previous response", result: "speak" },
            { label: `Auto Speech Mode: ${options.autoSpeechEnabled ? "on" : "off"}`, result: "toggle-auto" },
            { label: "Quiet now", result: "quiet" },
            { label: "Doctor diagnostics", result: "doctor" },
            { label: "Configuration and customization", result: "close" },
            { label: "Close", result: "close" },
        ];
    }
    handleInput(data) {
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
            this.options.done(this.items[this.selected].result);
        }
    }
    render(width) {
        const overlayWidth = Math.min(Math.max(48, width), 72);
        const innerWidth = overlayWidth - 2;
        const lines = [];
        const border = (s) => this.color("border", s);
        const accent = (s) => this.color("accent", s);
        const dim = (s) => this.color("dim", s);
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
            const item = this.items[index];
            const marker = index === this.selected ? accent("▸") : dim("·");
            lines.push(this.row(`${marker} ${item.label}`, innerWidth));
        }
        lines.push(this.row(dim("↑↓ navigate • enter select • esc close"), innerWidth));
        lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
        return lines.map((line) => truncateToWidth(line, width, "", true));
    }
    invalidate() { }
    row(content, innerWidth) {
        return `${this.color("border", "│")}${truncateToWidth(` ${content}`, innerWidth, "…", true)}${this.color("border", "│")}`;
    }
    color(color, text) {
        return this.options.theme.fg?.(color, text) ?? text;
    }
    bold(text) {
        return this.options.theme.bold?.(text) ?? text;
    }
}
function matchesKey(data, key) {
    if (key === "escape")
        return data === "\u001B";
    if (key === "ctrl+c")
        return data === "\u0003";
    if (key === "up")
        return data === "\u001B[A";
    if (key === "down")
        return data === "\u001B[B";
    if (key === "enter")
        return data === "\r" || data === "\n";
    if (key === "return")
        return data === "\r" || data === "\n";
    return false;
}
function truncateToWidth(value, width, ellipsis = "…", _ansiAware = true) {
    if (visibleWidth(value) <= width)
        return value;
    const plain = stripAnsi(value);
    const suffix = width > 0 ? ellipsis : "";
    return `${plain.slice(0, Math.max(0, width - visibleWidth(suffix)))}${suffix}`;
}
function visibleWidth(value) {
    return Array.from(stripAnsi(value)).length;
}
function stripAnsi(value) {
    return value.replace(/\u001B\[[0-9;]*m/g, "");
}
