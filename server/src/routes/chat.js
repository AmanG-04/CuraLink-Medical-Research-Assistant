import { Router } from "express";
import { z } from "zod";
import { buildResearchContext } from "../services/context.js";
import { getConversation, saveConversation } from "../services/conversationStore.js";
import { generateAnswer } from "../services/llm.js";
import { retrieveAndRank } from "../services/retrieval.js";

const chatSchema = z.object({
  sessionId: z.string().min(4),
  message: z.string().optional().default(""),
  patientName: z.string().optional().default(""),
  disease: z.string().optional().default(""),
  additionalQuery: z.string().optional().default(""),
  location: z.string().optional().default("")
});

export const chatRouter = Router();

chatRouter.post("/", async (req, res, next) => {
  try {
    const input = chatSchema.parse(req.body);
    const conversation = await getConversation(input.sessionId);
    const context = buildResearchContext(input, conversation.context);

    if (!context.query) {
      return res.status(400).json({
        error: "Please provide a disease, research focus, or natural-language question."
      });
    }

    const userTurn = {
      role: "user",
      message: input.message || [input.disease, input.additionalQuery].filter(Boolean).join(" - "),
      structuredInput: input,
      context,
      createdAt: new Date().toISOString()
    };

    const retrieval = await retrieveAndRank(context);
    let answer;
    try {
      answer = await generateAnswer({
        context,
        message: input.message,
        history: conversation.turns,
        sources: retrieval.selectedSources,
        stats: retrieval.stats
      });
    } catch (error) {
      return res.status(502).json({
        error: "LLM generation failed. CuraLink is configured to require the LLM.",
        details: error.message
      });
    }

    const assistantTurn = {
      role: "assistant",
      message: answer,
      answer,
      context,
      sources: retrieval.selectedSources,
      retrievalStats: retrieval.stats,
      createdAt: new Date().toISOString()
    };

    const updatedConversation = {
      ...conversation,
      context,
      turns: [...(conversation.turns || []), userTurn, assistantTurn],
      cachedRetrieval: {
        context,
        stats: retrieval.stats,
        candidates: retrieval.candidates,
        selectedSources: retrieval.selectedSources,
        cachedAt: new Date().toISOString()
      }
    };

    const saved = await saveConversation(updatedConversation);
    res.json({
      sessionId: saved.sessionId,
      context: saved.context,
      turns: saved.turns,
      sources: retrieval.selectedSources,
      retrievalStats: retrieval.stats
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid chat payload", details: error.flatten() });
    }
    next(error);
  }
});
