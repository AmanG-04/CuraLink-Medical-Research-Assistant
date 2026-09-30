import { config } from "../config/env.js";
import { truncate } from "../utils/text.js";
import { providerFetch } from "./http.js";
import { studyDetails } from "./studyDetails.js";

export function reconstructOpenAlexAbstract(index = {}) {
  const words = [];
  for (const [word, positions] of Object.entries(index || {})) {
    for (const position of positions) {
      words[position] = word;
    }
  }
  return words.filter(Boolean).join(" ");
}

export function normalizeOpenAlexWork(work) {
  const pmid = work.ids?.pmid?.split("/").filter(Boolean).pop() || "";
  const url =
    work.primary_location?.landing_page_url ||
    work.best_oa_location?.landing_page_url ||
    work.doi ||
    work.id;

  return {
    id: work.id,
    type: "publication",
    source: "OpenAlex",
    title: work.title || work.display_name || "Untitled publication",
    summary: truncate(
      reconstructOpenAlexAbstract(work.abstract_inverted_index),
      12000,
    ),
    studyType: work.type || "Not reported",
    evidenceDetails: studyDetails(
      reconstructOpenAlexAbstract(work.abstract_inverted_index),
    ),
    retracted: Boolean(work.is_retracted),
    authors: (work.authorships || [])
      .map((entry) => entry.author?.display_name)
      .filter(Boolean)
      .slice(0, 8),
    year: work.publication_year || null,
    journal: work.primary_location?.source?.display_name || "",
    url,
    doi: work.doi || "",
    pmid,
    citedByCount: work.cited_by_count || 0,
    relevanceScore: work.relevance_score || 0,
    credibility: work.primary_location?.source?.is_core ? 1 : 0.72,
    raw: work,
  };
}

export async function fetchOpenAlexPublications(context, fetcher = fetch) {
  const searchQuery = context.retrievalQuery || context.query;
  if (!searchQuery) return [];

  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", searchQuery);
  url.searchParams.set("per-page", String(config.openAlexPageSize));
  url.searchParams.set("sort", "relevance_score:desc");

  const response = await providerFetch(url, {}, fetcher);
  if (!response.ok) throw new Error(`OpenAlex returned ${response.status}`);

  const payload = await response.json();
  return (payload.results || []).map(normalizeOpenAlexWork);
}
