import { cleanText, keywordSet } from "../utils/text.js";

const conditionHints = [
  "cancer",
  "disease",
  "syndrome",
  "diabetes",
  "parkinson",
  "alzheimer",
  "asthma",
  "arthritis",
  "depression",
  "epilepsy",
  "hypertension",
  "migraine",
  "sclerosis"
];

function firstMeaningfulPhrase(message) {
  const cleaned = cleanText(message);
  const parts = cleaned.split(/[,.?;]|\babout\b|\bfor\b|\bwith\b/i).map((part) => part.trim());
  return parts.find((part) => part.length >= 4 && part.length <= 80) || "";
}

function isQuestion(message = "") {
  const cleaned = cleanText(message);
  if (!cleaned) return false;
  if (cleaned.includes("?")) return true;
  return /^(what|how|why|when|where|are|is|can|could|should|does|do|did|will|would|may)\b/i.test(cleaned);
}

function extractAgeYears(message = "") {
  const cleaned = cleanText(message);
  const match = cleaned.match(/\b(\d{1,3})\s*(?:yo|y\/o|yr|yrs|year|years)\b/i);
  if (match) return Number.parseInt(match[1], 10);
  const match2 = cleaned.match(/\b(\d{1,3})\s*(?:year|years)\s*old\b/i);
  if (match2) return Number.parseInt(match2[1], 10);
  const match3 = cleaned.match(/\b(\d{1,3})\s*[- ]?\s*year[- ]?old\b/i);
  if (match3) return Number.parseInt(match3[1], 10);
  return null;
}

function expandQueryTerms({ condition, intent, message }) {
  const expansions = new Set();
  const ageYears = extractAgeYears(message);
  if (ageYears !== null && Number.isFinite(ageYears)) {
    expansions.add(`${ageYears} years`);
    expansions.add("young adult");
    expansions.add("early onset");
    expansions.add("juvenile");
    expansions.add("congenital");
  }

  const normalized = cleanText(message).toLowerCase();
  if (normalized.includes("sunlight") || normalized.includes("sun") || normalized.includes("uv")) {
    expansions.add("ultraviolet");
    expansions.add("UV");
    expansions.add("sun exposure");
    expansions.add("eye safety");
  }

  // A small cataract-specific hint: users often ask about sunlight/age; make it easier to retrieve lens-related sources.
  if (condition && condition.toLowerCase().includes("cataract")) {
    expansions.add("lens");
    expansions.add("ophthalmology");
  }

  if (intent) expansions.add(intent);
  if (condition) expansions.add(condition);
  return [...expansions].filter(Boolean);
}

function buildRetrievalQuery({ condition, intent, message }) {
  const expandedTerms = expandQueryTerms({ condition, intent, message });
  // Use keywords as a stable, API-friendly query string (avoid full raw questions).
  const keywords = [...keywordSet(condition, intent, message, ...expandedTerms)];
  const primary = [condition, intent].filter(Boolean).join(" ");
  const keywordString = keywords.slice(0, 14).join(" ");
  const expandedString = expandedTerms.slice(0, 6).join(" ");
  return [primary, keywordString, expandedString].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function extractLocation(message = "") {
  const match = message.match(/\b(?:near|in|around|location:?)\s+([A-Za-z][A-Za-z\s.-]+(?:,\s*[A-Za-z][A-Za-z\s.-]+)?)/i);
  return cleanText(match?.[1] || "");
}

export function extractCondition(message = "") {
  const cleaned = cleanText(message);
  const explicit = cleaned.match(/\b(?:condition|disease|diagnosis)\s*(?:of|is|:)?\s*([A-Za-z][A-Za-z\s'-]{2,80})/i);
  if (explicit) return cleanText(explicit[1]);

  const phrase = firstMeaningfulPhrase(cleaned);
  const lower = phrase.toLowerCase();
  if (conditionHints.some((hint) => lower.includes(hint))) return phrase;
  return "";
}

export function extractIntent(message = "", condition = "") {
  const cleaned = cleanText(message);
  if (!cleaned) return "";

  const withoutCondition = condition ? cleaned.replace(new RegExp(condition, "i"), " ") : cleaned;
  const explicit = withoutCondition.match(/\b(?:focus|query|about|intervention|treatment)\s*(?:is|:)?\s*([A-Za-z0-9][A-Za-z0-9\s'-]{2,100})/i);
  if (explicit) return cleanText(explicit[1]);

  const parts = withoutCondition
    .split(/\b(?:near|in|around|location:?|for|with)\b|[,.?;]/i)
    .map((part) => cleanText(part))
    .filter((part) => part.length >= 4 && part.length <= 100);

  return parts[0] || "";
}

export function buildResearchContext(input, previous = {}) {
  const message = cleanText(input.message || "");
  const isFollowUp = Boolean(previous.condition && !input.disease && !input.additionalQuery);
  const messageIsQuestion = isQuestion(message);
  const isQuestionFollowUp = isFollowUp && messageIsQuestion;
  const condition = cleanText(input.disease || "") || extractCondition(message) || previous.condition || "";
  const extractedIntent = isQuestionFollowUp ? "" : extractIntent(message, condition);
  const structuredIntent = cleanText(input.additionalQuery || "");
  // If the user asks a direct question (especially on the first turn) without a research focus,
  // don't treat the full question text as the "intent/intervention".
  const intent = structuredIntent || (messageIsQuestion ? previous.intent || "" : extractedIntent || previous.intent || "");
  const location = cleanText(input.location || "") || extractLocation(message) || previous.location || "";
  const patientName = cleanText(input.patientName || "") || previous.patientName || "";
  const keywords = [...keywordSet(condition, intent, message)];
  const query = [condition, intent].filter(Boolean).join(" ");
  const retrievalQuery = buildRetrievalQuery({ condition, intent, message });

  return {
    patientName,
    condition,
    intent,
    location,
    query: query || message,
    retrievalQuery: retrievalQuery || query || message,
    question: message,
    keywords,
    isFollowUp,
    updatedAt: new Date().toISOString()
  };
}
