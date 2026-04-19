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

function normalizeList(value = "") {
  return String(value)
    .split(/[\n,;/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parsePatientAge(context = {}) {
  const rawAge = context.patientAge || context.patientProfile?.age || "";
  const match = String(rawAge).match(/\b(\d{1,3})\b/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function extractAgeBounds(eligibilityText = "") {
  const text = eligibilityText.toLowerCase();
  const hasAgeCue = /\b(age|aged|ages|years? old|yrs? old|older than|younger than|at least|between|adult(?:s)?\s+ages?)\b/i.test(text);
  if (!hasAgeCue) {
    return {};
  }

  const between = text.match(/\b(?:age\s*)?(?:between\s*)?(\d{1,3})\s*(?:and|-|to)\s*(\d{1,3})\b/);
  if (between) {
    return { min: Number.parseInt(between[1], 10), max: Number.parseInt(between[2], 10) };
  }

  const minMatch = text.match(/\b(?:at least|>=|older than|over)\s*(\d{1,3})\b/);
  const maxMatch = text.match(/\b(?:up to|<=|under|younger than)\s*(\d{1,3})\b/);
  const olderMatch = text.match(/\b(\d{1,3})\s*(?:years?|yrs?)?\s*(?:and older|or older)\b/);
  const youngerMatch = text.match(/\b(\d{1,3})\s*(?:years?|yrs?)?\s*(?:and younger|or younger)\b/);

  const bounds = {};
  if (minMatch) bounds.min = Number.parseInt(minMatch[1], 10);
  if (maxMatch) bounds.max = Number.parseInt(maxMatch[1], 10);
  if (olderMatch) bounds.min = Number.parseInt(olderMatch[1], 10);
  if (youngerMatch) bounds.max = Number.parseInt(youngerMatch[1], 10);
  return bounds;
}

function profileTerms(context = {}) {
  return [
    ...normalizeList(context.patientComorbidities || context.patientProfile?.comorbidities || ""),
    ...normalizeList(context.patientMedications || context.patientProfile?.medications || "")
  ]
    .map((term) => term.toLowerCase())
    .filter((term) => term.length >= 3);
}

function evaluateEligibilityConflicts(trial, context) {
  const reasons = [];
  const eligibilityText = String(trial.eligibility || "").toLowerCase();
  const age = parsePatientAge(context);
  const bounds = extractAgeBounds(eligibilityText);

  if (Number.isFinite(age)) {
    if (typeof bounds.min === "number" && age < bounds.min) {
      reasons.push(`Age ${age} is below the study's minimum age ${bounds.min}.`);
    }
    if (typeof bounds.max === "number" && age > bounds.max) {
      reasons.push(`Age ${age} is above the study's maximum age ${bounds.max}.`);
    }
  }

  const segments = eligibilityText
    .split(/[\n.\u2022;]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const exclusionMarker = /(exclude|excluded|exclusion|not eligible|not allowed|must not|contraindicat|prohibited|no history of|without history of|currently taking|current use|taking|unable to)/i;

  for (const term of profileTerms(context)) {
    const matchedSegment = segments.find((segment) => segment.includes(term) && exclusionMarker.test(segment));
    if (matchedSegment) {
      const label = context.patientMedications?.toLowerCase().includes(term)
        ? "medication"
        : "comorbidity";
      reasons.push(`Possible ${label} conflict: the criteria mention "${term}" in an exclusion-related clause.`);
    }
  }

  return reasons;
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
      const eligibilityConflictReasons = evaluateEligibilityConflicts(trial, context);
      const conflictPenalty = Math.min(0.42, eligibilityConflictReasons.length * 0.14);
      const score =
        relevance * 0.43 +
        trialStatusScore(trial.status) * 0.24 +
        locationScore * 0.18 +
        recencyScore(trial.year) * 0.08 +
        (trial.credibility || 0.9) * 0.07 +
        exactContextBoost(trial, context);

      const adjustedScore = Math.max(0, score - conflictPenalty);

      return {
        ...trial,
        score: Number(adjustedScore.toFixed(4)),
        eligibilityConflict: eligibilityConflictReasons.length > 0,
        eligibilityConflictReasons,
        eligibilityMatch: eligibilityConflictReasons.length > 0 ? "review_against_profile" : "no_obvious_conflict"
      };
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
