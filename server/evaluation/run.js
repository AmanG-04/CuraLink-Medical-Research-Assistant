import { performance } from "node:perf_hooks";
import { rankPublications } from "../src/services/ranking.js";
import { keywordScore, keywordSet } from "../src/utils/text.js";
import { extractiveAnswer, validateCitations } from "../src/services/llm.js";
import { fixtures } from "./fixtures.js";

function dcg(grades) {
  return grades.reduce(
    (sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2),
    0,
  );
}
function metrics(records, judgments) {
  const grades = records.slice(0, 8).map((record) => judgments[record.id] || 0);
  const ideal = Object.values(judgments)
    .sort((a, b) => b - a)
    .slice(0, 8);
  return {
    precision: grades.filter(Boolean).length / Math.min(records.length, 8),
    ndcg: dcg(grades) / (dcg(ideal) || 1),
    top1: grades[0] > 0 ? 1 : 0,
  };
}
const rows = fixtures.map((fixture) => {
  const keywords = keywordSet(
    fixture.context.condition,
    fixture.context.intent,
    fixture.query,
  );
  const baseline = fixture.documents
    .map((record) => ({
      ...record,
      score: keywordScore(`${record.title} ${record.summary}`, keywords),
    }))
    .sort((a, b) => b.score - a.score);
  const start = performance.now();
  const ranked = rankPublications(fixture.documents, fixture.context);
  return {
    baseline: metrics(baseline, fixture.judgments),
    current: metrics(ranked, fixture.judgments),
    ms: performance.now() - start,
  };
});
const average = (selector) =>
  rows.reduce((sum, row) => sum + selector(row), 0) / rows.length;
console.log(
  `Synthetic offline evaluation (${fixtures.length} queries; 12 topics). No network or model calls.`,
);
console.log(
  "These hand-authored fixtures test ranking mechanics, not clinical relevance or answer quality.",
);
console.table(
  ["baseline", "current"].map((name) => ({
    ranker: name === "baseline" ? "Keyword-only" : "BM25 + metadata",
    "Precision@8": average((row) => row[name].precision).toFixed(3),
    "nDCG@8": average((row) => row[name].ndcg).toFixed(3),
    "Relevant top-1": average((row) => row[name].top1).toFixed(3),
  })),
);
const sorted = rows.map((row) => row.ms).sort((a, b) => a - b);
console.log(
  `Local ranking median: ${sorted[Math.floor(sorted.length / 2)].toFixed(2)}ms; p95: ${sorted[Math.floor(sorted.length * 0.95)].toFixed(2)}ms`,
);
const sources = {
  publications: fixtures[0].documents.slice(0, 2),
  clinicalTrials: [],
};
const citationCheck = validateCitations(extractiveAnswer(sources), sources);
console.log(
  `Extractive fixture citation IDs valid: ${citationCheck.valid}; empty-source abstention: ${extractiveAnswer({ publications: [], clinicalTrials: [] }).includes("Not enough evidence")}`,
);
if (
  !citationCheck.valid ||
  rows.some((row) => !Number.isFinite(row.current.ndcg))
)
  process.exitCode = 1;
