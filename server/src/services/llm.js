import { config } from "../config/env.js";
import { truncate } from "../utils/text.js";

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
Safety Note:

Rules:
- Address the user question directly in Condition Overview (first 2-4 sentences).
- Every claim about evidence, outcomes, risks, or recommendations must cite [P#] or [T#].
- If the sources do not answer the question, say "Not enough evidence" and explain what is missing.
- You may include general safety cautions only if clearly labeled as general (not source-backed).`;
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

export async function generateAnswer({ context, message, history, sources }, fetcher = fetch) {
  if (!config.hfApiToken) {
    throw new Error("HF_API_TOKEN is not set. CuraLink is configured to require the LLM.");
  }

  const prompt = buildLlmPrompt({ context, message, history, sources });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.hfTimeoutMs);

  try {
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
        signal: controller.signal
      }
    );

    if (!response.ok) throw new Error(`Hugging Face returned ${response.status}`);
    const payload = await response.json();
    const generated = stripPromptEcho(extractChatContent(payload) || extractGeneratedText(payload), prompt);
    const answer = generated;
    if (!answer) throw new Error("LLM returned an empty response.");
    const requiredHeadings = [
      "Condition Overview:",
      "Research Insights:",
      "Clinical Trials:",
      "Source Attribution:",
      "Safety Note:"
    ];
    const hasAllHeadings = requiredHeadings.every((heading) => answer.includes(heading));
    if (!hasAllHeadings) throw new Error("LLM response missing required headings.");
    return answer;
  } finally {
    clearTimeout(timeout);
  }
}
