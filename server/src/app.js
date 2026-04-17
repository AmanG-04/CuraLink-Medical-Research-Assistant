import cors from "cors";
import express from "express";
import { allowedOrigins } from "./config/env.js";
import { chatRouter } from "./routes/chat.js";
import { conversationsRouter } from "./routes/conversations.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const origins = allowedOrigins();
        if (origins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      }
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "curalink-api", timestamp: new Date().toISOString() });
  });

  app.use("/api/chat", chatRouter);
  app.use("/api/conversations", conversationsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({
      error: "CuraLink could not complete this request.",
      details: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  });

  return app;
}
