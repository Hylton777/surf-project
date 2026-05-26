import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapModelForCloudflare,
  prepareClaudeMessagesBody,
  resolveClaudeCredentials,
} from "./claude-upstream.mjs";

describe("resolveClaudeCredentials", () => {
  it("prefers Cloudflare when token and account id are set", () => {
    const creds = resolveClaudeCredentials({
      CLOUDFLARE_API_TOKEN: "cf-token",
      CLOUDFLARE_ACCOUNT_ID: "acc123",
      ANTHROPIC_API_KEY: "sk-ant",
    });
    assert.equal(creds.provider, "cloudflare");
    assert.ok(creds.messagesUrl.includes("acc123"));
  });

  it("falls back to Anthropic when Cloudflare is incomplete", () => {
    const creds = resolveClaudeCredentials({
      CLOUDFLARE_API_TOKEN: "cf-only",
      ANTHROPIC_API_KEY: "sk-ant",
    });
    assert.equal(creds.provider, "anthropic");
  });
});

describe("mapModelForCloudflare", () => {
  it("prefixes anthropic/ for claude model ids", () => {
    assert.equal(mapModelForCloudflare("claude-sonnet-4-6"), "anthropic/claude-sonnet-4-6");
  });

  it("maps known app aliases", () => {
    assert.equal(
      mapModelForCloudflare("claude-haiku-4-5-20251001"),
      "anthropic/claude-haiku-4-5"
    );
  });
});

describe("prepareClaudeMessagesBody", () => {
  it("rewrites model in JSON body for Cloudflare", () => {
    const out = prepareClaudeMessagesBody(
      JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 10 }),
      { provider: "cloudflare" }
    );
    assert.equal(JSON.parse(out).model, "anthropic/claude-haiku-4-5");
  });
});
