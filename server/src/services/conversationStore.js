import { randomUUID } from "node:crypto";
import { isMongoReady } from "../config/database.js";
import { Conversation } from "../models/Conversation.js";

const memoryStore = new Map();
const MAX_WORKSPACES = 30;
export async function getConversation(sessionId, ownerId) {
  const existing = isMongoReady()
    ? await Conversation.findOne({ sessionId, ownerId }).lean()
    : memoryStore.get(sessionId);
  return existing?.ownerId === ownerId ? existing : null;
}
export async function listConversations(ownerId) {
  if (isMongoReady())
    return Conversation.find({ ownerId })
      .select("sessionId title context.userType context.condition updatedAt")
      .sort({ updatedAt: -1 })
      .limit(MAX_WORKSPACES)
      .lean();
  return [...memoryStore.values()]
    .filter((item) => item.ownerId === ownerId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(({ sessionId, title, context, updatedAt }) => ({
      sessionId,
      title,
      context: { userType: context.userType, condition: context.condition },
      updatedAt,
    }));
}
export async function createConversation(ownerId, title, userType) {
  if ((await listConversations(ownerId)).length >= MAX_WORKSPACES)
    throw Object.assign(
      new Error("You can keep up to 30 workspaces. Delete an old one first."),
      { status: 409 },
    );
  return saveConversation({
    sessionId: randomUUID(),
    ownerId,
    title,
    notes: "",
    bookmarks: [],
    context: { userType },
    turns: [],
    cachedRetrieval: {},
  });
}
export async function saveConversation(conversation) {
  const payload = {
    sessionId: conversation.sessionId,
    ownerId: conversation.ownerId,
    title: conversation.title || "Untitled research",
    notes: conversation.notes || "",
    bookmarks: conversation.bookmarks || [],
    context: conversation.context || {},
    turns: (conversation.turns || []).slice(-60),
    cachedRetrieval: conversation.cachedRetrieval || {},
    trialSearch: conversation.trialSearch || null,
    updatedAt: new Date(),
  };
  if (isMongoReady())
    return Conversation.findOneAndUpdate(
      { sessionId: payload.sessionId, ownerId: payload.ownerId },
      payload,
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
  memoryStore.set(payload.sessionId, payload);
  return payload;
}

export async function updateWorkspaceMetadata(sessionId, ownerId, updates) {
  if (isMongoReady())
    return Conversation.findOneAndUpdate(
      { sessionId, ownerId },
      { $set: updates },
      { new: true },
    ).lean();
  const current = await getConversation(sessionId, ownerId);
  if (!current) return null;
  return saveConversation({ ...current, ...updates });
}
export async function deleteConversation(sessionId, ownerId) {
  if (isMongoReady()) return Conversation.deleteOne({ sessionId, ownerId });
  if (memoryStore.get(sessionId)?.ownerId === ownerId)
    return memoryStore.delete(sessionId);
  return false;
}
