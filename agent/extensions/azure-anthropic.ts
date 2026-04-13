import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("azure-anthropic", {
    baseUrl: "https://libreopenai.services.ai.azure.com/anthropic/v1",
    apiKey: "AZURE_ANTHROPIC_API_KEY",
    api: "anthropic-messages",
    headers: {
      "anthropic-version": "2023-06-01",
    },
    models: [
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4 (Azure)",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
        contextWindow: 200000,
        maxTokens: 16384,
      },
    ],
  });
}
