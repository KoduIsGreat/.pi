import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("openai-azure", {
    baseUrl: "https://libreopenai.cognitiveservices.azure.com/openai",
    apiKey: "AZURE_OPENAI_API_KEY",
    api: "azure-openai-responses",
    headers: {
      "api-key": "AZURE_OPENAI_API_KEY",
    },
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o (Azure)",
        reasoning: false,
        input: ["text", "image"],
        contextWindow: 128000,
        maxTokens: 16384,
        cost: { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini (Azure)",
        reasoning: false,
        input: ["text", "image"],
        contextWindow: 128000,
        maxTokens: 16384,
        cost: { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0 },
      },
      {
        id: "gpt-4.1-mini",
        name: "GPT-4.1 Mini (Azure)",
        reasoning: false,
        input: ["text", "image"],
        contextWindow: 1047576,
        maxTokens: 32768,
        cost: { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0 },
      },
      {
        id: "gpt-5-mini",
        name: "GPT-5 Mini (Azure)",
        reasoning: false,
        input: ["text", "image"],
        contextWindow: 1047576,
        maxTokens: 32768,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
      {
        id: "gpt-5.3-codex",
        name: "GPT-5.3 Codex (Azure)",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 1047576,
        maxTokens: 32768,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
      {
        id: "gpt-5.4",
        name: "GPT-5.4 (Azure)",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 1047576,
        maxTokens: 32768,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
      {
        id: "o3",
        name: "o3 (Azure)",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 200000,
        maxTokens: 100000,
        cost: { input: 10, output: 40, cacheRead: 2.5, cacheWrite: 0 },
      },
    ],
  });
}
