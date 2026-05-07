import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("openai", {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "OPENAI_API_KEY",
    api: "openai-responses",
    models: [
      {
        id: "gpt-5",
        name: "GPT-5",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 400000,
        maxTokens: 128000,
        cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
      },
      {
        id: "gpt-5-mini",
        name: "GPT-5 mini",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 400000,
        maxTokens: 128000,
        cost: { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0 },
      },
      {
        id: "gpt-5-codex",
        name: "GPT-5-Codex",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 400000,
        maxTokens: 128000,
        cost: { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
      },
      {
        id: "codex-mini-latest",
        name: "codex-mini-latest",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 200000,
        maxTokens: 100000,
        cost: { input: 1.5, output: 6, cacheRead: 0.375, cacheWrite: 0 },
      },
    ],
  });
}
