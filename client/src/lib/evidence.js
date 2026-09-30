export function references(sources = {}) {
  return [
    ...(sources.publications || []).map((source, index) => ({
      ...source,
      citationId: `P${index + 1}`,
    })),
    ...(sources.clinicalTrials || []).map((source, index) => ({
      ...source,
      citationId: `T${index + 1}`,
    })),
  ];
}

export function sections(answer = "") {
  const result = [];
  let active;
  for (const line of answer.split("\n")) {
    const match = line.match(
      /^(Condition Overview|Research Insights|Clinical Trials|Source Attribution):\s*(.*)$/,
    );
    if (match) {
      active = { title: match[1], lines: match[2] ? [match[2]] : [] };
      result.push(active);
    } else if (active) active.lines.push(line);
  }
  return result.length ? result : [{ title: "Answer", lines: [answer] }];
}

export function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function exportBrief(workspace) {
  const lines = [
    `# ${workspace.title}`,
    "",
    `Exported: ${new Date().toISOString()}`,
    "",
    "CuraLink educational research prototype. Not medical advice. Verify all evidence with the original sources. AI citation IDs are checked; claim support is not independently verified.",
    "",
    `Audience: ${workspace.context?.userType || "patient"}`,
    `Condition: ${workspace.context?.condition || "Not specified"}`,
    "",
  ];
  for (const turn of workspace.turns || []) {
    lines.push(
      `## ${turn.role === "user" ? "Question" : "Research response"}`,
      "",
      turn.message || turn.answer,
      "",
    );
    if (turn.role === "assistant") {
      lines.push(
        `Mode: ${turn.generation?.mode || "demo"}; retrieved: ${turn.retrievalStats?.retrievedAt || "not available"}`,
        "",
      );
      for (const source of references(turn.sources))
        lines.push(
          `[${source.citationId}] ${source.title} (${source.year || "year unavailable"}). ${safeUrl(source.url) || ""}`,
        );
      lines.push("");
    }
  }
  lines.push(
    "## Workspace notes",
    "",
    workspace.notes || "No notes.",
    "",
    "## Bookmarks",
    "",
    ...(workspace.bookmarks || []).map(
      (source) => `${source.title}: ${safeUrl(source.url) || ""}`,
    ),
  );
  const blob = new Blob([lines.join("\n")], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${workspace.title.replace(/[^a-z0-9]/gi, "-").slice(0, 60)}.md`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
