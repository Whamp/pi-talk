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
        }, { overlay: true, overlayOptions: { anchor: "center", width: 78, maxHeight: "80%" } });
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
    statusEntries;
    constructor(options) {
        this.options = options;
        this.statusEntries = parseStatusEntries(options.status).map((entry) => entry.label === "Auto Speech Mode" ? { ...entry, value: options.autoSpeechEnabled ? "on" : "off" } : entry);
        this.items = [
            {
                key: "s",
                title: "Speak previous response",
                detail: "Read the latest assistant answer aloud.",
                result: "speak",
            },
            {
                key: "a",
                title: `Auto Speech ${options.autoSpeechEnabled ? "on" : "off"}`,
                detail: "Speak future assistant answers automatically.",
                result: "toggle-auto",
            },
            {
                key: "q",
                title: "Quiet now",
                detail: "Stop playback and clear queued audio.",
                result: "quiet",
            },
            {
                key: "d",
                title: "Doctor diagnostics",
                detail: "Check runtime, cache, playback, and config.",
                result: "doctor",
            },
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
            return;
        }
        const shortcut = this.items.find((item) => item.key.length === 1 && data.toLowerCase() === item.key);
        if (shortcut) {
            this.options.done(shortcut.result);
        }
    }
    render(width) {
        const overlayWidth = Math.min(Math.max(56, width), 78);
        const innerWidth = overlayWidth - 2;
        const lines = [];
        lines.push(this.titleBorder(innerWidth));
        lines.push(this.headerRow(innerWidth));
        lines.push(this.divider(innerWidth));
        lines.push(this.sectionRow("Status", innerWidth));
        for (const line of this.statusGridRows(innerWidth)) {
            lines.push(this.row(line, innerWidth));
        }
        lines.push(this.divider(innerWidth));
        lines.push(this.sectionRow("Actions", innerWidth));
        for (let index = 0; index < this.items.length; index += 1) {
            lines.push(this.actionRow(this.items[index], index === this.selected, innerWidth));
        }
        lines.push(this.divider(innerWidth));
        lines.push(this.centerRow(this.dim("↑↓ navigate  •  enter select  •  s/a/q/d shortcuts  •  esc close"), innerWidth));
        lines.push(this.bottomBorder(innerWidth));
        return lines.map((line) => truncateToWidth(line, width, "", true));
    }
    invalidate() { }
    titleBorder(innerWidth) {
        const title = ` ${this.bold("Pi Talk")} `;
        const titleWidth = visibleWidth(title);
        const left = Math.floor((innerWidth - titleWidth) / 2);
        const right = Math.max(0, innerWidth - titleWidth - left);
        return this.border(`╭${"─".repeat(left)}`) + this.accent(title) + this.border(`${"─".repeat(right)}╮`);
    }
    bottomBorder(innerWidth) {
        return this.border(`╰${"─".repeat(innerWidth)}╯`);
    }
    divider(innerWidth) {
        return this.border(`├${"─".repeat(innerWidth)}┤`);
    }
    headerRow(innerWidth) {
        const title = this.bold("Local speech control");
        const state = this.options.autoSpeechEnabled ? this.accent("AUTO ON") : this.dim("AUTO OFF");
        return this.row(`${title}${this.gap(title, state, innerWidth - 2)}${state}`, innerWidth);
    }
    sectionRow(label, innerWidth) {
        return this.row(this.accent(` ${label} `), innerWidth);
    }
    statusGridRows(innerWidth) {
        const entries = this.statusEntries.length > 0 ? this.statusEntries : [{ label: "Status", value: "unknown" }];
        if (innerWidth < 68) {
            return entries.map((entry) => this.formatStatusCell(entry, innerWidth - 2));
        }
        const cellWidth = Math.floor((innerWidth - 4) / 2);
        const rows = [];
        for (let index = 0; index < entries.length; index += 2) {
            const left = padVisible(this.formatStatusCell(entries[index], cellWidth), cellWidth);
            const rightEntry = entries[index + 1];
            const right = rightEntry ? padVisible(this.formatStatusCell(rightEntry, cellWidth), cellWidth) : "".padEnd(cellWidth, " ");
            rows.push(`${left}  ${right}`);
        }
        return rows;
    }
    formatStatusCell(entry, width) {
        const label = truncateToWidth(entry.label, Math.min(18, Math.max(8, Math.floor(width * 0.45))), "…");
        const prefix = `${this.dim(label)}: `;
        const valueWidth = Math.max(4, width - visibleWidth(prefix));
        return `${prefix}${this.bold(truncateToWidth(entry.value, valueWidth, "…"))}`;
    }
    actionRow(item, selected, innerWidth) {
        const marker = selected ? this.accent("▸") : this.dim("·");
        const key = this.dim(`[${item.key}]`);
        const title = selected ? this.bold(this.accent(item.title)) : this.bold(item.title);
        const left = `${marker} ${key} ${title}`;
        const detailWidth = Math.max(12, innerWidth - visibleWidth(left) - 4);
        const detail = this.dim(truncateToWidth(item.detail, detailWidth, "…"));
        return this.row(`${left}${this.gap(left, detail, innerWidth - 2)}${detail}`, innerWidth);
    }
    row(content, innerWidth) {
        const padded = padVisible(truncateToWidth(` ${content}`, innerWidth, "…", true), innerWidth);
        return `${this.border("│")}${padded}${this.border("│")}`;
    }
    emptyRow(innerWidth) {
        return `${this.border("│")}${" ".repeat(innerWidth)}${this.border("│")}`;
    }
    centerRow(content, innerWidth) {
        const clipped = truncateToWidth(content, innerWidth, "…", true);
        const padding = Math.max(0, innerWidth - visibleWidth(clipped));
        const left = Math.floor(padding / 2);
        return `${this.border("│")}${" ".repeat(left)}${clipped}${" ".repeat(padding - left)}${this.border("│")}`;
    }
    gap(left, right, innerWidth) {
        return " ".repeat(Math.max(1, innerWidth - visibleWidth(left) - visibleWidth(right)));
    }
    border(text) {
        return this.color("border", text);
    }
    accent(text) {
        return this.color("accent", text);
    }
    dim(text) {
        return this.color("dim", text);
    }
    color(color, text) {
        return this.options.theme.fg?.(color, text) ?? text;
    }
    bold(text) {
        return this.options.theme.bold?.(text) ?? text;
    }
}
function parseStatusEntries(status) {
    return status
        .split("\n")
        .slice(1)
        .map((line) => {
        const separator = line.indexOf(":");
        if (separator === -1)
            return undefined;
        const label = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (!label || !value)
            return undefined;
        return { label, value };
    })
        .filter((entry) => Boolean(entry));
}
function padVisible(value, width) {
    return `${value}${" ".repeat(Math.max(0, width - visibleWidth(value)))}`;
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
