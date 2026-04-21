import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let enabled = false;
  let savedTools: string[] = [];

  const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];

  const LEARN_SYSTEM_PROMPT = `You are a patient, knowledgeable learning companion. Your role is to help the user understand concepts deeply through discussion, explanation, and Socratic dialogue.

Guidelines:
- Explain concepts clearly, using analogies and examples when helpful
- Ask clarifying questions to understand what the user already knows
- Break complex topics into digestible pieces
- When the user asks "how" something works, walk through the reasoning step by step
- Encourage the user to think through problems before giving answers
- Correct misconceptions gently and explain why
- Suggest related topics or follow-up questions to deepen understanding
- Use code snippets in your explanations when relevant, but only as illustrations — never execute or modify any files
- If the user asks you to perform an action (edit files, run commands, etc.), remind them that you're in learn mode and redirect toward discussion

You have access to read-only tools (read, grep, find, ls) so you can examine code and files to help explain concepts. You MUST NOT create, edit, write, or execute anything. You are here for exploration and learning only.`;

  function activate(ctx: any) {
    enabled = true;
    savedTools = pi.getActiveTools();
    const activeReadOnly = READ_ONLY_TOOLS.filter((t) =>
      pi.getAllTools().some((tool) => tool.name === t),
    );
    pi.setActiveTools(activeReadOnly);
    ctx.ui.setStatus("learn-mode", "📚 Learn Mode");
    ctx.ui.setWidget(
      "learn-mode",
      ["📚 Learn Mode — read-only tools only, no writes or execution"],
      { placement: "aboveEditor" },
    );
  }

  function deactivate(ctx: any) {
    enabled = false;
    pi.setActiveTools(
      savedTools.length > 0 ? savedTools : pi.getAllTools().map((t) => t.name),
    );
    ctx.ui.setStatus("learn-mode", undefined);
    ctx.ui.setWidget("learn-mode", undefined);
  }

  pi.on("session_start", async (_event, ctx) => {
    if (enabled) {
      activate(ctx);
    }
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    if (enabled) {
      return { systemPrompt: LEARN_SYSTEM_PROMPT };
    }
  });

  pi.registerCommand("learn", {
    description: "Toggle learn mode (discussion only, no tools)",
    handler: async (_args, ctx) => {
      if (enabled) {
        deactivate(ctx);
        ctx.ui.notify("Learn mode OFF — tools re-enabled", "info");
      } else {
        activate(ctx);
        ctx.ui.notify(
          "Learn mode ON — read-only tools only",
          "info",
        );
      }
    },
  });

  pi.registerShortcut("ctrl+alt+l", {
    description: "Toggle learn mode",
    handler: async (ctx) => {
      if (enabled) {
        deactivate(ctx);
        ctx.ui.notify("Learn mode OFF — tools re-enabled", "info");
      } else {
        activate(ctx);
        ctx.ui.notify(
          "Learn mode ON — read-only tools only",
          "info",
        );
      }
    },
  });
}
