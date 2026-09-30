import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../services/auth.js";
import { buildResearchContext } from "../services/context.js";
import {
  getConversation,
  saveConversation,
} from "../services/conversationStore.js";
import { generateEvidenceResponse } from "../services/llm.js";
import { decideResearchPlan } from "../services/researchPlanner.js";
import { retrieveAndRank } from "../services/retrieval.js";

const text = z.string().max(2000).optional();
const chatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().trim().min(1).max(3000),
  disease: text,
  location: text,
  symptoms: text,
  additionalQuery: text,
  patientAge: text,
  patientMedications: text,
  patientComorbidities: text,
  clinicalQuestionType: text,
  specialtyRole: text,
});
const active = new Set();
const calls = new Map();
const publicCache = new Map();

export const chatRouter = Router();
chatRouter.use(requireUser);
chatRouter.post("/", async (req, res, next) => {
  let lock;
  let acquired = false;
  const streaming = req.headers.accept === "application/x-ndjson";
  function send(event) {
    if (streaming && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
  }
  try {
    const input = chatSchema.parse(req.body);
    const conversation = await getConversation(input.sessionId, req.user.id);
    if (!conversation)
      return res.status(404).json({ error: "Workspace not found." });
    lock = `${req.user.id}:${input.sessionId}`;
    if (active.has(lock))
      return res
        .status(409)
        .json({ error: "Research is already running in this workspace." });
    const now = Date.now();
    for (const [id, timestamps] of calls)
      if (!timestamps.some((time) => now - time < 60000)) calls.delete(id);
    const recent = (calls.get(req.user.id) || []).filter(
      (time) => now - time < 60000,
    );
    if (recent.length >= 5)
      return res
        .status(429)
        .json({ error: "Please wait a minute before starting more research." });
    calls.set(req.user.id, [...recent, now]);
    active.add(lock);
    acquired = true;
    const context = buildResearchContext(
      {
        ...input,
        userType: conversation.context.userType,
        referralMode: conversation.context.userType === "clinician",
      },
      conversation.context,
    );
    if (streaming) {
      res
        .status(200)
        .set({
          "Content-Type": "application/x-ndjson",
          "X-Accel-Buffering": "no",
        });
      res.flushHeaders();
    }
    const plan = decideResearchPlan({
      message: input.message,
      context,
      conversation,
    });
    let retrieval;
    // Cache only context-free provider searches; do not put names/profiles in shared cache keys.
    const cacheable = ![
      context.symptoms,
      context.patientAge,
      context.patientComorbidities,
      context.patientMedications,
      context.specialtyRole,
    ].some(Boolean);
    const wantsFresh = /\b(latest|recent|new|updated|current|today|this year|recruiting now)\b/i.test(input.message);
    const cacheKey = JSON.stringify([
      context.condition,
      context.intent,
      context.location,
      input.message,
    ]);
    for (const [key, entry] of publicCache)
      if (now - entry.time > 15 * 60000) publicCache.delete(key);
    if (plan.action === "cached") {
      retrieval = {
        selectedSources: conversation.cachedRetrieval.selectedSources,
        stats: { ...conversation.cachedRetrieval.stats, fromCache: true },
      };
      send({
        phase: "ranking",
        message: "Reusing the evidence snapshot for this explanation",
      });
    } else if (cacheable && !wantsFresh && publicCache.has(cacheKey)) {
      retrieval = {
        ...publicCache.get(cacheKey).retrieval,
        stats: {
          ...publicCache.get(cacheKey).retrieval.stats,
          fromCache: true,
        },
      };
      send({
        phase: "ranking",
        message: "Using a recent public-source search",
      });
    } else {
      retrieval = await retrieveAndRank(context, fetch, send);
      if (cacheable && retrieval.stats.candidatePoolSize) {
        if (publicCache.size >= 20)
          publicCache.delete(publicCache.keys().next().value);
        publicCache.set(cacheKey, {
          time: now,
          retrieval: {
            selectedSources: retrieval.selectedSources,
            stats: retrieval.stats,
          },
        });
      }
    }
    send({ phase: "generation", message: "Preparing a source-backed answer" });
    const { answer, generation } = await generateEvidenceResponse({
      context,
      message: input.message,
      history: conversation.turns,
      sources: retrieval.selectedSources,
    });
    const createdAt = new Date().toISOString();
    const turn = {
      role: "assistant",
      message: answer,
      answer,
      context,
      sources: retrieval.selectedSources,
      retrievalStats: retrieval.stats,
      researchPlan: plan,
      generation,
      createdAt,
    };
    const current = await getConversation(input.sessionId, req.user.id);
    if (!current) throw new Error("Workspace was deleted during research");
    const saved = await saveConversation({
      ...current,
      context,
      turns: [
        ...conversation.turns,
        { role: "user", message: input.message, createdAt },
        turn,
      ],
      cachedRetrieval: {
        context,
        stats: retrieval.stats,
        selectedSources: retrieval.selectedSources,
        cachedAt: plan.action === "cached" ? conversation.cachedRetrieval.cachedAt : createdAt,
      },
    });
    console.info("Research completed", {
      retrievalMs: retrieval.stats.durationMs,
      generationMs: generation.durationMs,
      mode: generation.mode,
      selected: retrieval.stats.selectedCount,
    });
    const result = { ...saved };
    delete result.cachedRetrieval;
    if (streaming) {
      send({ phase: "complete", workspace: result });
      res.end();
    } else res.json(result);
  } catch (error) {
    if (res.headersSent) {
      send({ phase: "error", error: "Research failed. Please retry." });
      res.end();
    } else next(error);
  } finally {
    if (acquired) active.delete(lock);
  }
});
