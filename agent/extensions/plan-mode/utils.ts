/**
 * Pure utility functions for plan mode.
 * Extracted for testability.
 */

// Destructive commands blocked in plan mode
const DESTRUCTIVE_PATTERNS = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/(^|[^<])>(?!>)/,
	/>>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

// Safe read-only commands allowed in plan mode
const SAFE_PATTERNS = [
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*less\b/,
	/^\s*more\b/,
	/^\s*grep\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*whereis\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*cal\b/,
	/^\s*uptime\b/,
	/^\s*ps\b/,
	/^\s*top\b/,
	/^\s*htop\b/,
	/^\s*free\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i,
	/^\s*python\s+--version/i,
	/^\s*curl\s/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/,
	/^\s*sed\s+-n/i,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*exa\b/,
];

export function isSafeCommand(command: string): boolean {
	const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
	const isSafe = SAFE_PATTERNS.some((p) => p.test(command));
	return !isDestructive && isSafe;
}

export interface TodoItem {
	step: number;
	text: string;
	completed: boolean;
}

/**
 * Phases of the plan workflow:
 * - brainstorm: Back-and-forth exploration, one question at a time (read-only)
 * - spec: Write a design/spec document from the brainstorm (read-only, writes spec)
 * - plan: Write a detailed implementation plan from the spec (read-only, writes plan)
 * - execute: Implement the plan with progress tracking (full access)
 * - off: Plan mode disabled
 */
export type PlanPhase = "off" | "brainstorm" | "spec" | "plan" | "execute";

export const PHASE_LABELS: Record<PlanPhase, string> = {
	off: "",
	brainstorm: "💬 brainstorm",
	spec: "📐 spec",
	plan: "📋 plan",
	execute: "🚀 execute",
};

export const PHASE_ICONS: Record<PlanPhase, string> = {
	off: "",
	brainstorm: "💬",
	spec: "📐",
	plan: "📋",
	execute: "🚀",
};

export function cleanStepText(text: string): string {
	let cleaned = text
		.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1") // Remove bold/italic
		.replace(/`([^`]+)`/g, "$1") // Remove code
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length > 0) {
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	}
	// Keep enough text for meaningful display but cap for the widget
	if (cleaned.length > 120) {
		cleaned = `${cleaned.slice(0, 117)}...`;
	}
	return cleaned;
}

export function extractTodoItems(message: string): TodoItem[] {
	const items: TodoItem[] = [];
	// Look for a plan header - support multiple formats
	const headerMatch = message.match(/\*{0,2}(?:Implementation\s+)?Plan:\*{0,2}\s*\n/i)
		|| message.match(/^#{1,3}\s+(?:Implementation\s+)?Plan\s*$/im);
	if (!headerMatch) return items;

	const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);

	// Only match TOP-LEVEL numbered steps:
	//  - Must start at beginning of line (no leading whitespace)
	//  - Number followed by . or ) (no letter suffixes like "1e.")
	//  - Must have meaningful text after the number
	// This avoids matching indented sub-steps, lettered sub-items, or
	// code/conditions that happen to start with numbers.
	const numberedPattern = /^(\d+)[.)]\s+\*{0,2}([^*\n]+)/gm;

	for (const match of planSection.matchAll(numberedPattern)) {
		const stepNum = Number(match[1]);
		const text = match[2]
			.trim()
			.replace(/\*{1,2}$/, "")
			.trim();

		// Skip non-step content: too short, code fragments, sub-bullets
		if (text.length < 8) continue;
		if (text.startsWith("`") || text.startsWith("/") || text.startsWith("-")) continue;
		// Skip lines that look like conditions/code (e.g. "If merged == c.Metrics")
		if (/^(if|else|for|while|switch|case|return|var|let|const|func|def|class)\b/i.test(text)) continue;

		const cleaned = cleanStepText(text);
		if (cleaned.length > 5) {
			items.push({ step: stepNum, text: cleaned, completed: false });
		}
	}

	// Re-number sequentially in case plan uses non-sequential numbers
	for (let i = 0; i < items.length; i++) {
		items[i].step = i + 1;
	}

	return items;
}

export function extractDoneSteps(message: string): number[] {
	const steps: number[] = [];
	for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) steps.push(step);
	}
	return steps;
}

export function markCompletedSteps(text: string, items: TodoItem[]): number {
	const doneSteps = extractDoneSteps(text);
	for (const step of doneSteps) {
		const item = items.find((t) => t.step === step);
		if (item) item.completed = true;
	}
	return doneSteps.length;
}
