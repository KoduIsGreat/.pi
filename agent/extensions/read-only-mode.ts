import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let enabled = false;
  let savedTools: string[] = [];

  const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];

  function activate(ctx: any) {
    enabled = true;
    savedTools = pi.getActiveTools();
    const activeReadOnly = READ_ONLY_TOOLS.filter((t) =>
      pi.getAllTools().some((tool) => tool.name === t),
    );
    pi.setActiveTools(activeReadOnly);
    ctx.ui.setStatus("read-only-mode", "🔒 Read-Only Mode");
    ctx.ui.setWidget(
      "read-only-mode",
      ["🔒 Read-Only Mode — read-only tools only, no writes or execution"],
      { placement: "aboveEditor" },
    );
  }

  function deactivate(ctx: any) {
    enabled = false;
    pi.setActiveTools(
      savedTools.length > 0 ? savedTools : pi.getAllTools().map((t) => t.name),
    );
    ctx.ui.setStatus("read-only-mode", undefined);
    ctx.ui.setWidget("read-only-mode", undefined);
  }

  pi.on("session_start", async (_event, ctx) => {
    if (enabled) {
      activate(ctx);
    }
  });

  pi.registerCommand("read-only", {
    description: "Toggle read-only mode (disables write/execute tools)",
    handler: async (_args, ctx) => {
      if (enabled) {
        deactivate(ctx);
        ctx.ui.notify("Read-only mode OFF — all tools re-enabled", "info");
      } else {
        activate(ctx);
        ctx.ui.notify("Read-only mode ON — read-only tools only", "info");
      }
    },
  });

  pi.registerShortcut("ctrl+alt+l", {
    description: "Toggle read-only mode",
    handler: async (ctx) => {
      if (enabled) {
        deactivate(ctx);
        ctx.ui.notify("Read-only mode OFF — all tools re-enabled", "info");
      } else {
        activate(ctx);
        ctx.ui.notify("Read-only mode ON — read-only tools only", "info");
      }
    },
  });
}
