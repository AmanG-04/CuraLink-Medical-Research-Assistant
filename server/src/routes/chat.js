import { Router } from "express";
import { z } from "zod";
import { buildResearchContext } from "../services/context.js";
import { getConversation, saveConversation } from "../services/conversationStore.js";
import { generateAnswer } from "../services/llm.js";
import { decideResearchPlan, noResearchResponse } from "../services/researchPlanner.js";
import { retrieveAndRank } from "../services/retrieval.js";

const chatSchema = z.object({
  sessionId: z.string().min(4),
  userType: z.enum(["patient", "clinician"]).optional().default("patient"),
  message: z.string().optional().default(""),
  patientName: z.string().optional().default(""),
  specialtyRole: z.string().optional().default(""),
  disease: z.string().optional().default(""),
  patientAge: z.string().optional().default(""),
  patientComorbidities: z.string().optional().default(""),
  patientMedications: z.string().optional().default(""),
  clinicalQuestionType: z.string().optional().default(""),
  symptoms: z.string().optional().default(""),
  additionalQuery: z.string().optional().default(""),
  location: z.string().optional().default(""),
  referralMode: z.boolean().optional().default(false)
});

export const chatRouter = Router();

chatRouter.post("/", async (req, res, next) => {
  try {
    const input = chatSchema.parse(req.body);
    const conversation = await getConversation(input.sessionId);
    const context = buildResearchContext(input, conversation.context);

    if (!context.query && !context.question) {
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

    const plan = decideResearchPlan({
      message: input.message,
      context,
      conversation
    });

    const emptySources = { publications: [], clinicalTrials: [] };
    const cachedSources = conversation.cachedRetrieval?.selectedSources || emptySources;
    const cachedStats = conversation.cachedRetrieval?.stats || {
      openAlex: { ok: false, count: 0, error: "No cached retrieval" },
      pubMed: { ok: false, count: 0, error: "No cached retrieval" },
      clinicalTrials: { ok: false, count: 0, error: "No cached retrieval" },
      candidatePoolSize: 0,
      selectedCount: 0
    };

    let retrieval = {
      candidates: { publications: [], clinicalTrials: [] },
      selectedSources: emptySources,
      stats: cachedStats
    };

    if (plan.action === "fresh") {
      retrieval = await retrieveAndRank(context);
    } else if (plan.action === "cached") {
      retrieval = {
        candidates: conversation.cachedRetrieval?.candidates || { publications: [], clinicalTrials: [] },
        selectedSources: cachedSources,
        stats: {
          ...cachedStats,
          fromCache: true
        }
      };
    }

    let answer;
    if (plan.action === "none") {
      answer = noResearchResponse();
    } else {
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
    }

    const assistantTurn = {
      role: "assistant",
      message: answer,
      answer,
      context,
      sources: retrieval.selectedSources,
      retrievalStats: retrieval.stats,
      researchPlan: plan,
      createdAt: new Date().toISOString()
    };

    const updatedConversation = {
      ...conversation,
      context,
      turns: [...(conversation.turns || []), userTurn, assistantTurn],
      cachedRetrieval:
        plan.action === "fresh"
          ? {
              context,
              stats: retrieval.stats,
              candidates: retrieval.candidates,
              selectedSources: retrieval.selectedSources,
              cachedAt: new Date().toISOString()
            }
          : conversation.cachedRetrieval || {}
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
