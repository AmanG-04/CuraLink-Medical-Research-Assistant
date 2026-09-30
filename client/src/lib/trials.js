import { safeUrl } from "./evidence.js";

export const blankSearch = {
  condition: "",
  location: "",
  intervention: "",
  age: "",
  sex: "",
  status: "open",
  phase: "",
  medications: "",
  otherConditions: "",
};
export const statusLabel = (status = "UNKNOWN") =>
  ({
    RECRUITING: "Recruiting",
    ENROLLING_BY_INVITATION: "Invitation only",
    ACTIVE_NOT_RECRUITING: "Not recruiting",
    COMPLETED: "Completed",
    EXAMPLE_ONLY: "Example only",
  })[status] || status.replaceAll("_", " ").toLowerCase();
export const phaseLabel = (phases = []) =>
  phases.length
    ? phases
        .map((phase) =>
          phase === "EARLY_PHASE1"
            ? "Early phase 1"
            : phase.replace("PHASE", "Phase "),
        )
        .join(" / ")
    : "Phase not reported";

export function downloadShortlist(workspace) {
  const trials = workspace.bookmarks.filter(
    (source) => source.type === "clinicalTrial",
  );
  const lines = [
    `# ${workspace.title}: trial shortlist`,
    "",
    `Exported ${new Date().toISOString()}`,
    "",
    "Educational research only. This document does not establish eligibility or provide medical advice. Confirm registry details, site availability and all eligibility criteria with the study team.",
    "",
    `Search snapshot: ${workspace.trialSearch?.retrievedAt || "Not recorded"}`,
    "",
  ];
  for (const trial of trials) {
    lines.push(
      `## ${trial.title}`,
      `Registry ID: ${trial.id}`,
      `Source: ${safeUrl(trial.url) || "Illustrative demo; no real registry record"}`,
      `Status: ${statusLabel(trial.status)}`,
      `Phase: ${phaseLabel(trial.phases)}`,
      `Sponsor: ${trial.sponsor || "Not reported"}`,
      `Locations: ${(trial.locations || [trial.location]).filter(Boolean).join("; ") || "Not reported"}`,
      `Last registry update: ${trial.lastUpdated || "Not reported"}`,
      "",
      "### Preliminary screening observations",
    );
    for (const row of trial.screening?.rows || [])
      lines.push(
        `- ${row.label}: ${row.state}. ${row.note}`,
        `  Registry evidence: ${row.evidence}`,
      );
    lines.push(
      "",
      "### Questions for the study team",
      "- Is this specific site currently enrolling?",
      "- What diagnosis, stage, prior-treatment and lab requirements need confirmation?",
      "- Are my medications or other conditions relevant to eligibility?",
      "- What visits, travel, costs and study procedures are involved?",
      `- How can I contact the coordinator? ${trial.contact || "Contact not reported"}`,
      "",
    );
  }
  lines.push("## My notes", workspace.notes || "No notes.");
  const url = URL.createObjectURL(
    new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "curalink-trial-shortlist.md";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
