import { isMongoReady } from "../config/database.js";
import { Conversation } from "../models/Conversation.js";

const memoryStore = new Map();

function emptyConversation(sessionId) {
  return {
    sessionId,
    context: {},
    turns: [],
    cachedRetrieval: {}
  };
}

export async function getConversation(sessionId) {
  if (isMongoReady()) {
    const existing = await Conversation.findOne({ sessionId }).lean();
    return existing || emptyConversation(sessionId);
  }

  return memoryStore.get(sessionId) || emptyConversation(sessionId);
}

export async function saveConversation(conversation) {
  const payload = {
    sessionId: conversation.sessionId,
    context: conversation.context || {},
    turns: conversation.turns || [],
    cachedRetrieval: conversation.cachedRetrieval || {}
  };

  if (isMongoReady()) {
    const saved = await Conversation.findOneAndUpdate(
      { sessionId: payload.sessionId },
      payload,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return saved;
  }

  memoryStore.set(payload.sessionId, payload);
  return payload;
}
