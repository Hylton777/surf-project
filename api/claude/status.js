/**
 * GET /api/claude/status — which Claude upstream is configured (no secrets).
 */
import { getClaudeProviderStatus } from "../../server/claude-upstream.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: { message: "Method not allowed" } }));
    return;
  }

  const status = getClaudeProviderStatus(process.env);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(status));
}
