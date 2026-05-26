import { getClaudeProviderStatus } from "./claude-upstream.mjs";

/** @param {import("http").IncomingMessage} _req @param {import("http").ServerResponse} res @param {Record<string, string | undefined>} env */
export function handleClaudeStatus(_req, res, env = process.env) {
  const status = getClaudeProviderStatus(env);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(status));
}
