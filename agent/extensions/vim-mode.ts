/**
 * Vim-style modal editor for pi
 *
 * Modes:
 *   INSERT  - normal typing, all keys go to editor
 *   NORMAL  - single-key commands, printable keys are actions
 *
 * Features:
 *   - Leader key (space) with which-key popup showing available commands
 *   - Keystroke display in editor status bar
 *   - ? key in normal mode shows full hotkey reference
 *   - /keys command for reference from any mode
 *
 * Normal mode bindings:
 *
 *   Navigation:
 *     h/j/k/l       - left/down/up/right
 *     w/b           - word forward/backward
 *     0/$           - line start/end
 *
 *   Editing:
 *     i/a/I/A/o/O   - enter insert mode (vim-style)
 *     x             - delete char forward
 *     dd            - delete line
 *     u             - undo
 *
 *   Leader commands (space + key):
 *     <leader>p     - toggle plan mode
 *     <leader>l     - toggle learn mode
 *     <leader>m     - model selector
 *     <leader>M     - cycle model forward
 *     <leader>t     - session tree
 *     <leader>n     - new session
 *     <leader>f     - fork session
 *     <leader>r     - resume session
 *     <leader>e     - expand/collapse tools
 *     <leader>T     - cycle thinking level
 *     <leader>?     - full hotkey reference
 *
 *   Other:
 *     Enter         - submit prompt
 *     ?             - show full hotkey reference
 *     Escape        - abort/cancel agent
 */

import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

// ── Escape sequences ────────────────────────────────────────────────

const ESC = {
	left: "\x1b[D",
	right: "\x1b[C",
	up: "\x1b[A",
	down: "\x1b[B",
	wordLeft: "\x1bb",
	wordRight: "\x1bf",
	lineStart: "\x01",
	lineEnd: "\x05",
	delete: "\x1b[3~",
	deleteToLineStart: "\x15",
	deleteToLineEnd: "\x0b",
	undo: "\x1f",
	newline: "\x1b[13;2u",
};

const LEADER = " ";
const KEYSTROKE_HISTORY_SIZE = 8;
const KEYSTROKE_FADE_MS = 3000;

// ── Hotkey definitions (single source of truth) ─────────────────────

interface Hotkey {
	keys: string;
	description: string;
	category: "mode" | "nav" | "edit" | "leader" | "other";
}

const HOTKEYS: Hotkey[] = [
	{ keys: "i",     description: "Insert at cursor",       category: "mode" },
	{ keys: "a",     description: "Insert after cursor",    category: "mode" },
	{ keys: "I",     description: "Insert at line start",   category: "mode" },
	{ keys: "A",     description: "Insert at line end",     category: "mode" },
	{ keys: "o",     description: "New line below + insert", category: "mode" },
	{ keys: "O",     description: "New line above + insert", category: "mode" },
	{ keys: "h",     description: "Move left",              category: "nav" },
	{ keys: "j",     description: "Move down",              category: "nav" },
	{ keys: "k",     description: "Move up",                category: "nav" },
	{ keys: "l",     description: "Move right",             category: "nav" },
	{ keys: "w",     description: "Word forward",           category: "nav" },
	{ keys: "b",     description: "Word backward",          category: "nav" },
	{ keys: "0",     description: "Line start",             category: "nav" },
	{ keys: "$",     description: "Line end",               category: "nav" },
	{ keys: "x",     description: "Delete char",            category: "edit" },
	{ keys: "dd",    description: "Delete line",            category: "edit" },
	{ keys: "u",     description: "Undo",                   category: "edit" },
	{ keys: "⎵ p",   description: "Toggle plan mode",       category: "leader" },
	{ keys: "⎵ l",   description: "Toggle learn mode",      category: "leader" },
	{ keys: "⎵ m",   description: "Model selector",         category: "leader" },
	{ keys: "⎵ M",   description: "Cycle model forward",    category: "leader" },
	{ keys: "⎵ t",   description: "Session tree",           category: "leader" },
	{ keys: "⎵ n",   description: "New session",            category: "leader" },
	{ keys: "⎵ f",   description: "Fork session",           category: "leader" },
	{ keys: "⎵ r",   description: "Resume session",         category: "leader" },
	{ keys: "⎵ e",   description: "Expand/collapse tools",  category: "leader" },
	{ keys: "⎵ T",   description: "Cycle thinking level",   category: "leader" },
	{ keys: "⎵ R",   description: "Reload extensions",     category: "leader" },
	{ keys: "⎵ ?",   description: "Full hotkey reference",  category: "leader" },
	{ keys: "Enter", description: "Submit prompt",          category: "other" },
	{ keys: "?",     description: "Full hotkey reference",  category: "other" },
	{ keys: "Esc",   description: "Abort agent",            category: "other" },
];

const CATEGORY_LABELS: Record<string, string> = {
	mode: "Mode Switching",
	nav: "Navigation",
	edit: "Editing",
	leader: "Leader (⎵ + key)",
	other: "Other",
};

// Leader commands shown in the which-key popup
const LEADER_COMMANDS: { key: string; label: string }[] = [
	{ key: "p", label: "plan mode" },
	{ key: "l", label: "learn mode" },
	{ key: "m", label: "model select" },
	{ key: "M", label: "cycle model" },
	{ key: "t", label: "tree" },
	{ key: "n", label: "new session" },
	{ key: "f", label: "fork" },
	{ key: "r", label: "resume" },
	{ key: "e", label: "expand tools" },
	{ key: "T", label: "thinking" },
	{ key: "R", label: "reload" },
	{ key: "?", label: "all hotkeys" },
];

// ── Keystroke tracker ───────────────────────────────────────────────

interface Keystroke {
	key: string;
	timestamp: number;
}

class KeystrokeTracker {
	private history: Keystroke[] = [];

	push(key: string) {
		const display = this.formatKey(key);
		if (!display) return;
		this.history.push({ key: display, timestamp: Date.now() });
		if (this.history.length > KEYSTROKE_HISTORY_SIZE) {
			this.history.shift();
		}
	}

	getRecent(): string[] {
		const now = Date.now();
		return this.history
			.filter(k => now - k.timestamp < KEYSTROKE_FADE_MS)
			.map(k => k.key);
	}

	clear() {
		this.history = [];
	}

	private formatKey(data: string): string | null {
		if (matchesKey(data, "escape")) return "Esc";
		if (matchesKey(data, "enter") || matchesKey(data, "return")) return "Enter";
		if (matchesKey(data, "backspace")) return "⌫";
		if (matchesKey(data, "tab")) return "Tab";
		if (matchesKey(data, "space") || data === " ") return "⎵";
		if (matchesKey(data, "up")) return "↑";
		if (matchesKey(data, "down")) return "↓";
		if (matchesKey(data, "left")) return "←";
		if (matchesKey(data, "right")) return "→";
		if (data.length === 1 && data.charCodeAt(0) >= 32) return data;
		if (data.length === 1 && data.charCodeAt(0) < 32) {
			return `C-${String.fromCharCode(data.charCodeAt(0) + 64).toLowerCase()}`;
		}
		return null;
	}
}

// ── Which-key popup builder ─────────────────────────────────────────

function buildWhichKeyLines(theme: Theme): string[] {
	// Arrange in two columns
	const left = LEADER_COMMANDS.slice(0, Math.ceil(LEADER_COMMANDS.length / 2));
	const right = LEADER_COMMANDS.slice(Math.ceil(LEADER_COMMANDS.length / 2));

	const lines: string[] = [];
	lines.push(theme.fg("accent", " ⎵ leader ") + theme.fg("dim", "press a key…"));
	lines.push("");

	const maxRows = Math.max(left.length, right.length);
	for (let i = 0; i < maxRows; i++) {
		let line = "";
		if (i < left.length) {
			const l = left[i]!;
			line += `  ${theme.fg("accent", l.key.padEnd(3))} ${theme.fg("text", l.label)}`;
		}
		// Pad to column 2
		const col2Start = 28;
		const pad = Math.max(1, col2Start - visibleWidth(line));
		line += " ".repeat(pad);
		if (i < right.length) {
			const r = right[i]!;
			line += `${theme.fg("accent", r.key.padEnd(3))} ${theme.fg("text", r.label)}`;
		}
		lines.push(line);
	}

	lines.push("");
	lines.push(theme.fg("dim", "  Esc cancel"));

	return lines;
}

function buildFullHelpOptions(): string[] {
	const categories = ["mode", "nav", "edit", "leader", "other"];
	const options: string[] = [];

	for (const cat of categories) {
		const label = CATEGORY_LABELS[cat] ?? cat;
		options.push(`── ${label} ──`);
		const items = HOTKEYS.filter(h => h.category === cat);
		for (const item of items) {
			options.push(`  ${item.keys.padEnd(10)} ${item.description}`);
		}
	}

	return options;
}

// ── Leader key actions ──────────────────────────────────────────────

function buildLeaderMap(pi: ExtensionAPI, sendEsc: (seq: string) => void, submitCommand: (cmd: string) => void, showFullHelp: () => void): Record<string, () => void> {
	return {
		p: () => submitCommand("/plan"),
		l: () => submitCommand("/learn"),
		m: () => sendEsc("\x1bm"),
		M: () => sendEsc("\x1bp"),
		t: () => submitCommand("/tree"),
		n: () => submitCommand("/new"),
		f: () => submitCommand("/fork"),
		r: () => submitCommand("/resume"),
		e: () => sendEsc("\x0f"),
		T: () => sendEsc("\x1b[Z"),
		R: () => submitCommand("/reload"),
		"?": () => showFullHelp(),
	};
}

// ── UI context shared between editor and extension ──────────────────

interface UIContext {
	updateWidget: () => void;
	showWhichKey: () => void;
	hideWhichKey: () => void;
	showFullHelp: () => void;
}

// ── Vim Editor ──────────────────────────────────────────────────────

function createVimEditor(pi: ExtensionAPI, uiCtx: UIContext) {
	return class VimEditor extends CustomEditor {
		private mode: "normal" | "insert" = "insert";
		private pending: string = "";
		readonly keystrokes = new KeystrokeTracker();
		private leaderMap: Record<string, () => void>;

		constructor(tui: any, theme: any, kb: any) {
			super(tui, theme, kb);
			this.leaderMap = buildLeaderMap(
				pi,
				(seq) => super.handleInput(seq),
				(cmd) => {
					const saved = this.getText();
					this.setText(cmd);
					super.handleInput("\r");
					this.setText(saved);
				},
				() => uiCtx.showFullHelp(),
			);
		}

		getMode() { return this.mode; }
		getPending() { return this.pending; }

		handleInput(data: string): void {
			// Track keystrokes in normal mode
			if (this.mode === "normal") {
				this.keystrokes.push(data);
			}

			// Escape: insert → normal, leader → cancel, normal → abort agent
			if (matchesKey(data, "escape")) {
				if (this.mode === "insert") {
					this.mode = "normal";
					this.pending = "";
					uiCtx.hideWhichKey();
					uiCtx.updateWidget();
					return;
				}
				if (this.pending) {
					this.pending = "";
					uiCtx.hideWhichKey();
					uiCtx.updateWidget();
					return;
				}
				super.handleInput(data);
				uiCtx.updateWidget();
				return;
			}

			// Insert mode: everything passes through
			if (this.mode === "insert") {
				super.handleInput(data);
				return;
			}

			// Normal mode
			this.handleNormal(data);
			uiCtx.updateWidget();
		}

		private handleNormal(data: string) {
			// ── Leader key pending ──
			if (this.pending === "leader") {
				this.pending = "";
				uiCtx.hideWhichKey();
				if (data in this.leaderMap) {
					this.leaderMap[data]!();
					return;
				}
				return;
			}

			// ── Multi-key: dd ──
			if (this.pending === "d") {
				this.pending = "";
				if (data === "d") {
					super.handleInput(ESC.lineStart);
					super.handleInput(ESC.deleteToLineEnd);
					return;
				}
				return;
			}

			// ── Leader key ──
			if (data === LEADER) {
				this.pending = "leader";
				uiCtx.showWhichKey();
				return;
			}

			// ── Single key commands ──
			switch (data) {
				// Mode switching
				case "i": this.mode = "insert"; return;
				case "a": this.mode = "insert"; super.handleInput(ESC.right); return;
				case "I": this.mode = "insert"; super.handleInput(ESC.lineStart); return;
				case "A": this.mode = "insert"; super.handleInput(ESC.lineEnd); return;
				case "o":
					this.mode = "insert";
					super.handleInput(ESC.lineEnd);
					super.handleInput(ESC.newline);
					return;
				case "O":
					this.mode = "insert";
					super.handleInput(ESC.lineStart);
					super.handleInput(ESC.newline);
					super.handleInput(ESC.up);
					return;

				// Navigation
				case "h": super.handleInput(ESC.left); return;
				case "j": super.handleInput(ESC.down); return;
				case "k": super.handleInput(ESC.up); return;
				case "l": super.handleInput(ESC.right); return;
				case "w": super.handleInput(ESC.wordRight); return;
				case "b": super.handleInput(ESC.wordLeft); return;
				case "0": super.handleInput(ESC.lineStart); return;
				case "$": super.handleInput(ESC.lineEnd); return;

				// Editing
				case "x": super.handleInput(ESC.delete); return;
				case "d": this.pending = "d"; return;
				case "u": super.handleInput(ESC.undo); return;

				// Submit
				case "\r":
					super.handleInput("\r");
					this.mode = "insert";
					return;

				// Full help
				case "?":
					uiCtx.showFullHelp();
					return;
			}

			// Pass control sequences through (ctrl+c, ctrl+d, etc.)
			if (data.length === 1 && data.charCodeAt(0) >= 32) return;
			super.handleInput(data);
		}

		render(width: number): string[] {
			const lines = super.render(width);
			if (lines.length === 0) return lines;

			// Status bar: [keystrokes] [pending] [MODE]
			const modeLabel = this.mode === "normal" ? " NORMAL " : " INSERT ";
			const pendingLabel = this.pending === "leader" ? " ⎵… " : this.pending === "d" ? " d… " : "";
			const recentKeys = this.keystrokes.getRecent();
			const keystrokeLabel = recentKeys.length > 0 ? ` ${recentKeys.join(" ")} ` : "";

			const rightSide = keystrokeLabel + pendingLabel + modeLabel;

			const last = lines.length - 1;
			if (visibleWidth(lines[last]!) >= rightSide.length) {
				lines[last] = truncateToWidth(lines[last]!, width - rightSide.length, "") + rightSide;
			}
			return lines;
		}
	}; // end class VimEditor
} // end createVimEditor

// ── Extension entry point ───────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let editorInstance: InstanceType<ReturnType<typeof createVimEditor>> | null = null;
	let storedCtx: any = null;
	let cachedTheme: Theme | null = null;

	const uiCtx: UIContext = {
		showWhichKey: () => {
			if (!storedCtx || !cachedTheme) return;
			const lines = buildWhichKeyLines(cachedTheme);
			storedCtx.ui.setWidget("vim-which-key", lines, { placement: "aboveEditor" });
		},

		hideWhichKey: () => {
			if (!storedCtx) return;
			storedCtx.ui.setWidget("vim-which-key", undefined);
		},

		showFullHelp: () => {
			if (!storedCtx) return;
			const options = buildFullHelpOptions();
			storedCtx.ui.select("Normal Mode Hotkeys", options);
		},

		updateWidget: () => {
			if (!storedCtx || !editorInstance) return;
			const mode = editorInstance.getMode();
			const pending = editorInstance.getPending();
			const recent = editorInstance.keystrokes.getRecent();

			// Don't overwrite which-key popup
			if (pending === "leader") return;

			const parts: string[] = [];
			if (mode === "normal") {
				if (pending === "d") parts.push("d…");
				if (recent.length > 0) parts.push(recent.join(" "));
			}

			if (parts.length > 0) {
				storedCtx.ui.setWidget("vim-keystrokes", [parts.join("  ")], { placement: "belowEditor" });
			} else {
				storedCtx.ui.setWidget("vim-keystrokes", undefined);
			}
		},
	};

	const VimEditor = createVimEditor(pi, uiCtx);

	pi.on("session_start", (_event, ctx) => {
		storedCtx = ctx;
		cachedTheme = ctx.ui.theme;
		ctx.ui.setEditorComponent((tui, editorTheme, kb) => {
			editorInstance = new VimEditor(tui, editorTheme, kb);
			return editorInstance;
		});
	});

	pi.registerCommand("keys", {
		description: "Show vim normal mode hotkey reference",
		handler: async (_args, ctx) => {
			const options = buildFullHelpOptions();
			await ctx.ui.select("Normal Mode Hotkeys", options);
		},
	});
}
