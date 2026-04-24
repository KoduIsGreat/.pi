/**
 * Plan Mode Extension — Phased Workflow
 *
 * A structured workflow inspired by superpowers that guides through:
 *   1. Brainstorm — back-and-forth exploration, one question at a time
 *   2. Spec — write a design document from the brainstorm
 *   3. Plan — write a detailed implementation plan from the spec
 *   4. Execute — implement with progress tracking
 *   5. Simplify — cleanup pass on changed files
 *   6. Review — code review against spec/plan, apply fixes
 *   7. Simplify — final cleanup if review made changes
 *
 * Features:
 * - /plan to start (enters brainstorm phase)
 * - /plan off to disable
 * - /phase to see/change current phase
 * - /todos to see progress during execution
 * - Ctrl+Alt+P shortcut to toggle
 * - Bash restricted to read-only in brainstorm/spec/plan phases
 * - [DONE:n] markers for step completion during execution
 * - Progress tracking widget
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { BRAINSTORM_PROMPT, getExecutionPrompt, PLAN_PROMPT, REVIEW_PROMPT, SIMPLIFY_PROMPT, SPEC_PROMPT } from "./prompts.js";
import {
	extractTodoItems,
	isSafeCommand,
	markCompletedSteps,
	PHASE_ICONS,
	PHASE_LABELS,
	type PlanPhase,
	type TodoItem,
} from "./utils.js";

// Tools
const READONLY_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"];
const SPEC_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire", "write"];
const FULL_TOOLS = ["read", "bash", "edit", "write"];

// Phase transitions
const PHASE_ORDER: PlanPhase[] = ["brainstorm", "spec", "plan", "execute", "simplify", "review"];
const READONLY_PHASES: PlanPhase[] = ["brainstorm"];

// Transition signals the agent includes in its response
const TRANSITION_SIGNALS: Record<string, PlanPhase> = {
	"ready to write the spec": "spec",
	"spec approved. ready to write the implementation plan": "plan",
	"ready to write the implementation plan": "plan",
	"plan approved. ready to execute": "execute",
	"ready to execute": "execute",
	"all steps complete": "simplify",
	"execution complete": "simplify",
	"simplify complete. ready for review": "review",
	"simplify complete": "review",
	"review complete. changes were made": "simplify",
	"review complete. no changes needed": "off",
};

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

export default function planModeExtension(pi: ExtensionAPI): void {
	let phase: PlanPhase = "off";
	let todoItems: TodoItem[] = [];
	let postReviewSimplify = false; // true when simplify is running after review fixes

	pi.registerFlag("plan", {
		description: "Start in plan mode (brainstorm phase)",
		type: "boolean",
		default: false,
	});

	// --- UI Helpers ---

	function applyToolsForPhase(): void {
		if (phase === "off" || phase === "execute" || phase === "simplify" || phase === "review") {
			// Full access — use all registered tools so extension-provided tools (e.g. subagent) pass through.
			pi.setActiveTools(pi.getAllTools().map((t: { name: string }) => t.name));
		} else if (phase === "spec" || phase === "plan") {
			pi.setActiveTools(SPEC_TOOLS);
		} else {
			pi.setActiveTools(READONLY_TOOLS);
		}
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (phase === "execute" && todoItems.length > 0) {
			const completed = todoItems.filter((t) => t.completed).length;
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", `${PHASE_ICONS.execute} ${completed}/${todoItems.length}`));
		} else if (phase !== "off") {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", PHASE_LABELS[phase]));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}

		// Widget for execution todos
		if (phase === "execute" && todoItems.length > 0) {
			const lines = todoItems.map((item) => {
				if (item.completed) {
					return (
						ctx.ui.theme.fg("success", "☑ ") + ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))
					);
				}
				return `${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`;
			});
			ctx.ui.setWidget("plan-todos", lines);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function setPhase(newPhase: PlanPhase, ctx: ExtensionContext): void {
		phase = newPhase;
		if (newPhase === "off") {
			todoItems = [];
		}
		applyToolsForPhase();
		updateStatus(ctx);
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			phase,
			todos: todoItems,
			postReviewSimplify,
		});
	}

	// --- Commands ---

	pi.registerCommand("plan", {
		description: "Start plan mode (brainstorm → spec → plan → execute → simplify → review) or /plan off to disable",
		handler: async (args, ctx) => {
			const arg = args?.trim().toLowerCase();

			if (arg === "off" || (phase !== "off" && !arg)) {
				// Toggle off
				setPhase("off", ctx);
				ctx.ui.notify("Plan mode disabled. Full access restored.");
				persistState();
				return;
			}

			if (phase === "off") {
				// Start fresh — enter brainstorm phase
				setPhase("brainstorm", ctx);
				ctx.ui.notify("Plan mode: brainstorm phase. Explore the idea, ask questions one at a time.");
				persistState();
				return;
			}

			// Already in a phase — show current
			ctx.ui.notify(`Currently in ${PHASE_LABELS[phase]} phase. Use /plan off to disable.`);
		},
	});

	pi.registerCommand("phase", {
		description: "Show or change the current plan phase",
		handler: async (args, ctx) => {
			const arg = args?.trim().toLowerCase();

			if (!arg) {
				if (phase === "off") {
					ctx.ui.notify("Not in plan mode. Use /plan to start.");
				} else {
					ctx.ui.notify(`Current phase: ${PHASE_LABELS[phase]}\nPhases: brainstorm → spec → plan → execute → simplify → review`);
				}
				return;
			}

			// Allow jumping to a specific phase
			if (PHASE_ORDER.includes(arg as PlanPhase)) {
				setPhase(arg as PlanPhase, ctx);
				ctx.ui.notify(`Switched to ${PHASE_LABELS[phase]} phase.`);
				persistState();
				return;
			}

			ctx.ui.notify(`Unknown phase "${arg}". Valid: brainstorm, spec, plan, execute`);
		},
	});

	pi.registerCommand("todos", {
		description: "Show current plan todo list",
		handler: async (_args, ctx) => {
			if (todoItems.length === 0) {
				ctx.ui.notify("No todos. Run through brainstorm → spec → plan first.", "info");
				return;
			}
			const list = todoItems.map((item, i) => `${i + 1}. ${item.completed ? "✓" : "○"} ${item.text}`).join("\n");
			ctx.ui.notify(`Plan Progress:\n${list}`, "info");
		},
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => {
			if (phase === "off") {
				setPhase("brainstorm", ctx);
				ctx.ui.notify("Plan mode: brainstorm phase.");
			} else {
				setPhase("off", ctx);
				ctx.ui.notify("Plan mode disabled.");
			}
			persistState();
		},
	});

	// --- Block destructive bash in read-only phases ---

	pi.on("tool_call", async (event) => {
		if (!READONLY_PHASES.includes(phase) || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason: `${PHASE_LABELS[phase]} phase: command blocked (read-only). Use /plan off or advance to execute phase.\nCommand: ${command}`,
			};
		}
	});

	// --- Filter stale plan context from messages when off ---

	pi.on("context", async (event) => {
		if (phase !== "off") return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType?.startsWith("plan-")) return false;
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					return !content.match(/\[(BRAINSTORM|SPEC|PLAN|EXECUTION|SIMPLIFY|REVIEW) PHASE/);
				}
				if (Array.isArray(content)) {
					return !content.some(
						(c) => c.type === "text" && (c as TextContent).text?.match(/\[(BRAINSTORM|SPEC|PLAN|EXECUTION|SIMPLIFY|REVIEW) PHASE/),
					);
				}
				return true;
			}),
		};
	});

	// --- Inject phase-specific context ---

	pi.on("before_agent_start", async () => {
		if (phase === "off") return;

		const prompts: Record<string, string> = {
			brainstorm: BRAINSTORM_PROMPT,
			spec: SPEC_PROMPT,
			plan: PLAN_PROMPT,
			simplify: SIMPLIFY_PROMPT,
			review: REVIEW_PROMPT,
		};

		if (phase === "execute" && todoItems.length > 0) {
			return {
				message: {
					customType: "plan-execution-context",
					content: getExecutionPrompt(todoItems),
					display: false,
				},
			};
		}

		const prompt = prompts[phase];
		if (prompt) {
			return {
				message: {
					customType: `plan-${phase}-context`,
					content: prompt,
					display: false,
				},
			};
		}
	});

	// --- Track execution progress ---

	pi.on("turn_end", async (event, ctx) => {
		if (phase !== "execute" || todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		if (markCompletedSteps(text, todoItems) > 0) {
			updateStatus(ctx);
		}
		persistState();
	});

	// --- Phase transitions after agent finishes ---

	pi.on("agent_end", async (event, ctx) => {
		if (phase === "off" || !ctx.hasUI) return;

		// Check execution completion → auto-transition to simplify
		if (phase === "execute") {
			const allTodosComplete = todoItems.length > 0 && todoItems.every((t) => t.completed);

			// Also detect completion via text signal when todos aren't tracked
			let textSignalComplete = false;
			if (!allTodosComplete) {
				const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
				if (lastAssistant) {
					const lastText = getTextContent(lastAssistant).toLowerCase();
					textSignalComplete = lastText.includes("all steps complete") || lastText.includes("execution complete");
				}
			}

			if (allTodosComplete || textSignalComplete) {
				if (todoItems.length > 0) {
					const completedList = todoItems.map((t) => `~~${t.text}~~`).join("\n");
					pi.sendMessage(
						{ customType: "plan-complete", content: `**Plan Complete!** ✓\n\n${completedList}`, display: true },
						{ triggerTurn: false },
					);
				}

				// Auto-transition to simplify phase
				setPhase("simplify", ctx);
				persistState();

				pi.sendMessage(
					{
						customType: "plan-simplify-start",
						content: "Plan execution complete. Running simplify pass on all changed files.",
						display: true,
					},
					{ triggerTurn: true },
				);
			}
			return;
		}

		// Auto-transitions for simplify and review phases
		if (phase === "simplify" || phase === "review") {
			const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
			if (!lastAssistant) return;
			const lastText = getTextContent(lastAssistant).toLowerCase();

			if (phase === "simplify") {
				if (postReviewSimplify) {
					// Post-review simplify done → workflow complete
					postReviewSimplify = false;
					pi.sendMessage(
						{
							customType: "plan-workflow-complete",
							content: "**Workflow Complete!** ✨ Brainstorm → Spec → Plan → Execute → Simplify → Review → Simplify — all done.",
							display: true,
						},
						{ triggerTurn: false },
					);
					setPhase("off", ctx);
					persistState();
				} else {
					// First simplify done → auto-transition to review
					setPhase("review", ctx);
					persistState();

					pi.sendMessage(
						{
							customType: "plan-review-start",
							content: "Simplify complete. Running code review against spec and plan.",
							display: true,
						},
						{ triggerTurn: true },
					);
				}
				return;
			}

			if (phase === "review") {
				// Check if review made changes
				const madeChanges = lastText.includes("changes were made");

				if (madeChanges) {
					// Review made fixes → run another simplify pass
					postReviewSimplify = true;
					setPhase("simplify", ctx);
					persistState();

					pi.sendMessage(
						{
							customType: "plan-simplify-post-review",
							content: "Review applied fixes. Running final simplify pass on changed files.",
							display: true,
						},
						{ triggerTurn: true },
					);
				} else {
					// No changes from review → done!
					pi.sendMessage(
						{
							customType: "plan-workflow-complete",
							content: "**Workflow Complete!** ✨ Brainstorm → Spec → Plan → Execute → Simplify → Review — all done.",
							display: true,
						},
						{ triggerTurn: false },
					);
					setPhase("off", ctx);
					persistState();
				}
				return;
			}
		}

		// Detect transition signals in the last assistant message
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (!lastAssistant) return;
		const lastText = getTextContent(lastAssistant).toLowerCase();

		// Check for natural transition signals
		let detectedNextPhase: PlanPhase | null = null;
		for (const [signal, nextPhase] of Object.entries(TRANSITION_SIGNALS)) {
			if (lastText.includes(signal)) {
				detectedNextPhase = nextPhase;
				break;
			}
		}

		// For spec and plan phases, always show the review menu after the agent
		// finishes a turn — the agent just wrote a document and the user needs
		// to approve, refine, or continue. For brainstorm, only show menu when
		// a transition signal is detected (to avoid interrupting Q&A flow).
		if (!detectedNextPhase && phase !== "spec" && phase !== "plan") return;

		const phaseIdx = PHASE_ORDER.indexOf(phase);
		const nextPhase = phaseIdx < PHASE_ORDER.length - 1 ? PHASE_ORDER[phaseIdx + 1] : null;

		const options: string[] = [];

		if (nextPhase) {
			const targetLabel = detectedNextPhase ? PHASE_LABELS[detectedNextPhase] : PHASE_LABELS[nextPhase];
			options.push(`→ Move to ${targetLabel} phase`);
		}

		options.push(`↺ Continue in ${PHASE_LABELS[phase]} phase`);
		options.push("✎ Refine (edit and resend)");
		options.push("✗ Exit plan mode");

		const choice = await ctx.ui.select(`${PHASE_LABELS[phase]} — what next?`, options);

		if (!choice) return;

		if (choice.startsWith("→ Move to")) {
			const targetPhase = detectedNextPhase || nextPhase!;

			// If moving to execute, extract todos from the plan
			if (targetPhase === "execute") {
				const planText = getTextContent(lastAssistant);
				const extracted = extractTodoItems(planText);
				if (extracted.length > 0) {
					todoItems = extracted;
					const todoListText = todoItems.map((t, i) => `${i + 1}. ☐ ${t.text}`).join("\n");
					pi.sendMessage(
						{
							customType: "plan-todo-list",
							content: `**Implementation Steps (${todoItems.length}):**\n\n${todoListText}`,
							display: true,
						},
						{ triggerTurn: false },
					);
				}

				setPhase("execute", ctx);
				persistState();

				// Don't include the truncated step text — just tell it to follow the plan
				pi.sendMessage(
					{ customType: "plan-mode-execute", content: "Execute the approved implementation plan. Start from step 1 and work through each step in order.", display: true },
					{ triggerTurn: true },
				);
				return;
			}

			// Moving to spec or plan phase
			setPhase(targetPhase, ctx);
			persistState();

			const phaseMessages: Record<string, string> = {
				spec: "Write the design spec based on our brainstorming discussion above.",
				plan: "Write the detailed implementation plan based on the approved spec above.",
			};
			const msg = phaseMessages[targetPhase] || `Proceed with ${PHASE_LABELS[targetPhase]} phase.`;
			pi.sendMessage(
				{ customType: `plan-${targetPhase}-start`, content: msg, display: true },
				{ triggerTurn: true },
			);
			return;
		}

		if (choice.startsWith("↺ Continue")) {
			// Stay in current phase, let user type their next message naturally
			return;
		}

		if (choice.startsWith("✎ Refine")) {
			const refinement = await ctx.ui.editor(`Refine (${PHASE_LABELS[phase]}):`, "");
			if (refinement?.trim()) {
				pi.sendUserMessage(refinement.trim());
			}
			return;
		}

		if (choice.startsWith("✗ Exit")) {
			setPhase("off", ctx);
			persistState();
			ctx.ui.notify("Plan mode disabled. Full access restored.");
		}
	});

	// --- Restore state on session start/resume ---

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			phase = "brainstorm";
		}

		const entries = ctx.sessionManager.getEntries();

		// Restore persisted state
		const planModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as { data?: { phase?: PlanPhase; todos?: TodoItem[]; postReviewSimplify?: boolean; enabled?: boolean; executing?: boolean } } | undefined;

		if (planModeEntry?.data) {
			// Support legacy format (enabled/executing) for backwards compat
			if (planModeEntry.data.phase) {
				phase = planModeEntry.data.phase;
			} else if (planModeEntry.data.enabled) {
				phase = planModeEntry.data.executing ? "execute" : "brainstorm";
			}
			todoItems = planModeEntry.data.todos ?? todoItems;
			postReviewSimplify = planModeEntry.data.postReviewSimplify ?? false;
		}

		// On resume: re-scan messages to rebuild completion state
		const isResume = planModeEntry !== undefined;
		if (isResume && phase === "execute" && todoItems.length > 0) {
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; customType?: string };
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			const messages: AssistantMessage[] = [];
			for (let i = executeIndex + 1; i < entries.length; i++) {
				const entry = entries[i];
				if (entry.type === "message" && "message" in entry && isAssistantMessage(entry.message as AgentMessage)) {
					messages.push(entry.message as AssistantMessage);
				}
			}
			const allText = messages.map(getTextContent).join("\n");
			markCompletedSteps(allText, todoItems);
		}

		applyToolsForPhase();
		updateStatus(ctx);
	});
}
