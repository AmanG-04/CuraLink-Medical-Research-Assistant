const CHAT_ONLY_PATTERNS = [
  /^(hi|hello|hey|yo|hola)\b/i,
  /^(thanks|thank you|thx)\b/i,
  /\bhow are you\b/i,
  /\bwho are you\b/i,
  /\bwhat can you do\b/i
];

const RESEARCH_HINT_PATTERN =
  /\b(research|paper|publication|trial|study|evidence|risk|outcome|disease|condition|treatment|therapy|symptom|diagnosis|drug|intervention|clinical)\b/i;

const FRESHNESS_PATTERN = /\b(latest|recent|new|updated|current|today|this year|recruiting now)\b/i;

function normalizeMessage(message = "") {
  return String(message).trim().toLowerCase();
}

function hasSelectedSources(cachedRetrieval = {}) {
  const selectedSources = cachedRetrieval.selectedSources || {};
  const publicationCount = (selectedSources.publications || []).length;
  const trialCount = (selectedSources.clinicalTrials || []).length;
  return publicationCount + trialCount > 0;
}

function isCacheFresh(cachedRetrieval = {}, maxAgeMinutes = 30, now = new Date()) {
  if (!cachedRetrieval?.cachedAt) return false;
  const cachedAt = new Date(cachedRetrieval.cachedAt);
  if (Number.isNaN(cachedAt.getTime())) return false;
  const ageMs = now.getTime() - cachedAt.getTime();
  return ageMs <= maxAgeMinutes * 60 * 1000;
}

function topicChanged(currentContext, previousContext = {}) {
  const prevCondition = (previousContext.condition || "").toLowerCase();
  const prevIntent = (previousContext.intent || "").toLowerCase();
  const prevLocation = (previousContext.location || "").toLowerCase();
  const nextCondition = (currentContext.condition || "").toLowerCase();
  const nextIntent = (currentContext.intent || "").toLowerCase();
  const nextLocation = (currentContext.location || "").toLowerCase();

  return (
    (nextCondition && prevCondition && nextCondition !== prevCondition) ||
    (nextIntent && prevIntent && nextIntent !== prevIntent) ||
    (nextLocation && prevLocation && nextLocation !== prevLocation)
  );
}

function isConversationalTurn(message, context) {
  const normalizedMessage = normalizeMessage(message);
  if (!normalizedMessage) return false;

  const hasContext = Boolean(context.condition || context.intent || context.symptoms || context.location);
  const looksLikeChatOnly = CHAT_ONLY_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
  const looksResearchOrMedical = RESEARCH_HINT_PATTERN.test(normalizedMessage);

  return !hasContext && looksLikeChatOnly && !looksResearchOrMedical;
}

export function decideResearchPlan({ message, context, conversation, now = new Date() }) {
  const turns = conversation?.turns || [];
  const previousContext = conversation?.context || {};
  const cachedRetrieval = conversation?.cachedRetrieval || {};
  const hasCache = hasSelectedSources(cachedRetrieval);
  const cacheFresh = isCacheFresh(cachedRetrieval, 30, now);
  const normalizedMessage = normalizeMessage(message || context.question || "");

  if (isConversationalTurn(message, context)) {
    return { action: "none", reason: "conversational_turn" };
  }

  if (turns.length === 0) {
    return { action: "fresh", reason: "first_turn" };
  }

  if (topicChanged(context, previousContext)) {
    return { action: "fresh", reason: "topic_shift" };
  }

  if (FRESHNESS_PATTERN.test(normalizedMessage)) {
    return { action: "fresh", reason: "freshness_requested" };
  }

  if (hasCache && cacheFresh) {
    return {
      action: "cached",
      reason: context.isFollowUp ? "follow_up_cached" : "cache_reuse"
    };
  }

  return { action: "fresh", reason: "default_research" };
}

export function noResearchResponse() {
  return [
    "Condition Overview: I can help with evidence-based medical research questions. Share a condition, a focus area, or a follow-up question to begin.",
    "Research Insights: Not enough evidence. No medical research sources were requested for this turn.",
    "Clinical Trials: Not enough evidence. Add a condition and optional location to search ClinicalTrials.gov.",
    "Source Attribution: No sources were retrieved in this turn."
  ].join("\n\n");
}
