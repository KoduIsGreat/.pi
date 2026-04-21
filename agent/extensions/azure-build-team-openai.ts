import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("azure-build-team-openai", {
    baseUrl: "https://buildteam-resource.cognitiveservices.azure.com/openai",
    apiKey: "AZURE_BUILD_TEAM_OPENAI_API_KEY",
    api: "azure-openai-responses",
    headers: {
      "api-key": "AZURE_BUILD_TEAM_OPENAI_API_KEY",
    },
    models: [
      {
        id: "gpt-5.4",
        name: "GPT-5.4 (Azure Build Team)",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 1047576,
        maxTokens: 32768,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  });
}
