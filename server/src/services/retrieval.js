import { fetchClinicalTrials } from "./clinicalTrials.js";
import { fetchOpenAlexPublications } from "./openalex.js";
import { fetchPubMedPublications } from "./pubmed.js";
import { rankClinicalTrials, rankPublications, selectTopSources } from "./ranking.js";

function stripRaw(record) {
  const sanitized = { ...record };
  delete sanitized.raw;
  return sanitized;
}

function summarizeResult(result) {
  if (result.status === "fulfilled") {
    return { ok: true, count: result.value.length };
  }
  return { ok: false, count: 0, error: result.reason?.message || "Unknown retrieval error" };
}

export async function retrieveAndRank(context, fetcher = fetch) {
  const [openAlexResult, pubMedResult, trialsResult] = await Promise.allSettled([
    fetchOpenAlexPublications(context, fetcher),
    fetchPubMedPublications(context, fetcher),
    fetchClinicalTrials(context, fetcher)
  ]);

  const openAlexPublications = openAlexResult.status === "fulfilled" ? openAlexResult.value : [];
  const pubMedPublications = pubMedResult.status === "fulfilled" ? pubMedResult.value : [];
  const clinicalTrials = trialsResult.status === "fulfilled" ? trialsResult.value : [];
  const rankedPublications = rankPublications([...openAlexPublications, ...pubMedPublications], context).map(stripRaw);
  const rankedClinicalTrials = rankClinicalTrials(clinicalTrials, context).map(stripRaw);
  const selectedSources = selectTopSources(rankedPublications, rankedClinicalTrials, 8);

  return {
    candidates: {
      publications: rankedPublications,
      clinicalTrials: rankedClinicalTrials
    },
    selectedSources,
    stats: {
      openAlex: summarizeResult(openAlexResult),
      pubMed: summarizeResult(pubMedResult),
      clinicalTrials: summarizeResult(trialsResult),
      candidatePoolSize: openAlexPublications.length + pubMedPublications.length + clinicalTrials.length,
      selectedCount: selectedSources.publications.length + selectedSources.clinicalTrials.length
    }
  };
}
