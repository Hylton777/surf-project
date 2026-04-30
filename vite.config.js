import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "anthropic-dev-proxy",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.method !== "POST" || !req.url?.startsWith("/api/anthropic/messages")) {
              return next();
            }

            const key = (env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "").trim();
            if (!key) {
              res.statusCode = 503;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: {
                    message:
                      "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart npm run dev.",
                  },
                })
              );
              return;
            }

            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const body = Buffer.concat(chunks).toString("utf8");

            try {
              const r = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-api-key": key,
                  "anthropic-version": "2023-06-01",
                },
                body,
              });
              const buf = Buffer.from(await r.arrayBuffer());
              res.statusCode = r.status;
              const ct = r.headers.get("content-type") || "application/json";
              res.setHeader("Content-Type", ct);
              res.end(buf);
            } catch (e) {
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  error: { message: e?.message || "Anthropic proxy request failed" },
                })
              );
            }
          });
        },
      },
    ],
  };
});
