import { z } from "zod";
import { normalizeClinicalTrial } from "./clinicalTrials.js";
import { providerFetch } from "./http.js";

export const discoverySchema = z.object({
  condition: z.string().trim().min(2).max(120),
  location: z.string().trim().max(120).default(""),
  intervention: z.string().trim().max(120).default(""),
  age: z.union([z.literal(""), z.coerce.number().min(0).max(120)]).default(""),
  sex: z.enum(["", "FEMALE", "MALE"]).default(""),
  status: z.enum(["open", "all"]).default("open"),
  phase: z
    .enum(["", "EARLY_PHASE1", "PHASE1", "PHASE2", "PHASE3", "PHASE4"])
    .default(""),
  medications: z.string().trim().max(1000).default(""),
  otherConditions: z.string().trim().max(1000).default(""),
});

export function registryAgeYears(value = "") {
  const match = value.match(
    /^(\d+(?:\.\d+)?)\s*(Years?|Months?|Weeks?|Days?)$/i,
  );
  if (!match) return null;
  const units = { year: 1, month: 1 / 12, week: 7 / 365.25, day: 1 / 365.25 };
  return Number(match[1]) * units[match[2].toLowerCase().replace(/s$/, "")];
}

function criterion(kind, state, label, evidence, note) {
  return { kind, state, label, evidence, note };
}

/** Deterministic observations about registry fields, never a clinical eligibility verdict. */
export function screenTrial(trial, input) {
  const rows = [];
  const min = registryAgeYears(trial.minimumAge);
  const max = registryAgeYears(trial.maximumAge);
  const hasAge = input.age !== "" && input.age !== undefined;
  const conflict =
    hasAge &&
    ((min !== null && input.age < min) || (max !== null && input.age > max));
  rows.push(
    criterion(
      "age",
      conflict
        ? "conflict"
        : hasAge && min !== null && max !== null
          ? "match"
          : "unknown",
      "Age range",
      `Minimum age: ${trial.minimumAge || "not reported"}; maximum age: ${trial.maximumAge || "not reported"}`,
      conflict
        ? `Age ${input.age} falls outside a reported bound.`
        : hasAge
          ? "Only the reported age bounds were checked."
          : "Add an age to check the reported bounds.",
    ),
  );
  rows.push(
    criterion(
      "sex",
      !input.sex || !trial.sex
        ? "unknown"
        : trial.sex === "ALL" || trial.sex === input.sex
          ? "match"
          : "conflict",
      "Registry sex criterion",
      `Sex: ${trial.sex || "not reported"}`,
      input.sex
        ? "Registry sex criteria do not describe gender identity or all clinical requirements."
        : "Not provided in your search profile.",
    ),
  );
  const open = ["RECRUITING", "ENROLLING_BY_INVITATION"].includes(trial.status);
  rows.push(
    criterion(
      "status",
      open ? "match" : "unknown",
      "Enrollment status",
      `Overall status: ${trial.status || "UNKNOWN"}`,
      open
        ? "Overall status is open; individual sites may differ. Confirm availability."
        : "Registry status does not establish a current enrollment opportunity.",
    ),
  );
  const sites = trial.siteDetails || [];
  const needle = input.location.toLowerCase();
  const matchingSites = needle
    ? sites.filter((site) =>
        [site.facility, site.city, site.state, site.country]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : [];
  rows.push(
    criterion(
      "location",
      matchingSites.length ? "match" : "unknown",
      "Location",
      matchingSites.length
        ? matchingSites
            .map(
              (site) =>
                `${site.facility}, ${site.city}, ${site.country}; site status: ${site.status}`,
            )
            .join("\n")
        : trial.location || "No locations reported",
      input.location
        ? "Text matching only; travel distance and site availability are not established."
        : "No location preference supplied.",
    ),
  );
  const criteria = trial.eligibility || "";
  for (const [field, label] of [
    ["medications", "Medications"],
    ["otherConditions", "Other conditions"],
  ]) {
    const terms = input[field]
      .split(/[,;\n]/)
      .map((part) => part.trim())
      .filter(Boolean);
    // A mention is an unknown requiring review, not evidence of exclusion.
    const passages = terms.flatMap((term) =>
      criteria
        .split(/\n|(?<=\.)\s/)
        .filter((line) => line.toLowerCase().includes(term.toLowerCase())),
    );
    rows.push(
      criterion(
        field,
        "unknown",
        label,
        [...new Set(passages)].join("\n") ||
          (terms.length
            ? "No exact text mention found in the available criteria."
            : "No profile details supplied."),
        "No clinical interpretation or drug synonym matching. Review the full criteria with the study team.",
      ),
    );
  }
  rows.push(
    criterion(
      "clinical",
      "unknown",
      "Diagnosis & full eligibility",
      criteria ? criteria.slice(0, 700) : "Eligibility criteria not reported",
      "Diagnosis, stage, prior treatment, labs and all other requirements remain unverified.",
    ),
  );
  return {
    rows,
    counts: {
      match: rows.filter((row) => row.state === "match").length,
      conflict: rows.filter((row) => row.state === "conflict").length,
      unknown: rows.filter((row) => row.state === "unknown").length,
    },
    verdict: "Eligibility must be confirmed by the study team",
  };
}

/** Strict registry query; never silently broadens location or enrollment status. */
export async function discoverTrials(input, fetcher = fetch) {
  const started = Date.now();
  const studies = [];
  let pageToken;
  let totalCount = null;
  const seenTokens = new Set();
  for (let page = 0; page < 2; page += 1) {
    const url = new URL("https://clinicaltrials.gov/api/v2/studies");
    url.searchParams.set("query.cond", input.condition);
    if (input.location) url.searchParams.set("query.locn", input.location);
    if (input.intervention)
      url.searchParams.set("query.intr", input.intervention);
    if (input.status === "open")
      url.searchParams.set(
        "filter.overallStatus",
        "RECRUITING,ENROLLING_BY_INVITATION",
      );
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("countTotal", "true");
    url.searchParams.set("format", "json");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await providerFetch(url, {}, fetcher);
    if (!response.ok)
      throw Object.assign(
        new Error(
          "ClinicalTrials.gov is unavailable. Your previous search is preserved; please retry.",
        ),
        { status: 503 },
      );
    const payload = await response.json();
    studies.push(...(payload.studies || []));
    totalCount = payload.totalCount ?? totalCount;
    pageToken = payload.nextPageToken;
    if (!pageToken || seenTokens.has(pageToken)) break;
    seenTokens.add(pageToken);
  }
  const unique = [
    ...new Map(
      studies.map((study) => [
        study.protocolSection?.identificationModule?.nctId,
        study,
      ]),
    ).values(),
  ].filter((study) => study.protocolSection?.identificationModule?.nctId);
  const excluded = [];
  const results = unique
    .map(normalizeClinicalTrial)
    .filter((trial) => {
      if (input.phase && !trial.phases.includes(input.phase)) {
        excluded.push({
          id: trial.id,
          title: trial.title,
          reason: "Phase does not match the requested filter",
        });
        return false;
      }
      return true;
    })
    .map((record) => {
      const trial = { ...record };
      delete trial.raw;
      return { ...trial, screening: screenTrial(trial, input) };
    });
  results.sort(
    (a, b) =>
      a.screening.counts.conflict - b.screening.counts.conflict ||
      b.screening.counts.match - a.screening.counts.match ||
      a.id.localeCompare(b.id),
  );
  return {
    input,
    results,
    excluded,
    retrievedAt: new Date().toISOString(),
    stats: {
      scanned: unique.length,
      returned: results.length,
      totalCount,
      truncated: Boolean(pageToken),
      durationMs: Date.now() - started,
      provider: "ClinicalTrials.gov",
      limit: 100,
    },
    methodology:
      "Registry search with strict condition/location/intervention/status parameters. Phase is filtered within the first 100 records. Age and sex conflicts remain visible. Screening is deterministic, not AI-generated.",
  };
}
