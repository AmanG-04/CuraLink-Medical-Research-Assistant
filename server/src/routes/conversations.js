import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../services/auth.js";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  updateWorkspaceMetadata,
} from "../services/conversationStore.js";

export const conversationsRouter = Router();
conversationsRouter.use(requireUser);
conversationsRouter.get("/", async (req, res, next) => {
  try {
    res.json({ workspaces: await listConversations(req.user.id) });
  } catch (error) {
    next(error);
  }
});
conversationsRouter.post("/", async (req, res, next) => {
  try {
    const input = z
      .object({
        title: z.string().trim().min(1).max(100),
        userType: z.enum(["patient", "clinician"]),
      })
      .parse(req.body);
    res
      .status(201)
      .json(await createConversation(req.user.id, input.title, input.userType));
  } catch (error) {
    next(error);
  }
});
conversationsRouter.get("/:sessionId", async (req, res, next) => {
  try {
    const conversation = await getConversation(
      req.params.sessionId,
      req.user.id,
    );
    if (!conversation)
      return res.status(404).json({ error: "Workspace not found." });
    const publicConversation = { ...conversation };
    delete publicConversation.cachedRetrieval;
    res.json(publicConversation);
  } catch (error) {
    next(error);
  }
});
conversationsRouter.patch("/:sessionId", async (req, res, next) => {
  try {
    const conversation = await getConversation(
      req.params.sessionId,
      req.user.id,
    );
    if (!conversation)
      return res.status(404).json({ error: "Workspace not found." });
    const input = z
      .object({
        title: z.string().trim().min(1).max(100).optional(),
        notes: z.string().max(20000).optional(),
        bookmarkId: z.string().max(300).optional(),
        removeBookmarkId: z.string().max(300).optional(),
      })
      .parse(req.body);
    if (input.bookmarkId) {
      const source = [
        ...(conversation.trialSearch?.results || []),
        ...conversation.turns.flatMap((turn) => [
          ...(turn.sources?.publications || []),
          ...(turn.sources?.clinicalTrials || []),
        ]),
      ].find((item) => item.id === input.bookmarkId);
      if (!source)
        return res
          .status(400)
          .json({ error: "That source is not part of this workspace." });
      if (!conversation.bookmarks.some((item) => item.id === source.id)) {
        if (conversation.bookmarks.length >= 40)
          return res
            .status(409)
            .json({ error: "A workspace can hold up to 40 bookmarks." });
        conversation.bookmarks.push(source);
      }
    }
    if (input.removeBookmarkId)
      conversation.bookmarks = conversation.bookmarks.filter(
        (item) => item.id !== input.removeBookmarkId,
      );
    const saved = await updateWorkspaceMetadata(
      conversation.sessionId,
      req.user.id,
      {
        bookmarks: conversation.bookmarks,
        ...(input.title ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    );
    res.json({
      title: saved.title,
      notes: saved.notes,
      bookmarks: saved.bookmarks,
    });
  } catch (error) {
    next(error);
  }
});
conversationsRouter.delete("/:sessionId", async (req, res, next) => {
  try {
    await deleteConversation(req.params.sessionId, req.user.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
