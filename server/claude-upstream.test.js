import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CLOUDFLARE_GATEWAY_ID,
  anthropicMessagesBodyToOpenAI,
  applyConfiguredModel,
  getClaudeProviderStatus,
  normalizeWorkersAiModelId,
  openAIChatCompletionToAnthropic,
  isModelNotFoundError,
  mapModelForGateway,
  mapModelForRest,
  parseClaudeErrorMessage,
  preferWorkersAi,
  prepareClaudeMessagesBody,
  resolveClaudeCredentials,
  resolveCloudflareModel,
  toRestCredentials,
} from "./claude-upstream.mjs";

describe("resolveClaudeCredentials", () => {
  it("prefers Cloudflare AI Gateway when token and account id are set", () => {
    const creds = resolveClaudeCredentials({
      CLOUDFLARE_API_TOKEN: "cf-token",
      CLOUDFLARE_ACCOUNT_ID: "acc123",
      ANTHROPIC_API_KEY: "sk-ant",
    });
    assert.equal(creds.provider, "cloudflare-gateway");
    assert.equal(creds.gatewayId, DEFAULT_CLOUDFLARE_GATEWAY_ID);
    assert.ok(creds.messagesUrl.includes("gateway.ai.cloudflare.com"));
    assert.ok(creds.messagesUrl.includes("acc123"));
    assert.ok(creds.messagesUrl.includes(DEFAULT_CLOUDFLARE_GATEWAY_ID));
  });

  it("uses Workers AI chat completions when CLOUDFLARE_MODEL is @cf/*", () => {
    const creds = resolveClaudeCredentials({
      CLOUDFLARE_API_TOKEN: "cf-token",
      CLOUDFLARE_ACCOUNT_ID: "acc123",
      CLOUDFLARE_MODEL: "@cf/meta/llama-3.1-70b-instruct",
      ANTHROPIC_API_KEY: "sk-ant",
    });
    assert.equal(creds.provider, "cloudflare-workers-chat");
    assert.ok(creds.messagesUrl.includes("api.cloudflare.com"));
    assert.ok(creds.messagesUrl.includes("/ai/v1/chat/completions"));
  });

  it("uses custom gateway id when provided", () => {
    const creds = resolveClaudeCredentials({
      CLOUDFLARE_API_TOKEN: "cf-token",
      CLOUDFLARE_ACCOUNT_ID: "acc123",
      CLOUDFLARE_AI_GATEWAY_ID: "my-gateway",
    });
    assert.equal(creds.gatewayId, "my-gateway");
    assert.ok(creds.messagesUrl.includes("/my-gateway/"));
  });

  it("falls back to Anthropic when Cloudflare is incomplete", () => {
    const creds = resolveClaudeCredentials({
      CLOUDFLARE_API_TOKEN: "cf-only",
      ANTHROPIC_API_KEY: "sk-ant",
    });
    assert.equal(creds.provider, "anthropic");
  });
});

describe("toRestCredentials", () => {
  it("builds account REST URL", () => {
    const gateway = resolveClaudeCredentials({
      CLOUDFLARE_API_TOKEN: "t",
      CLOUDFLARE_ACCOUNT_ID: "acc",
    });
    const rest = toRestCredentials(gateway);
    assert.equal(rest.provider, "cloudflare-rest");
    assert.ok(rest.messagesUrl.includes("api.cloudflare.com"));
    assert.ok(rest.messagesUrl.includes("/ai/v1/messages"));
  });
});

describe("mapModelForGateway", () => {
  it("strips anthropic/ prefix and maps sonnet 4.6", () => {
    assert.equal(mapModelForGateway("claude-sonnet-4-6"), "claude-sonnet-4-5");
    assert.equal(mapModelForGateway("anthropic/claude-sonnet-4-6"), "claude-sonnet-4-5");
    assert.equal(mapModelForGateway("anthropic/claude-sonnet-4-5"), "claude-sonnet-4-5");
  });

  it("maps haiku dated id", () => {
    assert.equal(mapModelForGateway("claude-haiku-4-5-20251001"), "claude-haiku-4-5");
  });
});

describe("mapModelForRest", () => {
  it("uses anthropic/ prefix for REST API", () => {
    assert.equal(mapModelForRest("claude-sonnet-4-6"), "anthropic/claude-sonnet-4-5");
  });

  it("passes through @cf model ids", () => {
    assert.equal(mapModelForRest("@cf/meta/llama-3.1-70b-instruct"), "@cf/meta/llama-3.1-70b-instruct");
  });
});

describe("applyConfiguredModel", () => {
  it("overrides request model from CLOUDFLARE_MODEL", () => {
    const body = applyConfiguredModel(
      { model: "claude-haiku-4-5-20251001", max_tokens: 10 },
      { CLOUDFLARE_MODEL: "@cf/meta/llama-3.1-70b-instruct" }
    );
    assert.equal(body.model, "@cf/meta/llama-3.1-70b-instruct");
  });
});

describe("preferWorkersAi", () => {
  it("is true when Cloudflare creds and @cf model are set", () => {
    assert.equal(
      preferWorkersAi({
        CLOUDFLARE_API_TOKEN: "t",
        CLOUDFLARE_ACCOUNT_ID: "acc",
        CLOUDFLARE_MODEL: "@cf/meta/llama-3.1-70b-instruct",
      }),
      true
    );
  });

  it("is true when Cloudflare creds and cf/ model without @ are set", () => {
    assert.equal(
      preferWorkersAi({
        CLOUDFLARE_API_TOKEN: "t",
        CLOUDFLARE_ACCOUNT_ID: "acc",
        CLOUDFLARE_MODEL: "cf/meta/llama-3.1-70b-instruct",
      }),
      true
    );
  });

  it("is false when model is Claude", () => {
    assert.equal(
      preferWorkersAi({
        CLOUDFLARE_API_TOKEN: "t",
        CLOUDFLARE_ACCOUNT_ID: "acc",
        CLOUDFLARE_MODEL: "claude-haiku-4-5",
      }),
      false
    );
  });
});

describe("resolveCloudflareModel", () => {
  it("reads CLOUDFLARE_MODEL from env", () => {
    assert.equal(
      resolveCloudflareModel({ CLOUDFLARE_MODEL: "@cf/meta/llama-3.1-70b-instruct" }),
      "@cf/meta/llama-3.1-70b-instruct"
    );
  });

  it("adds @ when host stripped it from Workers AI model id", () => {
    assert.equal(
      resolveCloudflareModel({ CLOUDFLARE_MODEL: "cf/meta/llama-3.1-70b-instruct" }),
      "@cf/meta/llama-3.1-70b-instruct"
    );
  });
});

describe("normalizeWorkersAiModelId", () => {
  it("leaves claude ids unchanged", () => {
    assert.equal(normalizeWorkersAiModelId("claude-haiku-4-5"), "claude-haiku-4-5");
  });
});

describe("anthropicMessagesBodyToOpenAI", () => {
  it("maps system and user messages for Workers AI", () => {
    const openAi = anthropicMessagesBodyToOpenAI({
      model: "@cf/meta/llama-3.1-70b-instruct",
      max_tokens: 64,
      system: "You are helpful.",
      messages: [{ role: "user", content: "Hi" }],
    });
    assert.equal(openAi.model, "@cf/meta/llama-3.1-70b-instruct");
    assert.equal(openAi.messages[0].role, "system");
    assert.equal(openAi.messages[1].content, "Hi");
  });
});

describe("openAIChatCompletionToAnthropic", () => {
  it("maps assistant text to Anthropic content blocks", () => {
    const out = openAIChatCompletionToAnthropic({
      id: "cmpl-1",
      model: "@cf/meta/llama-3.1-70b-instruct",
      choices: [{ message: { role: "assistant", content: "ok" } }],
    });
    assert.equal(out.content[0].text, "ok");
  });
});

describe("prepareClaudeMessagesBody", () => {
  it("rewrites model for gateway without anthropic prefix", () => {
    const creds = resolveClaudeCredentials({
      CLOUDFLARE_API_TOKEN: "t",
      CLOUDFLARE_ACCOUNT_ID: "acc",
    });
    const out = prepareClaudeMessagesBody(
      JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 10 }),
      creds,
      mapModelForGateway
    );
    assert.equal(JSON.parse(out).model, "claude-haiku-4-5");
  });
});

describe("parseClaudeErrorMessage", () => {
  it("extracts nested Cloudflare error message", () => {
    const msg = parseClaudeErrorMessage(400, "", {
      errors: [{ message: "Model not found: anthropic/claude-sonnet-4-5" }],
    });
    assert.ok(msg.includes("Model not found"));
  });
});

describe("isModelNotFoundError", () => {
  it("detects model not found strings", () => {
    assert.equal(isModelNotFoundError(400, "Model not found: foo"), true);
    assert.equal(isModelNotFoundError(500, "internal error"), false);
  });
});

describe("getClaudeProviderStatus", () => {
  it("reports gateway host when configured", () => {
    const status = getClaudeProviderStatus({
      CLOUDFLARE_API_TOKEN: "t",
      CLOUDFLARE_ACCOUNT_ID: "acc",
    });
    assert.equal(status.configured, true);
    assert.equal(status.provider, "cloudflare-gateway");
    assert.equal(status.gatewayId, DEFAULT_CLOUDFLARE_GATEWAY_ID);
    assert.equal(status.messagesHost, "gateway.ai.cloudflare.com");
    assert.equal(status.workersAi, false);
  });

  it("reports Workers AI when @cf model is configured", () => {
    const status = getClaudeProviderStatus({
      CLOUDFLARE_API_TOKEN: "t",
      CLOUDFLARE_ACCOUNT_ID: "acc",
      CLOUDFLARE_MODEL: "@cf/meta/llama-3.1-70b-instruct",
    });
    assert.equal(status.provider, "cloudflare-workers-chat");
    assert.equal(status.workersAi, true);
    assert.equal(status.model, "@cf/meta/llama-3.1-70b-instruct");
    assert.equal(status.messagesHost, "api.cloudflare.com");
  });
});
