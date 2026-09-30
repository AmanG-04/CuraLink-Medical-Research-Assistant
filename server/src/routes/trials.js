import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../services/auth.js";
import {
  getConversation,
  updateWorkspaceMetadata,
} from "../services/conversationStore.js";
import { discoverySchema, discoverTrials } from "../services/trialDiscovery.js";

export const trialsRouter = Router();
trialsRouter.use(requireUser);
const active = new Set();
const calls = new Map();
trialsRouter.post("/search", async (req, res, next) => {
  let acquired = false;
  try {
    const { sessionId, search } = z
      .object({ sessionId: z.string().uuid(), search: discoverySchema })
      .parse(req.body);
    const conversation = await getConversation(sessionId, req.user.id);
    if (!conversation)
      return res.status(404).json({ error: "Workspace not found." });
    if (active.has(req.user.id))
      return res
        .status(409)
        .json({
          error:
            "A trial search is already running. Wait before starting another.",
        });
    const now = Date.now();
    for (const [id, entry] of calls) if (entry.until < now) calls.delete(id);
    const entry = calls.get(req.user.id) || { until: now + 60000, count: 0 };
    if (entry.count >= 5)
      return res
        .status(429)
        .json({ error: "Please wait a minute before searching again." });
    entry.count += 1;
    calls.set(req.user.id, entry);
    active.add(req.user.id);
    acquired = true;
    const trialSearch = await discoverTrials(search);
    const saved = await updateWorkspaceMetadata(sessionId, req.user.id, {
      trialSearch,
      ...(conversation.title === "Untitled research"
        ? { title: `${search.condition} · trial search`.slice(0, 100) }
        : {}),
    });
    if (!saved)
      return res
        .status(404)
        .json({ error: "Workspace was deleted during the search." });
    res.json({ trialSearch, title: saved.title });
  } catch (error) {
    next(error);
  } finally {
    if (acquired) active.delete(req.user.id);
  }
});
