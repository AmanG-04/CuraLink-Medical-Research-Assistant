import { useEffect, useRef } from "react";
import { references, safeUrl, sections } from "../lib/evidence.js";
import { Icon } from "./Icon.jsx";

function CitedText({ text, sources, onOpen }) {
  return text.split(/(\[(?:P|T)\d+\])/g).map((part, index) => {
    const source = sources.find((item) => `[${item.citationId}]` === part);
    return source ? (
      <button
        key={index}
        className="citation"
        onClick={() => onOpen(source)}
        aria-label={`Open source ${source.citationId}: ${source.title}`}
      >
        {part}
      </button>
    ) : (
      <span key={index}>{part}</span>
    );
  });
}

export function Answer({ turn, onOpen }) {
  const sources = references(turn.sources);
  return (
    <article className="answer-card">
      <div className="answer-meta">
        <span className="assistant-identity">
          <span className="assistant-avatar">
            <Icon name="chat" size={18} />
          </span>
          CuraLink
        </span>
        <span
          className={`badge ${turn.generation?.mode === "source-only" ? "amber" : ""}`}
        >
          {turn.generation?.mode === "ai"
            ? "AI synthesis"
            : turn.generation?.mode === "demo"
              ? "Illustrative demo"
              : "Source excerpts"}
        </span>
      </div>
      {sections(turn.answer || turn.message).map((section) => (
        <section className="answer-section" key={section.title}>
          {section.title !== "Condition Overview" &&
            section.title !== "Source Attribution" &&
            section.title !== "Clinical Trials" && <h3>{section.title}</h3>}
          {(section.title === "Source Attribution" ||
          section.title === "Clinical Trials"
            ? []
            : section.lines
          )
            .filter((line) => line.trim())
            .map((line, index) => (
              <p
                key={index}
                className={line.startsWith("- ") ? "answer-bullet" : ""}
              >
                <CitedText
                  text={line.replace(/^- /, "• ")}
                  sources={sources}
                  onOpen={onOpen}
                />
              </p>
            ))}
          {(section.title === "Source Attribution" ||
            section.title === "Clinical Trials") && (
            <details>
              <summary>
                {section.title === "Source Attribution"
                  ? "View source references"
                  : "View trial discussion"}
              </summary>
              {section.lines
                .filter((line) => line.trim())
                .map((line, index) => (
                  <p key={index}>
                    <CitedText text={line} sources={sources} onOpen={onOpen} />
                  </p>
                ))}
            </details>
          )}
        </section>
      ))}
      <details className="trace">
        <summary>Research trace</summary>
        <dl>
          <dt>Search coverage</dt>
          <dd>
            {turn.retrievalStats?.candidatePoolSize || 0} candidates;{" "}
            {sources.length} selected
          </dd>
          <dt>Retrieved</dt>
          <dd>
            {turn.retrievalStats?.retrievedAt
              ? new Date(turn.retrievalStats.retrievedAt).toLocaleString()
              : "Illustrative demo"}
          </dd>
          <dt>Ranking</dt>
          <dd>{turn.retrievalStats?.rankingMethod || "Not recorded"}</dd>
          <dt>Generation</dt>
          <dd>
            {turn.generation?.model ||
              turn.generation?.reason ||
              "Demo fixture"}
          </dd>
          <dt>Timing</dt>
          <dd>
            {((turn.retrievalStats?.durationMs || 0) / 1000).toFixed(1)}s
            retrieval · {((turn.generation?.durationMs || 0) / 1000).toFixed(1)}
            s generation
            {turn.retrievalStats?.fromCache ? " · Cached sources" : ""}
          </dd>
        </dl>
        {["openAlex", "pubMed", "clinicalTrials"].map(
          (provider) =>
            turn.retrievalStats?.[provider] && (
              <p key={provider}>
                {provider}:{" "}
                {turn.retrievalStats[provider].ok
                  ? `${turn.retrievalStats[provider].count} records`
                  : "Provider unavailable; coverage is incomplete"}
              </p>
            ),
        )}
      </details>
      <details className="evidence-limit small muted">
        <summary>Evidence limitations</summary>
        <p>
          Citation identifiers are checked. Claim support is not independently
          verified. This is an abstract-based search, not a systematic review.
        </p>
      </details>
    </article>
  );
}

export function SourceCard({
  source,
  onOpen,
  bookmarked,
  onBookmark,
  selected,
  onSelect,
}) {
  const trial = source.type === "clinicalTrial";
  return (
    <article className="source-card">
      <div className="source-meta">
        <span className="source-id">
          {source.citationId || (trial ? "Trial" : "Paper")}
        </span>
        <span className={`badge ${trial ? "amber" : ""}`}>
          {trial
            ? (source.status || "UNKNOWN").replaceAll("_", " ")
            : source.source}
        </span>
      </div>
      <button className="source-title" onClick={() => onOpen(source)}>
        {source.title}
      </button>
      <p className="small muted">
        {trial
          ? source.location || "Location not reported"
          : [source.year, source.journal || source.studyType]
              .filter(Boolean)
              .join(" · ")}
      </p>
      <details className="source-abstract">
        <summary>Abstract preview</summary>
        <p>
          {source.summary ||
            "Abstract not available. Inspect the original record."}
        </p>
      </details>
      {source.eligibilityConflict && (
        <p className="notice">
          Possible eligibility conflict. Review the source criteria.
        </p>
      )}
      <div className="source-actions">
        <button
          className="text-button"
          onClick={() => onBookmark(source)}
          aria-pressed={bookmarked}
        >
          {bookmarked ? "Saved" : "Bookmark"}
        </button>
        {!trial && (
          <label className="compare-check">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect(source)}
            />
            Compare
          </label>
        )}
        <button className="text-button" onClick={() => onOpen(source)}>
          Details
        </button>
      </div>
    </article>
  );
}

export function SourceDialog({ source, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const url = safeUrl(source.url);
  return (
    <dialog
      ref={dialogRef}
      className="source-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-labelledby="source-dialog-title"
    >
      <div className="dialog-header">
        <span className="eyebrow">
          Evidence detail · {source.citationId || source.id}
        </span>
        <button
          className="secondary"
          onClick={onClose}
          aria-label="Close evidence detail"
        >
          Close
        </button>
      </div>
      <h2 id="source-dialog-title">{source.title}</h2>
      <p className="muted">
        {[source.source, source.year, source.journal, source.studyType]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {source.authors?.length > 0 && <p>{source.authors.join(", ")}</p>}
      <h3>Available source excerpt</h3>
      <p className="preserve-lines">
        {source.summary || "No abstract is available from this source."}
      </p>
      {source.type === "clinicalTrial" && (
        <>
          <h3>Trial record</h3>
          <dl>
            <dt>Status</dt>
            <dd>{source.status}</dd>
            <dt>Phase</dt>
            <dd>{source.phases?.join(", ") || "Not reported"}</dd>
            <dt>Age range</dt>
            <dd>
              {source.minimumAge || "Unknown"} to{" "}
              {source.maximumAge || "Unknown"}
            </dd>
            <dt>Last registry update</dt>
            <dd>{source.lastUpdated || "Not reported"}</dd>
            <dt>Locations</dt>
            <dd>
              {source.locations?.join("; ") ||
                source.location ||
                "Not reported"}
            </dd>
            <dt>Contact</dt>
            <dd>{source.contact || "Not listed"}</dd>
          </dl>
          <h3>Preliminary screening</h3>
          <p className="notice">
            {source.eligibilityConflict
              ? source.eligibilityConflictReasons.join(" ")
              : "No automated conflict was detected. Eligibility remains unknown and must be confirmed by the study team."}
          </p>
          <h3>Eligibility criteria</h3>
          <p className="preserve-lines">
            {source.eligibility || "Not reported"}
          </p>
        </>
      )}
      <h3>Why this record appeared</h3>
      <ul>
        {(
          source.rankingReasons || [
            "Selected from this answer's source snapshot",
          ]
        ).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="small muted">
        Ranking indicates search relevance, not clinical quality or certainty.
      </p>
      {url && (
        <a
          className="primary link-button"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open original source ↗
        </a>
      )}
    </dialog>
  );
}

export function Comparison({ sources, onRemove, onOpen }) {
  if (!sources.length)
    return (
      <div className="empty-state">
        <h3>Compare the evidence</h3>
        <p>
          Select up to four publication cards to compare their available
          metadata and abstracts.
        </p>
      </div>
    );
  const fields = [
    [
      "Source / year",
      (source) => `${source.source} · ${source.year || "Unknown"}`,
    ],
    ["Study type", (source) => source.studyType || "Not reported"],
    [
      "Population",
      (source) =>
        source.evidenceDetails?.population ||
        "Not explicitly labeled; inspect source",
    ],
    [
      "Methods",
      (source) =>
        source.evidenceDetails?.methods ||
        "Not explicitly labeled; inspect source",
    ],
    [
      "Intervention / comparator",
      (source) =>
        source.evidenceDetails?.intervention ||
        "Not explicitly labeled; inspect source",
    ],
    [
      "Reported findings",
      (source) =>
        source.evidenceDetails?.findings ||
        "Not explicitly labeled; inspect source",
    ],
    ["Available abstract", (source) => source.summary || "Not available"],
    [
      "Reported limitations",
      (source) =>
        source.evidenceDetails?.limitations ||
        "Not explicitly labeled; inspect source",
    ],
    [
      "Selection rationale",
      (source) => source.rankingReasons?.join("; ") || "Not recorded",
    ],
  ];
  return (
    <section className="comparison">
      <h2>Publication comparison</h2>
      <p className="muted">
        Compare available records. Missing details are left unknown rather than
        inferred.
      </p>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Publication comparison table"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Field</th>
              {sources.map((source) => (
                <th scope="col" key={source.id}>
                  <button
                    className="source-title"
                    onClick={() => onOpen(source)}
                  >
                    {source.title}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => onRemove(source)}
                  >
                    Remove
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {sources.map((source) => (
                  <td key={source.id}>{value(source)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
