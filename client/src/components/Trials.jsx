import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import {
  blankSearch,
  downloadShortlist,
  phaseLabel,
  statusLabel,
} from "../lib/trials.js";
import { safeUrl } from "../lib/evidence.js";

export function TrialCard({
  trial,
  saved,
  selected,
  onSave,
  onCompare,
  onOpen,
  disabled,
}) {
  const counts = trial.screening?.counts;
  return (
    <article className="trial-card">
      <div className="trial-card-top">
        <span
          className={`trial-status ${["RECRUITING", "ENROLLING_BY_INVITATION"].includes(trial.status) ? "is-open" : ""}`}
        >
          <i />
          {statusLabel(trial.status)}
        </span>
        <span className="small muted">{trial.id}</span>
      </div>
      <h3>
        <button className="trial-title" onClick={() => onOpen(trial)}>
          {trial.title}
        </button>
      </h3>
      <div className="trial-facts">
        <span>
          <Icon name="pin" size={16} />
          {trial.siteDetails?.[0]?.city || trial.location || "Location unknown"}
          {trial.siteDetails?.length > 1
            ? ` +${trial.siteDetails.length - 1} sites`
            : ""}
        </span>
        <span>
          <Icon name="filter" size={16} />
          {phaseLabel(trial.phases)}
        </span>
        <span>
          <Icon name="clock" size={16} />
          {trial.minimumAge || "Unknown"} – {trial.maximumAge || "Unknown"}
        </span>
      </div>
      {trial.interventions?.length > 0 && (
        <div className="intervention-chips">
          {trial.interventions.slice(0, 2).map((item) => (
            <span key={item.name}>{item.name}</span>
          ))}
        </div>
      )}
      <div
        className="screening-strip"
        aria-label="Preliminary screening counts"
      >
        <span className="screen-match">
          <Icon name="check" size={16} />
          {counts?.match || 0} observed matches
        </span>
        <span className="screen-conflict">
          <Icon name="alert" size={16} />
          {counts?.conflict || 0} conflicts
        </span>
        <span className="screen-unknown">
          <Icon name="help" size={16} />
          {counts?.unknown || 0} to check
        </span>
      </div>
      <div className="trial-card-actions">
        <button
          className={saved ? "primary" : "secondary"}
          disabled={disabled}
          onClick={() => onSave(trial)}
          aria-pressed={saved}
        >
          <Icon name="bookmark" size={16} />
          {saved ? "Shortlisted" : "Shortlist"}
        </button>
        <label className="compare-check">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onCompare(trial)}
          />
          Compare trial
        </label>
        <button
          className="icon-button"
          onClick={() => onOpen(trial)}
          aria-label={`View screening for ${trial.title}`}
        >
          <Icon name="arrow" />
        </button>
      </div>
    </article>
  );
}

export function TrialDiscovery({
  workspace,
  busy,
  onSearch,
  onSave,
  selected,
  onCompare,
  onOpen,
  onCompareView,
}) {
  const [input, setInput] = useState(() => ({
    ...blankSearch,
    ...workspace.trialSearch?.input,
  }));
  const [localFilter, setLocalFilter] = useState("all");
  const [text, setText] = useState("");
  const snapshot = workspace.trialSearch;
  const [editing, setEditing] = useState(!snapshot);
  useEffect(() => {
    if (snapshot) {
      setInput({ ...blankSearch, ...snapshot.input });
      setEditing(false);
    }
  }, [snapshot]);
  const update = (key) => (event) =>
    setInput((current) => ({ ...current, [key]: event.target.value }));
  const trials = (snapshot?.results || []).filter(
    (trial) =>
      (localFilter !== "review" || trial.screening?.counts.conflict > 0) &&
      (localFilter !== "clear" || !trial.screening?.counts.conflict) &&
      `${trial.title} ${trial.id} ${trial.sponsor}`
        .toLowerCase()
        .includes(text.toLowerCase()),
  );
  return (
    <section className="discovery-view">
      <div className="discovery-heading">
        <div>
          <span className="eyebrow">ClinicalTrials.gov discovery</span>
          <h2>Find trials. Know what to check.</h2>
        </div>
        {snapshot && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setEditing(!editing)}
          >
            <Icon name="filter" size={17} />
            {editing ? "Close filters" : "Edit search"}
          </button>
        )}
      </div>
      {!snapshot && (
        <ol className="workflow-steps">
          <li className="active">
            <span>1</span>Find trials
          </li>
          <li>
            <span>2</span>Check criteria
          </li>
          <li>
            <span>3</span>Build a shortlist
          </li>
        </ol>
      )}
      {editing && (
        <form
          className="trial-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(input);
          }}
        >
          <div className="primary-search-fields">
            <div>
              <label htmlFor="discover-condition">Condition</label>
              <input
                id="discover-condition"
                placeholder="e.g. Parkinson disease"
                required
                minLength={2}
                maxLength={120}
                value={input.condition}
                onChange={update("condition")}
                disabled={busy}
              />
            </div>
            <div>
              <label htmlFor="discover-location">
                City or country (optional)
              </label>
              <input
                id="discover-location"
                placeholder="e.g. Toronto, Canada"
                maxLength={120}
                value={input.location}
                onChange={update("location")}
                disabled={busy}
              />
            </div>
            <div>
              <label htmlFor="discover-age">Age (optional)</label>
              <input
                id="discover-age"
                type="number"
                min="0"
                max="120"
                value={input.age}
                onChange={update("age")}
                disabled={busy}
                placeholder="Years"
              />
            </div>
            <button className="primary" disabled={busy || workspace.demo}>
              <Icon name="search" size={18} />
              {busy ? "Searching…" : "Find trials"}
            </button>
          </div>
          <details className="advanced-search">
            <summary>More search & screening options</summary>
            <div className="advanced-fields">
              <div>
                <label htmlFor="discover-intervention">Intervention</label>
                <input
                  id="discover-intervention"
                  value={input.intervention}
                  onChange={update("intervention")}
                  maxLength={120}
                  disabled={busy}
                  placeholder="Drug, device or treatment"
                />
              </div>
              <div>
                <label htmlFor="discover-status">Enrollment status</label>
                <select
                  id="discover-status"
                  value={input.status}
                  onChange={update("status")}
                  disabled={busy}
                >
                  <option value="open">Recruiting / invitation only</option>
                  <option value="all">All statuses</option>
                </select>
              </div>
              <div>
                <label htmlFor="discover-phase">Study phase</label>
                <select
                  id="discover-phase"
                  value={input.phase}
                  onChange={update("phase")}
                  disabled={busy}
                >
                  <option value="">Any phase</option>
                  {["PHASE1", "PHASE2", "PHASE3", "PHASE4"].map((phase) => (
                    <option key={phase} value={phase}>
                      {phaseLabel([phase])}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="discover-sex">Registry sex criterion</label>
                <select
                  id="discover-sex"
                  value={input.sex}
                  onChange={update("sex")}
                  disabled={busy}
                >
                  <option value="">Not provided</option>
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                </select>
              </div>
              <div>
                <label htmlFor="discover-medications">
                  Medications to review
                </label>
                <input
                  id="discover-medications"
                  value={input.medications}
                  onChange={update("medications")}
                  maxLength={1000}
                  disabled={busy}
                  placeholder="Comma-separated; optional"
                />
              </div>
              <div>
                <label htmlFor="discover-other">
                  Other conditions to review
                </label>
                <input
                  id="discover-other"
                  value={input.otherConditions}
                  onChange={update("otherConditions")}
                  maxLength={1000}
                  disabled={busy}
                  placeholder="Comma-separated; optional"
                />
              </div>
            </div>
          </details>
          <p className="small muted">
            Use non-identifying context. Age/sex observations never confirm
            eligibility.
          </p>
        </form>
      )}
      {busy && (
        <div className="trial-loading" role="status">
          <span className="spinner" />
          <div>
            <strong>Searching registry records</strong>
            <span>
              Fetching up to 100 trials. Your last search stays available.
            </span>
          </div>
        </div>
      )}
      {!snapshot && !busy && (
        <div className="discovery-empty">
          <div className="empty-illustration">
            <Icon name="search" size={42} />
            <span>
              <Icon name="check" size={19} />
            </span>
          </div>
          <h3>A shortlist starts with a search</h3>
          <p>Registry facts first. Clear checks, conflicts and unknowns.</p>
          <div className="condition-presets">
            {["Parkinson disease", "ALS", "breast cancer"].map((condition) => (
              <button
                className="secondary"
                key={condition}
                disabled={busy}
                onClick={() => {
                  setInput({ ...input, condition });
                  document.getElementById("discover-condition")?.focus();
                }}
              >
                {condition}
              </button>
            ))}
          </div>
        </div>
      )}
      {snapshot && (
        <>
          <div className="search-summary">
            <div className="search-chips">
              <span>
                <Icon name="search" size={16} />
                {snapshot.input.condition}
              </span>
              {snapshot.input.location && (
                <span>
                  <Icon name="pin" size={16} />
                  {snapshot.input.location}
                </span>
              )}
              <span>
                {snapshot.input.status === "open"
                  ? "Open enrollment"
                  : "All statuses"}
              </span>
              {snapshot.input.age !== "" && (
                <span>Age {snapshot.input.age}</span>
              )}
            </div>
            <span className="small muted">
              {workspace.demo
                ? "Illustrative snapshot"
                : `Retrieved ${new Date(snapshot.retrievedAt).toLocaleString()}`}
            </span>
          </div>
          <div className="discovery-metrics">
            <div>
              <Icon name="search" />
              <strong>{snapshot.stats.returned}</strong>
              <span>trials in this snapshot</span>
            </div>
            <div>
              <Icon name="check" />
              <strong>
                {
                  snapshot.results.filter(
                    (trial) => !trial.screening?.counts.conflict,
                  ).length
                }
              </strong>
              <span>without detected age/sex conflict</span>
            </div>
            <div>
              <Icon name="bookmark" />
              <strong>
                {
                  workspace.bookmarks.filter(
                    (trial) => trial.type === "clinicalTrial",
                  ).length
                }
              </strong>
              <span>on your shortlist</span>
            </div>
          </div>
          <div className="result-toolbar">
            <div className="segmented">
              <button
                aria-pressed={localFilter === "all"}
                onClick={() => setLocalFilter("all")}
              >
                All trials
              </button>
              <button
                aria-pressed={localFilter === "clear"}
                onClick={() => setLocalFilter("clear")}
              >
                No detected conflict
              </button>
              <button
                aria-pressed={localFilter === "review"}
                onClick={() => setLocalFilter("review")}
              >
                Conflicts
              </button>
            </div>
            <div>
              <label className="sr-only" htmlFor="trial-text-filter">
                Filter snapshot by title or registry ID
              </label>
              <input
                id="trial-text-filter"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Filter title or registry ID"
              />
            </div>
          </div>
          <div className="trial-grid">
            {trials.map((trial) => (
              <TrialCard
                key={trial.id}
                trial={trial}
                saved={workspace.bookmarks.some((item) => item.id === trial.id)}
                selected={selected.some((item) => item.id === trial.id)}
                onSave={onSave}
                onCompare={onCompare}
                onOpen={onOpen}
                disabled={busy}
              />
            ))}
          </div>
          {!trials.length && (
            <div className="empty-state">
              <Icon name="search" size={30} />
              <h3>
                {snapshot.results.length
                  ? "No trials match this view"
                  : "No trials found in this search"}
              </h3>
              <p>
                {snapshot.results.length
                  ? "Clear the snapshot filters to see all results."
                  : "Edit your search to broaden it. Location and enrollment preferences have not been silently removed."}
              </p>
              <button
                className="secondary"
                onClick={() => {
                  setLocalFilter("all");
                  setText("");
                  setEditing(true);
                }}
              >
                Adjust filters
              </button>
            </div>
          )}
          <details className="search-coverage">
            <summary>Search coverage & excluded records</summary>
            <p>{snapshot.methodology}</p>
            <p>
              {snapshot.stats.scanned} records scanned out of{" "}
              {snapshot.stats.totalCount ?? "an unknown number of"} registry
              matches.{" "}
              {snapshot.stats.truncated
                ? "More records exist; this snapshot is capped at 100. Narrow the registry search to reduce the pool."
                : "No additional page was reported by the provider."}
            </p>
            {snapshot.excluded?.map((item) => (
              <p key={item.id}>
                {item.id}: {item.reason}
              </p>
            ))}
          </details>
          {selected.length > 0 && (
            <div className="compare-dock">
              <span>{selected.length} selected</span>
              <button className="primary" onClick={onCompareView}>
                <Icon name="compare" size={17} />
                Compare trials
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function TrialDialog({ trial, onClose }) {
  const ref = useRef(null);
  const [tab, setTab] = useState("screening");
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const url = safeUrl(trial.url);
  return (
    <dialog
      ref={ref}
      className="source-dialog trial-dialog"
      onCancel={onClose}
      aria-labelledby="trial-dialog-title"
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-header">
        <span className="trial-status">
          {statusLabel(trial.status)} · {trial.id}
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close trial detail"
        >
          <Icon name="close" />
        </button>
      </div>
      <h2 id="trial-dialog-title">{trial.title}</h2>
      <p className="small muted">
        {trial.sponsor || "Sponsor not reported"} · {phaseLabel(trial.phases)}
      </p>
      <div className="screening-disclaimer">
        <Icon name="help" />
        <span>
          Preliminary observations only. The study team must confirm every
          eligibility requirement.
        </span>
      </div>
      <nav className="workspace-tabs" aria-label="Trial detail views">
        {[
          ["screening", "Screening checklist"],
          ["sites", "Sites & contacts"],
          ["protocol", "Full criteria"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "screening" && (
        <div className="screening-checklist">
          {(trial.screening?.rows || []).map((row) => (
            <article
              className={`criterion-row criterion-${row.state}`}
              key={row.kind}
            >
              <span className="criterion-symbol">
                <Icon
                  name={
                    row.state === "match"
                      ? "check"
                      : row.state === "conflict"
                        ? "alert"
                        : "help"
                  }
                  size={18}
                />
              </span>
              <div>
                <div className="criterion-heading">
                  <h3>{row.label}</h3>
                  <span>
                    {row.state === "match"
                      ? "Observed match"
                      : row.state === "conflict"
                        ? "Possible conflict"
                        : "Needs confirmation"}
                  </span>
                </div>
                <p>{row.note}</p>
                <details>
                  <summary>Registry evidence</summary>
                  <blockquote>{row.evidence}</blockquote>
                </details>
              </div>
            </article>
          ))}
        </div>
      )}
      {tab === "sites" && (
        <section>
          <h3>Sites & contacts</h3>
          {trial.siteDetails?.map((site, index) => (
            <article className="site-card" key={index}>
              <Icon name="pin" />
              <div>
                <strong>{site.facility || "Research site"}</strong>
                <p>
                  {[site.city, site.state, site.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <span className="badge">{statusLabel(site.status)}</span>
                {site.contacts?.map((contact, index) => (
                  <p key={index}>
                    {[contact.name, contact.phone, contact.email]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ))}
              </div>
            </article>
          ))}
          {!trial.siteDetails?.length && <p>Site details were not reported.</p>}
          <h3>Central contact</h3>
          <p>{trial.contact || "Not reported. Check the registry record."}</p>
          <h3>Ask the coordinator</h3>
          <ul>
            <li>Is this specific site enrolling now?</li>
            <li>
              Which diagnosis, prior-treatment and lab criteria need checking?
            </li>
            <li>What visits, travel and procedures are involved?</li>
          </ul>
        </section>
      )}
      {tab === "protocol" && (
        <section>
          <h3>Available study summary</h3>
          <p>{trial.summary || "Not reported"}</p>
          <h3>Full available eligibility criteria</h3>
          <p className="preserve-lines">
            {trial.eligibility || "Not reported"}
          </p>
          <p className="small muted">
            Last registry update: {trial.lastUpdated || "not reported"}.
            Registry entries may be incomplete or out of date.
          </p>
        </section>
      )}
      {url && (
        <a
          className="primary link-button"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open registry record <Icon name="arrow" size={17} />
        </a>
      )}
    </dialog>
  );
}

export function TrialComparison({ selected, onRemove, onOpen }) {
  if (!selected.length)
    return (
      <div className="discovery-empty">
        <Icon name="compare" size={40} />
        <h2>Compare your options</h2>
        <p>Select up to four trial cards to compare registry facts.</p>
      </div>
    );
  const rows = [
    ["Enrollment", (trial) => statusLabel(trial.status)],
    ["Phase", (trial) => phaseLabel(trial.phases)],
    [
      "Age criterion",
      (trial) =>
        `${trial.minimumAge || "Unknown"} – ${trial.maximumAge || "Unknown"}`,
    ],
    ["Sex criterion", (trial) => trial.sex || "Unknown"],
    [
      "Interventions",
      (trial) =>
        trial.interventions?.map((item) => item.name).join(", ") ||
        "Not reported",
    ],
    [
      "Sites",
      (trial) =>
        trial.locations?.join("; ") || trial.location || "Not reported",
    ],
    [
      "Screening",
      (trial) =>
        `${trial.screening?.counts.conflict || 0} detected conflicts; ${trial.screening?.counts.unknown || 0} checks remain unknown`,
    ],
    ["Sponsor", (trial) => trial.sponsor || "Not reported"],
    ["Registry updated", (trial) => trial.lastUpdated || "Not reported"],
  ];
  return (
    <section className="comparison">
      <h2>Trial comparison</h2>
      <p className="small muted">
        Registry facts, not treatment recommendations. Eligibility remains
        unconfirmed.
      </p>
      <div
        className="table-scroll"
        role="region"
        aria-label="Trial comparison table"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Check</th>
              {selected.map((trial) => (
                <th scope="col" key={trial.id}>
                  <button
                    className="source-title"
                    onClick={() => onOpen(trial)}
                  >
                    {trial.title}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => onRemove(trial)}
                  >
                    Remove trial
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {selected.map((trial) => (
                  <td key={trial.id}>{value(trial)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TrialShortlist({
  workspace,
  selected,
  onSave,
  onCompare,
  onOpen,
  busy,
}) {
  const trials = workspace.bookmarks.filter(
    (trial) => trial.type === "clinicalTrial",
  );
  return (
    <section className="shortlist-view">
      <div className="discovery-heading">
        <div>
          <span className="eyebrow">Your next conversation</span>
          <h2>Trial shortlist</h2>
        </div>
        <button
          className="primary"
          disabled={!trials.length}
          onClick={() => downloadShortlist(workspace)}
        >
          <Icon name="download" size={18} />
          Export shortlist
        </button>
      </div>
      <p className="small muted">
        Export registry facts, screening observations and questions for the
        study team.
      </p>
      <div className="trial-grid">
        {trials.map((trial) => (
          <TrialCard
            key={trial.id}
            trial={trial}
            saved
            selected={selected.some((item) => item.id === trial.id)}
            onSave={onSave}
            onCompare={onCompare}
            onOpen={onOpen}
            disabled={busy}
          />
        ))}
      </div>
      {!trials.length && (
        <div className="discovery-empty">
          <Icon name="bookmark" size={40} />
          <h3>Keep the trials you want to review</h3>
          <p>
            Use Shortlist on a trial card. Saved records remain tied to their
            original search.
          </p>
        </div>
      )}
    </section>
  );
}
