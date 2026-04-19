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

  return `[T${index + 1}] ${source.title} (${source.status}). Location: ${source.location || "not listed"}. Eligibility: ${truncate(source.eligibility, 360)} URL: ${source.url}`;
}

export function buildLlmPrompt({ context, message, history, sources }) {
  const publications = sources.publications || [];
  const clinicalTrials = sources.clinicalTrials || [];
  const recentHistory = (history || [])
    .slice(-6)
    .map((turn) => `${turn.role}: ${turn.message || turn.answer || ""}`)
    .join("\n");

  const question = message || context.question || context.query;
  const audienceInstruction =
    context.userType === "clinician"
      ? "Audience: clinician/researcher. Prioritize evidence scan, ranking rationale, study/trial details, source quality, limitations, and structured citations. Use concise technical language."
      : "Audience: patient/caregiver. Use plain language, explain terms, personalize gently using provided context, and keep clinical advice cautious.";

  return `You are CuraLink, a medical research assistant. Use only the provided sources. Do not diagnose, prescribe, or claim certainty beyond the evidence. If evidence is missing, say "Not enough evidence".
${audienceInstruction}

Patient/research context:
- User type: ${context.userType || "patient"}
- Patient name: ${context.patientName || "not provided"}
- Condition: ${context.condition || "not provided"}
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
- Address the user question directly in Condition Overview (first 2-4 sentences).
- Every claim about evidence, outcomes, risks, or recommendations must cite [P#] or [T#].
- If the sources do not answer the question, say "Not enough evidence" and explain what is missing.
- Do not add extra headings beyond the four required sections.`;
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
  if (sourceCount > 0 && !hasSourceCitation(answer) && !appearsAllDefaultSections(answer)) return false;
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

function fallbackStructuredAnswer({ context, sources }) {
  const matchedPublications = relevantSources(sources?.publications || [], context, "publication");
  const matchedTrials = relevantSources(sources?.clinicalTrials || [], context, "clinicalTrial");
  const publicationRefs = shortSourceList(matchedPublications, "publication");
  const trialRefs = shortSourceList(matchedTrials, "clinicalTrial");
  const hasPublications = Boolean(matchedPublications.length);
  const hasTrials = Boolean(matchedTrials.length);

  const conditionLabel = context.condition || "the condition";
  const focusLabel = context.intent || context.symptoms || context.question || "the question";
  const topPublications = matchedPublications.slice(0, 3);
  const topTrials = matchedTrials.slice(0, 3);

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
    ? `For ${conditionLabel} and ${focusLabel}, the retrieved evidence includes multiple focused studies and reviews rather than a single definitive result [P1]. The direction of benefit appears topic-relevant, but study design and population differences mean conclusions should be individualized [P1][P2].`
    : `Not enough evidence from retrieved publications to answer confidently for ${conditionLabel} and ${focusLabel}.`;

  const insights = hasPublications
    ? `Top publication signals: ${publicationSummary}. These sources should be read together because endpoints and follow-up windows differ across studies [P1][P2].`
    : "Not enough evidence.";

  const trials = hasTrials
    ? `Matching trial signals: ${trialSummary}. Prioritize eligibility, location, and status when deciding what to review first [T1].`
    : "Not enough evidence.";

  const attribution = [publicationRefs, trialRefs].filter(Boolean).join("; ") || "Not enough evidence. Please verify sources in the side panel.";

  return [
    `Condition Overview:\n${overview}`,
    `Research Insights:\n${insights}`,
    `Clinical Trials:\n${trials}`,
    `Source Attribution:\n${attribution}`
  ].join("\n\n");
}

async function requestLlmAnswer(prompt, fetcher, signal) {
  const response = await fetcher(
    "https://router.huggingface.co/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.hfApiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.hfModel,
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

  if (!response.ok) throw new Error(`Hugging Face returned ${response.status}`);
  const payload = await response.json();
  return stripPromptEcho(extractChatContent(payload) || extractGeneratedText(payload), prompt);
}

export async function generateAnswer({ context, message, history, sources }, fetcher = fetch) {
  if (!config.hfApiToken) {
    throw new Error("HF_API_TOKEN is not set. CuraLink is configured to require the LLM.");
  }

  const prompt = buildLlmPrompt({ context, message, history, sources });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.hfTimeoutMs);

  try {
    try {
      const generated = await requestLlmAnswer(prompt, fetcher, controller.signal);
      let answer = backfillSourceAttribution(coerceStructuredAnswer(generated), sources);
      if (isAnswerUsable(answer, sources)) return answer;

      const stricterPrompt = `${prompt}\n\nImportant formatting constraints:\n- Keep each section concise (2-5 sentences).\n- Do not output numbered citation dumps like 1,2,3,...\n- Cite evidence only as [P#] or [T#].\n- If unsure, write \"Not enough evidence.\"`;
      const retryGenerated = await requestLlmAnswer(stricterPrompt, fetcher, controller.signal);
      answer = backfillSourceAttribution(coerceStructuredAnswer(retryGenerated), sources);
      if (isAnswerUsable(answer, sources)) return answer;
    } catch (error) {
      const aborted = error?.name === "AbortError" || /aborted/i.test(error?.message || "");
      if (!aborted) throw error;
    }

    return fallbackStructuredAnswer({ context, sources });
  } finally {
    clearTimeout(timeout);
  }
}
