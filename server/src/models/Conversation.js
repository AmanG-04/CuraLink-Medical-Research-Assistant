import mongoose from "mongoose";

const turnSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    message: { type: String, default: "" },
    answer: { type: String, default: "" },
    structuredInput: { type: mongoose.Schema.Types.Mixed, default: {} },
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
    sources: { type: mongoose.Schema.Types.Mixed, default: {} },
    retrievalStats: { type: mongoose.Schema.Types.Mixed, default: {} },
    researchPlan: { type: mongoose.Schema.Types.Mixed, default: {} },
    generation: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, index: true },
    title: { type: String, default: "Untitled research" },
    notes: { type: String, default: "" },
    bookmarks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
    turns: { type: [turnSchema], default: [] },
    cachedRetrieval: { type: mongoose.Schema.Types.Mixed, default: {} },
    trialSearch: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export const Conversation = mongoose.model("Conversation", conversationSchema);
