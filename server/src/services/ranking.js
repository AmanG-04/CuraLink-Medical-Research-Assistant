import { keywordScore, keywordSet, titleKey } from "../utils/text.js";

function recencyScore(year) {
  if (!year) return 0.25;
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  if (age <= 2) return 1;
  if (age <= 5) return 0.78;
  if (age <= 10) return 0.55;
  return 0.28;
}

function exactContextBoost(record, context) {
  const text = `${record.title} ${record.summary} ${record.eligibility || ""}`.toLowerCase();
  let boost = 0;
  if (context.condition && text.includes(context.condition.toLowerCase())) boost += 0.14;
  if (context.intent && text.includes(context.intent.toLowerCase())) boost += 0.14;
  return boost;
}

export function dedupePublications(publications) {
  const seen = new Set();
  const deduped = [];

  for (const publication of publications) {
    const keys = [
      publication.doi && `doi:${publication.doi.toLowerCase()}`,
      publication.pmid && `pmid:${publication.pmid}`,
      publication.url && `url:${publication.url.toLowerCase()}`,
      publication.title && `title:${titleKey(publication.title)}`
    ].filter(Boolean);

    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    deduped.push(publication);
  }

  return deduped;
}

export function rankPublications(publications, context) {
  const keywords = keywordSet(
    context.condition,
    context.intent,
    context.retrievalQuery,
    ...(context.keywords || [])
  );

  return dedupePublications(publications)
    .map((publication) => {
      const text = `${publication.title} ${publication.summary} ${(publication.authors || []).join(" ")} ${publication.journal}`;
      const relevance = keywordScore(text, keywords);
      const citations = Math.min((publication.citedByCount || 0) / 250, 1);
      const openAlexRelevance = Math.min((publication.relevanceScore || 0) / 2000, 1);
      const score =
        relevance * 0.5 +
        recencyScore(publication.year) * 0.2 +
        (publication.credibility || 0.75) * 0.16 +
        citations * 0.06 +
        openAlexRelevance * 0.06 +
        exactContextBoost(publication, context);

      return { ...publication, score: Number(score.toFixed(4)) };
    })
    .sort((a, b) => b.score - a.score);
}

function trialStatusScore(status = "") {
  const normalized = status.toUpperCase();
  if (normalized.includes("RECRUITING") && !normalized.includes("NOT_RECRUITING")) return 1;
  if (normalized.includes("ACTIVE_NOT_RECRUITING")) return 0.78;
  if (normalized.includes("ENROLLING")) return 0.75;
  if (normalized.includes("COMPLETED")) return 0.42;
  if (normalized.includes("UNKNOWN")) return 0.25;
  return 0.2;
}

function locationAliases(location = "") {
  const normalized = String(location || "").toLowerCase().trim();
  if (!normalized) return [];

  if (["usa", "us", "u.s.", "u.s", "united states", "united states of america", "america"].includes(normalized)) {
    return ["usa", "us", "u.s.", "u.s", "united states", "united states of america", "america"];
  }

  return [normalized];
}

export function rankClinicalTrials(trials, context) {
  const keywords = keywordSet(
    context.condition,
    context.intent,
    context.retrievalQuery,
    ...(context.keywords || [])
  );
  const locationNeedles = locationAliases(context.location);

  return trials
    .map((trial) => {
      const text = `${trial.title} ${trial.summary} ${trial.eligibility} ${trial.location}`;
      const relevance = keywordScore(text, keywords);
      const locationText = (trial.location || "").toLowerCase();
      const locationScore =
        locationNeedles.length > 0 && locationNeedles.some((needle) => locationText.includes(needle)) ? 1 : 0;
      const score =
        relevance * 0.43 +
        trialStatusScore(trial.status) * 0.24 +
        locationScore * 0.18 +
        recencyScore(trial.year) * 0.08 +
        (trial.credibility || 0.9) * 0.07 +
        exactContextBoost(trial, context);

      return { ...trial, score: Number(score.toFixed(4)) };
    })
    .sort((a, b) => b.score - a.score);
}

export function selectTopSources(publications, clinicalTrials, limit = 8) {
  const selected = [];
  const topPubs = publications.slice(0, Math.min(5, publications.length));
  const topTrials = clinicalTrials.slice(0, Math.min(3, clinicalTrials.length));

  selected.push(...topPubs, ...topTrials);

  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((item) => item.id));
    const remaining = [...publications, ...clinicalTrials]
      .filter((item) => !selectedIds.has(item.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit - selected.length);
    selected.push(...remaining);
  }

  const finalSources = selected.sort((a, b) => b.score - a.score).slice(0, limit);

  return {
    publications: finalSources.filter((item) => item.type === "publication"),
    clinicalTrials: finalSources.filter((item) => item.type === "clinicalTrial")
  };
}
