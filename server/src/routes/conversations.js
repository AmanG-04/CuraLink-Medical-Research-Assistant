import { Router } from "express";
import { deleteConversation, getConversation } from "../services/conversationStore.js";

export const conversationsRouter = Router();

conversationsRouter.get("/:sessionId", async (req, res, next) => {
  try {
    const conversation = await getConversation(req.params.sessionId);
    res.json({
      sessionId: conversation.sessionId,
      context: conversation.context || {},
      turns: conversation.turns || []
    });
  } catch (error) {
    next(error);
  }
});

conversationsRouter.delete("/:sessionId", async (req, res, next) => {
  try {
    await deleteConversation(req.params.sessionId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
