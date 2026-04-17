import { config } from "../config/env.js";
import { arrayify, keywordSet, truncate } from "../utils/text.js";

function compactLocation(location) {
  return [location.facility, location.city, location.state, location.country].filter(Boolean).join(", ");
}

function compactContact(module = {}) {
  const contacts = [
    ...arrayify(module.centralContacts),
    ...arrayify(module.overallOfficials)
  ];
  const contact = contacts.find(Boolean);
  if (!contact) return "";
  return [contact.name, contact.phone, contact.email, contact.affiliation].filter(Boolean).join(", ");
}

export function normalizeClinicalTrial(study) {
  const protocol = study.protocolSection || {};
  const identification = protocol.identificationModule || {};
  const status = protocol.statusModule || {};
  const description = protocol.descriptionModule || {};
  const eligibility = protocol.eligibilityModule || {};
  const contacts = protocol.contactsLocationsModule || {};
  const locations = arrayify(contacts.locations).map(compactLocation).filter(Boolean);
  const nctId = identification.nctId;

  return {
    id: nctId,
    type: "clinicalTrial",
    source: "ClinicalTrials.gov",
    title: identification.briefTitle || identification.officialTitle || "Untitled clinical trial",
    summary: truncate(description.briefSummary || description.detailedDescription || "", 900),
    status: status.overallStatus || status.lastKnownStatus || "UNKNOWN",
    eligibility: truncate(eligibility.eligibilityCriteria || "", 900),
    location: locations.slice(0, 4).join(" / "),
    locations,
    contact: compactContact(contacts),
    url: nctId ? `https://clinicaltrials.gov/study/${nctId}` : "",
    year: Number.parseInt(status.studyFirstPostDateStruct?.date?.slice(0, 4), 10) || null,
    credibility: 1,
    raw: study
  };
}

export async function fetchClinicalTrials(context, fetcher = fetch) {
  const searchQuery = context.query || context.condition;
  if (!context.condition && !searchQuery) return [];

  const url = new URL("https://clinicaltrials.gov/api/v2/studies");
  if (context.condition) url.searchParams.set("query.cond", context.condition);
  // ClinicalTrials.gov is sensitive to long, keyword-stuffed `query.term` values.
  // Keep it compact: prefer an explicit intervention/topic, else a few keywords.
  const term =
    context.intent ||
    [...keywordSet(context.condition, context.question || "")].slice(0, 6).join(" ") ||
    searchQuery ||
    "";
  if (term) {
    url.searchParams.set("query.term", term);
    if (context.intent) url.searchParams.set("query.intr", context.intent);
  }
  if (context.location) url.searchParams.set("query.locn", context.location);
  url.searchParams.set("pageSize", String(config.clinicalTrialsPageSize));
  url.searchParams.set("format", "json");

  const response = await fetcher(url);
  if (!response.ok) throw new Error(`ClinicalTrials.gov returned ${response.status}`);

  const payload = await response.json();
  return (payload.studies || []).map(normalizeClinicalTrial);
}
