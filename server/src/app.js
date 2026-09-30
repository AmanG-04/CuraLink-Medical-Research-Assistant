import cors from "cors";
import express from "express";
import { z } from "zod";
import { authRouter } from "./routes/auth.js";
import { isMongoReady } from "./config/database.js";
import { trialsRouter } from "./routes/trials.js";
import { allowedOrigins } from "./config/env.js";
import { chatRouter } from "./routes/chat.js";
import { conversationsRouter } from "./routes/conversations.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "no-store");
    next();
  });

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const origins = allowedOrigins();
        if (origins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
    }),
  );
  app.use(express.json({ limit: "128kb" }));
  app.use((req, res, next) => {
    if (["POST", "PATCH", "DELETE"].includes(req.method)) {
      if (req.headers.origin && !allowedOrigins().includes(req.headers.origin))
        return res.status(403).json({ error: "Untrusted request origin." });
      if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""))
        return res.status(415).json({ error: "Use application/json." });
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "curalink-api",
      persistence: isMongoReady() ? "mongodb" : "temporary-memory",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/chat", chatRouter);
  app.use("/api/trials", trialsRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/conversations", conversationsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
    const status = error.code === 11000 ? 409 : error.status || 500;
    if (status >= 500)
      console.error("Request failed", { name: error.name, status });
    res.status(status).json({
      error:
        status < 500
          ? error.message
          : "CuraLink could not complete this request. Please retry.",
    });
  });

  return app;
}
