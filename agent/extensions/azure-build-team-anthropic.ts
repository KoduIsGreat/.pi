import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("azure-build-team-anthropic", {
    baseUrl: "https://efran-mo1mst47-swedencentral.services.ai.azure.com/anthropic",
    apiKey: "AZURE_BUILD_TEAM_ANTHROPIC_API_KEY",
    api: "anthropic-messages",
    headers: {
      "anthropic-version": "2023-06-01",
    },
    models: [
      {
        id: "claude-opus-4-6-2",
        name: "Claude Opus 4.6-2 (Azure Build Team)",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
        contextWindow: 200000,
        maxTokens: 32000,
      },
      {
        id: "claude-opus-4-7",
        name: "Claude Opus 4.7 (Azure Build Team)",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
        contextWindow: 200000,
        maxTokens: 32000,
      },
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6 (Azure Build Team)",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
        contextWindow: 200000,
        maxTokens: 16384,
      },
    ],
  });
}
