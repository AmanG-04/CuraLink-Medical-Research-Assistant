import { config } from "../config/env.js";
import { keywordSet, truncate } from "../utils/text.js";

const SECTION_ORDER = [
  "Condition Overview",
  "Research Insights",
  "Clinical Trials",
  "Source Attribution"
];

const REQUIRED_HEADINGS = SECTION_ORDER.map((heading) => `${heading}:`);

function sourceLine(source, index) {
  if (source.type === "publication") {
    return `[P${index + 1}] ${source.title} (${source.source}, ${source.year || "year unknown"}). ${truncate(source.summary, 420)} URL: ${source.url}`;
  }

  const conflictNote = source.eligibilityConflict
    ? ` Eligibility flag: ${truncate((source.eligibilityConflictReasons || []).join(" "), 220)}`
    : "";
  return `[T${index + 1}] ${source.title} (${source.status}). Location: ${source.location || "not listed"}. Eligibility: ${truncate(source.eligibility, 360)}.${conflictNote} URL: ${source.url}`;
}

export function buildLlmPrompt({ context, message, history, sources }) {
  const publications = sources.publications || [];
  const clinicalTrials = sources.clinicalTrials || [];
  const recentHistory = (history || [])
    .slice(-6)
    .map((turn) => `${turn.role}: ${turn.message || turn.answer || ""}`)
    .join("\n");

  const question = message || context.question || context.query;
  const isClinician = context.userType === "clinician";
  const audienceInstruction =
    isClinician
      ? "Audience: clinician/researcher. Prioritize evidence scan, ranking rationale, study/trial details, source quality, limitations, and structured citations. Keep a professional but conversational tone."
      : "Audience: patient/caregiver. Use plain language, explain terms, personalize gently using provided context, and keep clinical advice cautious. Sound like a helpful chat assistant, not a report generator.";
  const styleInstruction = isClinician
    ? [
        "Clinician style requirements:",
        "- Include methodology- or endpoint-oriented language when source detail allows (for example, long-term outcomes, adverse effects, comparator differences).",
        "- In Research Insights, include one concise limitations sentence.",
        "- In Clinical Trials, separate near-term enrollment relevance from evidence relevance when possible.",
        "- Avoid lay simplifications unless explicitly requested."
      ].join("\n")
    : [
        "Patient/caregiver style requirements:",
        "- Use plain words first, then short medical terms in context.",
        "- Keep the emotional tone supportive and practical.",
        "- In Research Insights, translate what the evidence means in everyday language.",
        "- In Clinical Trials, tell the user what to check first before considering enrollment."
      ].join("\n");

  return `You are CuraLink, a medical research assistant. Use only the provided sources. Do not diagnose, prescribe, or claim certainty beyond the evidence. If evidence is missing, say "Not enough evidence".
${audienceInstruction}

Patient/research context:
- User type: ${context.userType || "patient"}
- Patient name: ${context.patientName || "not provided"}
- Condition: ${context.condition || "not provided"}
- Specialty / role: ${context.specialtyRole || "not provided"}
- Patient age: ${context.patientAge || "not provided"}
- Patient comorbidities: ${context.patientComorbidities || "not provided"}
- Current medications: ${context.patientMedications || "not provided"}
- Clinical question type: ${context.clinicalQuestionType || "not provided"}
- Referral mode: ${context.referralMode ? "yes" : "no"}
- Symptoms/context: ${context.symptoms || "not provided"}
- Research focus (topic/intervention): ${context.intent || "not provided"}
- Location: ${context.location || "not provided"}

Recent conversation:
${recentHistory || "No previous turns."}

Current user question:
${question}

Publication sources:
${publications.map(sourceLine).join("\n") || "No publication sources retrieved."}

Clinical trial sources:
${clinicalTrials.map(sourceLine).join("\n") || "No clinical trial sources retrieved."}

Write a concise answer with exactly these headings:
Condition Overview:
Research Insights:
Clinical Trials:
Source Attribution:

Rules:
- Address the user question directly in Condition Overview (first 2-4 sentences), and start with one natural-language sentence that acknowledges what the user asked.
- Every claim about evidence, outcomes, risks, or recommendations must cite [P#] or [T#].
- If the sources do not answer the question, say "Not enough evidence" and explain what is missing.
- Write in complete natural prose. Avoid robotic labels like "signals" or "candidate pool".
- Do not add extra headings beyond the four required sections.
- If there is no exact trial match, say that clearly and present the closest related trials instead of leaving the section empty.

${styleInstruction}`;
}

function extractGeneratedText(payload) {
  if (Array.isArray(payload)) return payload[0]?.generated_text || payload[0]?.summary_text || "";
  return payload.generated_text || payload.summary_text || payload.choices?.[0]?.text || "";
}

function extractChatContent(payload) {
  const choice = payload?.choices?.[0];
  return choice?.message?.content || choice?.delta?.content || "";
}

function stripPromptEcho(text, prompt) {
  if (!text) return "";
  return text.startsWith(prompt) ? text.slice(prompt.length).trim() : text.trim();
}

function canonicalHeading(label = "") {
  const normalized = label.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (normalized === "condition" || normalized === "overview" || normalized === "condition overview") {
    return "Condition Overview";
  }
  if (normalized === "research" || normalized === "insight" || normalized === "insights" || normalized === "research insight" || normalized === "research insights") {
    return "Research Insights";
  }
  if (normalized === "clinical trial" || normalized === "clinical trials" || normalized === "trial" || normalized === "trials") {
    return "Clinical Trials";
  }
  if (normalized === "source" || normalized === "sources" || normalized === "citation" || normalized === "citations" || normalized === "references" || normalized === "source attribution") {
    return "Source Attribution";
  }
  return "";
}

function defaultSectionBody(heading) {
  if (heading === "Source Attribution") return "Not enough evidence. Please verify sources in the side panel.";
  return "Not enough evidence.";
}

export function coerceStructuredAnswer(rawAnswer = "") {
  const answer = String(rawAnswer || "").trim();
  if (!answer) return "";

  const sections = Object.fromEntries(SECTION_ORDER.map((heading) => [heading, ""]));
  const lines = answer.split("\n").map((line) => line.trim()).filter(Boolean);
  let activeHeading = "";
  let preamble = "";

  for (const line of lines) {
    if (/^\**\s*safety(?:\s+note)?\s*\**\s*[:\-]?/i.test(line)) {
      activeHeading = "";
      continue;
    }

    const match = line.match(/^\**\s*([A-Za-z][A-Za-z\s]{1,48}?)\s*\**(?:\s*[:\-]\s*(.*)|\s*)$/);
    const detectedHeading = canonicalHeading(match?.[1] || "");
    if (detectedHeading) {
      activeHeading = detectedHeading;
      const remainder = (match?.[2] || "").trim();
      if (remainder) {
        sections[activeHeading] = [sections[activeHeading], remainder].filter(Boolean).join(" ").trim();
      }
      continue;
    }

    if (activeHeading) {
      sections[activeHeading] = [sections[activeHeading], line].filter(Boolean).join(" ").trim();
    } else {
      preamble = [preamble, line].filter(Boolean).join(" ").trim();
    }
  }

  if (!sections["Condition Overview"] && preamble) {
    sections["Condition Overview"] = preamble;
  }
  if (!sections["Research Insights"] && preamble && sections["Condition Overview"] !== preamble) {
    sections["Research Insights"] = preamble;
  }

  return SECTION_ORDER
    .map((heading) => `${heading}:\n${sections[heading] || defaultSectionBody(heading)}`)
    .join("\n\n");
}

function hasDegenerateNumberList(answer = "") {
  return /(?:\b\d{1,4},){24,}\d{1,4}\b/.test(answer);
}

function hasSourceCitation(answer = "") {
  return /\[(P|T)\d+\]/.test(answer);
}

function appearsAllDefaultSections(answer = "") {
  return (
    answer.includes("Research Insights:\nNot enough evidence.") &&
    answer.includes("Clinical Trials:\nNot enough evidence.") &&
    answer.includes("Source Attribution:\nNot enough evidence")
  );
}

function isAnswerUsable(answer, sources) {
  if (!answer) return false;
  if (!REQUIRED_HEADINGS.every((heading) => answer.includes(heading))) return false;
  if (hasDegenerateNumberList(answer)) return false;

  const sourceCount = (sources?.publications || []).length + (sources?.clinicalTrials || []).length;
  if (sourceCount > 0 && !hasSourceCitation(answer)) return false;
  return true;
}

function shortSourceList(items = [], type = "publication") {
  return items
    .slice(0, 4)
    .map((item, index) => {
      if (type === "publication") {
        return `[P${index + 1}] ${item.title} (${item.source || "source"}, ${item.year || "year unknown"})`;
      }
      return `[T${index + 1}] ${item.title} (${item.status || "status unknown"})`;
    })
    .join("; ");
}

function buildSourceReferenceMap(sources = {}) {
  const map = new Map();
  (sources.publications || []).forEach((item, index) => {
    map.set(`P${index + 1}`, `[P${index + 1}] ${item.title} (${item.source || "source"}, ${item.year || "year unknown"})`);
  });
  (sources.clinicalTrials || []).forEach((item, index) => {
    map.set(`T${index + 1}`, `[T${index + 1}] ${item.title} (${item.status || "status unknown"})`);
  });
  return map;
}

function citedReferenceKeys(answer = "") {
  const matches = answer.match(/\[(P|T)\d+\]/g) || [];
  return [...new Set(matches.map((token) => token.replace(/[\[\]]/g, "")))];
}

function shouldBackfillAttribution(answer = "") {
  const attributionMatch = answer.match(/Source Attribution:\s*([\s\S]*?)$/i);
  const attributionBody = (attributionMatch?.[1] || "").trim();
  if (!attributionBody) return true;
  return /not enough evidence/i.test(attributionBody);
}

function backfillSourceAttribution(answer = "", sources = {}) {
  if (!shouldBackfillAttribution(answer)) return answer;

  const refMap = buildSourceReferenceMap(sources);
  const citedKeys = citedReferenceKeys(answer);
  const lines = citedKeys.map((key) => refMap.get(key)).filter(Boolean);

  if (lines.length === 0) {
    return answer;
  }

  const replacement = `Source Attribution:\n${lines.join("; ")}`;
  return answer.replace(/Source Attribution:\s*[\s\S]*$/i, replacement);
}

function relevantSources(items = [], context = {}, type = "publication") {
  const keywords = keywordSet(context.condition, context.intent, context.symptoms, context.question);

  return items.filter((item) => {
    const haystack = [item.title, item.summary, item.eligibility, item.location, item.source, item.status]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (keywords.size === 0) return true;
    for (const keyword of keywords) {
        const variants = new Set([keyword]);
        if (keyword.endsWith("s") && keyword.length > 3) variants.add(keyword.slice(0, -1));
        if (!keyword.endsWith("s")) variants.add(`${keyword}s`);
        for (const variant of variants) {
          if (haystack.includes(variant)) return true;
        }
    }
    return false;
  });
}

function isLatestTreatmentQuery(context = {}) {
  const text = [context.question, context.intent, context.clinicalQuestionType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\b(latest|recent|new|newest|treatment|treatments|therapy|therapies|therapy options|current)\b/.test(text);
}

function summarizePublications(items = []) {
  return items
    .slice(0, 3)
    .map((item, index) => {
      const citation = `[P${index + 1}]`;
      const yearPart = item.year ? `${item.year}` : "year unknown";
      const sourcePart = item.source || "source";
      return `${citation} ${item.title} (${sourcePart}, ${yearPart})`;
    })
    .join("; ");
}

function firstSummarySentence(text = "") {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "No abstract details were available from the source.";
  const sentence = cleaned.match(/^(.{24,260}?[.!?])(?:\s|$)/)?.[1] || cleaned.slice(0, 220);
  return sentence.trim();
}

function publicationNarrative(items = []) {
  return items
    .slice(0, 3)
    .map((item, index) => {
      const citation = `[P${index + 1}]`;
      const yearPart = item.year ? `${item.year}` : "year unknown";
      const sourcePart = item.source || "source";
      const finding = firstSummarySentence(item.summary);
      return `${citation} ${item.title} (${sourcePart}, ${yearPart}) suggests: ${finding}`;
    })
    .join(" ");
}

function summarizeTrials(items = []) {
  return items
    .slice(0, 3)
    .map((item, index) => {
      const citation = `[T${index + 1}]`;
      const place = item.location ? ` in ${item.location}` : "";
      const conflict = item.eligibilityConflict
        ? `, eligibility flag: ${(item.eligibilityConflictReasons || []).slice(0, 2).join(" ")}`
        : "";
      return `${citation} ${item.title} (${item.status || "status unknown"})${place}${conflict}`;
    })
    .join("; ");
}

function fallbackStructuredAnswer({ context, sources }) {
  const matchedPublications = relevantSources(sources?.publications || [], context, "publication");
  const matchedTrials = relevantSources(sources?.clinicalTrials || [], context, "clinicalTrial");
  const shortlistedTrials = (sources?.clinicalTrials || []).slice(0, 3);
  const publicationRefs = shortSourceList(matchedPublications, "publication");
  const trialRefs = shortSourceList(matchedTrials, "clinicalTrial");
  const hasPublications = Boolean(matchedPublications.length);
  const hasTrials = Boolean(matchedTrials.length);
  const hasAnyTrials = Boolean((sources?.clinicalTrials || []).length);
  const isClinician = context.userType === "clinician";
  const wantsMatching = /\b(fit|match|eligible|eligibility|screen|screening)\b/i.test(
    [context.question, context.intent, context.clinicalQuestionType].filter(Boolean).join(" ")
  );
  const latestTreatmentQuery = isLatestTreatmentQuery(context);

  const conditionLabel = context.condition || "the condition";
  const focusLabel = context.intent || context.symptoms || context.question || "the question";
  const topPublications = matchedPublications.slice(0, 3);
  const topTrials = matchedTrials.slice(0, 3);
  const leadingTakeaway = firstSummarySentence(topPublications[0]?.summary || "");

  const publicationSummary = topPublications
    .map((item, index) => {
      const citation = `[P${index + 1}]`;
      const sourceYear = [item.source, item.year].filter(Boolean).join(", ");
      return `${citation} ${item.title}${sourceYear ? ` (${sourceYear})` : ""}`;
    })
    .join("; ");

  const trialSummary = topTrials
    .map((item, index) => {
      const citation = `[T${index + 1}]`;
      const place = item.location ? ` in ${item.location}` : "";
      return `${citation} ${item.title} (${item.status || "status unknown"})${place}`;
    })
    .join("; ");

  const overview = hasPublications
    ? latestTreatmentQuery
      ? `You asked about ${focusLabel} for ${conditionLabel}. The newest retrieved publications suggest the most current treatment directions and should be read as a practical summary of what has changed most recently [P1][P2]. A concrete takeaway from the latest evidence is: ${leadingTakeaway} [P1].`
      : isClinician
      ? `You asked about ${focusLabel} in ${conditionLabel}. The retrieved literature supports a signal of benefit, but interpretability is constrained by heterogeneous populations, intervention protocols, and follow-up windows across studies [P1][P2].`
      : `You asked about ${focusLabel} for ${conditionLabel}. The studies we found suggest there is useful evidence to guide next steps, but there is not one single perfect answer because study groups and methods differ [P1][P2].`
    : `Not enough evidence from retrieved publications to answer confidently for ${conditionLabel} and ${focusLabel}.`;

  const insights = hasPublications
    ? latestTreatmentQuery
      ? `Here is what the latest shortlisted publications are actually saying: ${publicationNarrative(matchedPublications)} Together, these studies outline where current treatment direction is moving, while still needing clinician-level interpretation for patient-specific decisions [P1][P2][P3].`
      : isClinician
      ? `Start with these sources for an evidence scan: ${publicationSummary}. Cross-reading is important because endpoint definitions and longitudinal follow-up differ, which likely explains variation in reported effect magnitude [P1][P2]. Limitation: the retrieved set is informative but not a full systematic review [P1].`
      : `A practical way to review this is to start with: ${publicationSummary}. These papers look at somewhat different outcomes and timelines, so they point in a similar direction but with different confidence levels [P1][P2].`
    : "Not enough evidence.";

  const trials = hasTrials
    ? `${wantsMatching ? "I couldn’t find an exact trial match, but here are the closest trial matches from the shortlist:" : isClinician ? "Most relevant trial matches:" : "These trial options are the closest matches right now:"} ${summarizeTrials(matchedTrials.length ? matchedTrials : shortlistedTrials)}. ${isClinician ? "For operational referral, prioritize currently recruiting or active cohorts with local access; for evidence synthesis, prioritize completed trials with result availability and protocol clarity [T1]." : "If you want to join a study, first check recruiting status and eligibility; if you want to understand results, focus on completed studies [T1]."}`
    : hasAnyTrials
      ? `${isClinician ? "I couldn’t find an exact trial match for this referral, but these related trials are the closest available options from the shortlist:" : "I couldn’t find an exact trial match, but these related studies are the closest options I found:"} ${summarizeTrials(shortlistedTrials)}.`
      : "Not enough evidence.";

  const attribution = [publicationRefs, trialRefs].filter(Boolean).join("; ") || "Not enough evidence. Please verify sources in the side panel.";

  return [
    `Condition Overview:\n${overview}`,
    `Research Insights:\n${insights}`,
    `Clinical Trials:\n${trials}`,
    `Source Attribution:\n${attribution}`
  ].join("\n\n");
}

function isUnavailableError(error) {
  return error?.status === 503 || /503|unavailable|temporarily unavailable/i.test(error?.message || "");
}

async function requestLlmAnswer(prompt, fetcher, signal, model) {
  const response = await fetcher(
    "https://router.huggingface.co/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.hfApiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are CuraLink, a medical research assistant. Use only the provided sources. Follow the required headings and cite sources."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 900
      }),
      signal
    }
  );

  if (!response.ok) {
    const error = new Error(`Hugging Face returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  return stripPromptEcho(extractChatContent(payload) || extractGeneratedText(payload), prompt);
}

async function generateWithModel(prompt, sources, fetcher, signal, model) {
  const generated = await requestLlmAnswer(prompt, fetcher, signal, model);
  let answer = backfillSourceAttribution(coerceStructuredAnswer(generated), sources);
  if (isAnswerUsable(answer, sources)) return answer;

  const stricterPrompt = `${prompt}\n\nImportant formatting constraints:\n- Keep each section concise (2-5 sentences).\n- Do not output numbered citation dumps like 1,2,3,...\n- Cite evidence only as [P#] or [T#].\n- If unsure, write \"Not enough evidence.\"`;
  const retryGenerated = await requestLlmAnswer(stricterPrompt, fetcher, signal, model);
  answer = backfillSourceAttribution(coerceStructuredAnswer(retryGenerated), sources);
  if (isAnswerUsable(answer, sources)) return answer;

  return null;
}

export async function generateAnswer({ context, message, history, sources }, fetcher = fetch) {
  if (!config.hfApiToken) {
    throw new Error("HF_API_TOKEN is not set. CuraLink is configured to require the LLM.");
  }

  const prompt = buildLlmPrompt({ context, message, history, sources });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.hfTimeoutMs);
  const models = [...new Set([config.hfModel, config.hfFallbackModel].filter(Boolean))];

  try {
    let lastError = null;

    for (const model of models) {
      try {
        const answer = await generateWithModel(prompt, sources, fetcher, controller.signal, model);
        if (answer) return answer;
      } catch (error) {
        const aborted = error?.name === "AbortError" || /aborted/i.test(error?.message || "");
        if (aborted) {
          return fallbackStructuredAnswer({ context, sources });
        }

        if (isUnavailableError(error) && model !== models[models.length - 1]) {
          lastError = error;
          continue;
        }

        lastError = error;
        break;
      }
    }

    if (lastError && !isUnavailableError(lastError)) {
      throw lastError;
    }

    return fallbackStructuredAnswer({ context, sources });
  } finally {
    clearTimeout(timeout);
  }
}
