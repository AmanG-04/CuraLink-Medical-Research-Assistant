import { useCallback, useEffect, useRef, useState } from "react";
import { Welcome } from "./components/Welcome.jsx";
import {
  TrialDiscovery,
  TrialDialog,
  TrialComparison,
  TrialShortlist,
} from "./components/Trials.jsx";
import { Icon } from "./components/Icon.jsx";
import { Benchmark } from "./components/Benchmark.jsx";
import { LegalLinks, LegalPage } from "./components/Legal.jsx";
import {
  Answer,
  Comparison,
  SourceCard,
  SourceDialog,
} from "./components/Evidence.jsx";
import { demoWorkspace } from "./data/demo.js";
import { request, research } from "./lib/api.js";
import { exportBrief, references } from "./lib/evidence.js";

const blankContext = {
  disease: "",
  location: "",
  symptoms: "",
  patientAge: "",
  patientMedications: "",
  patientComorbidities: "",
  specialtyRole: "",
  clinicalQuestionType: "",
};
const samples = [
  {
    title: "Explore treatment evidence",
    disease: "Parkinson disease",
    question:
      "What does research report about deep brain stimulation outcomes and limitations?",
  },
  {
    title: "Find recruiting trials",
    disease: "ALS",
    question:
      "Find recruiting clinical trials for ALS and explain what needs to be checked before enrollment.",
  },
  {
    title: "Review prevention research",
    disease: "kidney stones",
    question:
      "What evidence is available about preventing recurrent kidney stones?",
  },
];

export function App() {
  const [page, setPage] = useState(window.location.hash.slice(1));
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [persistence, setPersistence] = useState("");
  const [workspaces, setWorkspaces] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [source, setSource] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [context, setContext] = useState(blankContext);
  const [input, setInput] = useState("");
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState("answer");
  const [selected, setSelected] = useState([]);
  const [selectedTrials, setSelectedTrials] = useState([]);
  const [trialDetail, setTrialDetail] = useState(null);
  const [filter, setFilter] = useState({
    kind: "all",
    recruiting: false,
    location: "",
    phase: "",
    age: "",
  });
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef(null);
  const workspaceRef = useRef(null);
  const messagesRef = useRef(null);
  const operationRef = useRef(false);

  const loadList = useCallback(async () => {
    const result = await request("/conversations");
    setWorkspaces(result.workspaces);
    return result.workspaces;
  }, []);

  const selectWorkspace = useCallback((next) => {
    workspaceRef.current = next;
    setWorkspace(next);
    setContext({
      ...blankContext,
      ...Object.fromEntries(
        Object.keys(blankContext).map((key) => [
          key,
          next.context?.[key === "disease" ? "condition" : key] || "",
        ]),
      ),
    });
    setNotes(next.notes || "");
    setSelected([]);
    setSelectedTrials([]);
    setTab("answer");
    setInput("");
    setError("");
    setNotice("");
    setSidebarOpen(false);
    if (!next.demo) localStorage.setItem("curalink-workspace", next.sessionId);
  }, []);

  useEffect(() => {
    const hash = () => setPage(window.location.hash.slice(1));
    window.addEventListener("hashchange", hash);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 70000);
    (async () => {
      try {
        const health = await request("/health", { signal: controller.signal });
        setReady(true);
        setPersistence(health.persistence);
        const result = await request("/auth/me", { signal: controller.signal });
        if (result.user) {
          setUser(result.user);
          const list = await loadList();
          const savedId = localStorage.getItem("curalink-workspace");
          if (
            !workspaceRef.current &&
            list.some((entry) => entry.sessionId === savedId)
          )
            selectWorkspace(await request(`/conversations/${savedId}`));
        }
      } catch {
        /* Account access supplies a retry path; sample remains usable. */
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      window.removeEventListener("hashchange", hash);
      controller.abort();
      clearTimeout(timeout);
    };
  }, [loadList, selectWorkspace]);

  useEffect(() => {
    const element = messagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [workspace?.turns?.length, progress, tab]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const close = (event) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        document
          .querySelector('[aria-label="Open workspace navigation"]')
          ?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [sidebarOpen]);

  async function authenticate(action, credentials) {
    const result = await request(`/auth/${action}`, {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    setUser(result.user);
    setReady(true);
    const list = await loadList();
    if (list.length)
      selectWorkspace(await request(`/conversations/${list[0].sessionId}`));
    else {
      workspaceRef.current = null;
      setWorkspace(null);
    }
  }

  async function openWorkspace(id) {
    if (busy) return;
    try {
      selectWorkspace(await request(`/conversations/${id}`));
    } catch (error) {
      setError(error.message);
    }
  }

  async function createWorkspace(userType) {
    if (operationRef.current) return;
    operationRef.current = true;
    setBusy(true);
    setError("");
    try {
      selectWorkspace(
        await request("/conversations", {
          method: "POST",
          body: JSON.stringify({ title: "Untitled research", userType }),
        }),
      );
      await loadList();
    } catch (error) {
      setError(error.message);
    } finally {
      operationRef.current = false;
      setBusy(false);
    }
  }

  async function patchWorkspace(patch) {
    if (workspace.demo) {
      const bookmarks = patch.bookmarkId
        ? [
            ...workspace.bookmarks,
            ...[
              ...(workspace.trialSearch?.results || []),
              ...references(workspace.turns.at(-1)?.sources),
            ].filter((item) => item.id === patch.bookmarkId),
          ]
        : patch.removeBookmarkId
          ? workspace.bookmarks.filter(
              (item) => item.id !== patch.removeBookmarkId,
            )
          : workspace.bookmarks;
      setWorkspace((current) => ({ ...current, ...patch, bookmarks }));
      return;
    }
    const result = await request(`/conversations/${workspace.sessionId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setWorkspace((current) => ({ ...current, ...result }));
    if (patch.title) await loadList();
  }

  async function bookmark(item) {
    if (operationRef.current) return;
    operationRef.current = true;
    try {
      await patchWorkspace(
        workspace.bookmarks.some((entry) => entry.id === item.id)
          ? { removeBookmarkId: item.id }
          : { bookmarkId: item.id },
      );
    } catch (error) {
      setError(error.message);
    } finally {
      operationRef.current = false;
    }
  }

  function compare(item) {
    setSelected((current) => {
      if (current.some((entry) => entry.id === item.id))
        return current.filter((entry) => entry.id !== item.id);
      if (current.length >= 4) {
        setNotice("Select up to four papers at a time.");
        return current;
      }
      return [...current, item];
    });
  }

  async function submit(event, preset) {
    event?.preventDefault();
    const question = (preset?.question || input).trim();
    if (!question || operationRef.current || workspace.demo) return;
    const nextContext = preset
      ? { ...context, disease: preset.disease }
      : context;
    const previous = workspace.context || {};
    // Send changed fields only, preserving natural-language context updates.
    const changes = Object.fromEntries(
      Object.entries(nextContext).filter(
        ([key, value]) =>
          value !== (previous[key === "disease" ? "condition" : key] || ""),
      ),
    );
    operationRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setPendingQuestion(question);
    setTab("answer");
    setProgress({
      phase: "connecting",
      message: "Connecting to the research service",
    });
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 115000);
    try {
      if (workspace.title === "Untitled research")
        await patchWorkspace({
          title: (nextContext.disease || question).slice(0, 100),
        });
      const result = await research(
        { sessionId: workspace.sessionId, message: question, ...changes },
        controller.signal,
        setProgress,
      );
      selectWorkspace(result);
      setTab("answer");
      await loadList();
    } catch (error) {
      setError(
        error.name === "AbortError"
          ? "Stopped waiting for this research. The server may still finish; refresh before retrying."
          : error.message,
      );
      setInput(question);
    } finally {
      clearTimeout(timeout);
      setBusy(false);
      setProgress(null);
      setPendingQuestion("");
      operationRef.current = false;
    }
  }

  function compareTrial(item) {
    setSelectedTrials((current) => {
      if (current.some((trial) => trial.id === item.id))
        return current.filter((trial) => trial.id !== item.id);
      if (current.length >= 4) {
        setNotice("Compare up to four trials at a time.");
        return current;
      }
      return [...current, item];
    });
  }

  async function searchTrials(search) {
    if (operationRef.current || workspace.demo) return;
    operationRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 110000);
    try {
      const result = await request("/trials/search", {
        method: "POST",
        body: JSON.stringify({ sessionId: workspace.sessionId, search }),
        signal: controller.signal,
      });
      setWorkspace((current) => ({ ...current, ...result }));
      setSelectedTrials([]);
      await loadList();
    } catch (error) {
      setError(
        error.name === "AbortError"
          ? "Search timed out. Your previous snapshot is preserved; refresh before retrying."
          : error.message,
      );
    } finally {
      clearTimeout(timer);
      setBusy(false);
      operationRef.current = false;
    }
  }

  async function refreshWorkspace() {
    try {
      selectWorkspace(await request(`/conversations/${workspace.sessionId}`));
      await loadList();
    } catch (error) {
      setError(error.message);
    }
  }

  async function removeWorkspace() {
    if (
      !window.confirm(
        `Delete "${workspace.title}" and its saved research? This cannot be undone.`,
      )
    )
      return;
    try {
      await request(`/conversations/${workspace.sessionId}`, {
        method: "DELETE",
      });
      setWorkspace(null);
      workspaceRef.current = null;
      localStorage.removeItem("curalink-workspace");
      await loadList();
    } catch (error) {
      setError(error.message);
    }
  }

  async function logout() {
    try {
      await request("/auth/logout", { method: "POST" });
      setUser(null);
      setWorkspace(null);
      workspaceRef.current = null;
      setWorkspaces([]);
      localStorage.removeItem("curalink-workspace");
    } catch (error) {
      setError(error.message);
    }
  }

  if (["terms", "privacy", "disclaimer"].includes(page))
    return <LegalPage page={page} />;
  if (page === "benchmark") return <Benchmark />;
  if (!user && !workspace?.demo)
    return (
      <Welcome
        onAuth={authenticate}
        onDemo={(type) => selectWorkspace(demoWorkspace(type))}
        ready={ready}
        persistence={persistence}
      />
    );

  const latest = [...(workspace?.turns || [])]
    .reverse()
    .find((turn) => turn.role === "assistant");
  const latestSources = references(latest?.sources);
  const filteredSources = latestSources.filter((item) => {
    if (filter.kind !== "all" && item.type !== filter.kind) return false;
    if (item.type === "clinicalTrial") {
      if (
        filter.recruiting &&
        !["RECRUITING", "ENROLLING_BY_INVITATION"].includes(item.status)
      )
        return false;
      if (filter.phase && !item.phases?.includes(filter.phase)) return false;
      if (
        filter.location &&
        !(item.locations || [item.location || ""])
          .join(" ")
          .toLowerCase()
          .includes(filter.location.toLowerCase())
      )
        return false;
      if (filter.age) {
        const age = Number(filter.age);
        const min = item.minimumAge?.match(/^(\d+) Years?$/i);
        const max = item.maximumAge?.match(/^(\d+) Years?$/i);
        if ((min && age < Number(min[1])) || (max && age > Number(max[1])))
          return false;
      }
    }
    return true;
  });

  return (
    <div className={`research-shell ${sidebarOpen ? "sidebar-open" : ""}`}>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close workspace navigation"
        />
      )}
      <aside className="workspace-sidebar" id="workspace-navigation">
        <a className="brand" href="#">
          CuraLink
          <span>Medical research assistant</span>
        </a>
        <div className="sidebar-create">
          <button
            className="primary"
            disabled={busy || !user}
            onClick={() => createWorkspace("patient")}
          >
            + Patient workspace
          </button>
          <button
            className="secondary"
            disabled={busy || !user}
            onClick={() => createWorkspace("clinician")}
          >
            + Clinician workspace
          </button>
        </div>
        <h2 className="sidebar-label">Your workspaces</h2>
        <nav className="workspace-list" aria-label="Saved workspaces">
          {workspaces.map((item) => (
            <button
              key={item.sessionId}
              disabled={busy}
              aria-current={
                workspace?.sessionId === item.sessionId ? "page" : undefined
              }
              onClick={() => openWorkspace(item.sessionId)}
            >
              <strong>{item.title}</strong>
              <span>
                {item.context?.userType === "clinician"
                  ? "Clinician"
                  : "Patient"}{" "}
                · {new Date(item.updatedAt).toLocaleDateString()}
              </span>
            </button>
          ))}
          {!workspaces.length && (
            <p className="small muted">Your saved research will appear here.</p>
          )}
        </nav>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => selectWorkspace(demoWorkspace())}
        >
          Explore sample workspace
        </button>
        <div className="sidebar-footer">
          <p className="small muted">
            {user ? `Signed in as ${user.username}` : "Guest demonstration"}
          </p>
          {user ? (
            <button className="text-button" disabled={busy} onClick={logout}>
              Sign out
            </button>
          ) : (
            <button
              className="text-button"
              onClick={() => {
                setWorkspace(null);
                workspaceRef.current = null;
              }}
            >
              Sign in to save research
            </button>
          )}
          <details className="sidebar-information">
            <summary>About & legal</summary>
            <LegalLinks />
            <a className="small" href="#benchmark">
              Retrieval benchmark
            </a>
          </details>
        </div>
      </aside>
      <main className="workspace-main">
        <div className="mobile-workspace-bar">
          <button
            className="icon-button"
            aria-label="Open workspace navigation"
            aria-controls="workspace-navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Icon name="menu" />
          </button>
          <span className="brand">CuraLink</span>
        </div>
        {!workspace ? (
          <section className="workspace-start">
            <span className="eyebrow">Your next research question</span>
            <h1>Start a research conversation</h1>
            <p>
              Choose your audience, then ask CuraLink a question. Publications
              and trial tools support your conversation.
            </p>
            <div className="audience-grid">
              <button
                className="choice-card"
                disabled={busy}
                onClick={() => createWorkspace("patient")}
              >
                <h2>Patients & caregivers</h2>
                <p>Plain-language research explanations.</p>
              </button>
              <button
                className="choice-card"
                disabled={busy}
                onClick={() => createWorkspace("clinician")}
              >
                <h2>Clinicians & researchers</h2>
                <p>Evidence details and trial screening.</p>
              </button>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <p className="notice">
              Educational use only. Do not enter identifying patient
              information.
            </p>
          </section>
        ) : (
          <>
            <header className="workspace-header">
              <div>
                <span className="eyebrow">
                  {workspace.context?.userType === "clinician"
                    ? "Clinician & researcher"
                    : "Patient & caregiver"}{" "}
                  workspace
                </span>
                <h1>{workspace.title}</h1>
              </div>
              <div className="header-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setTab("context");
                  }}
                >
                  <Icon name="filter" size={17} />
                  <span>Edit workspace</span>
                </button>
                <button
                  className="secondary"
                  onClick={() => exportBrief(workspace)}
                >
                  <Icon name="download" size={17} />
                  <span>Export brief</span>
                </button>
              </div>
            </header>
            <div className="workspace-safety-row">
              <div className="medical-notice">
                <Icon name="help" size={17} />
                <strong>Research only · Not medical advice</strong>
                <span>
                  <a
                    href="#disclaimer"
                    title="For emergencies, seek immediate care. Read the full medical disclaimer."
                  >
                    Disclaimer
                  </a>
                </span>
              </div>
              {workspace.demo && (
                <span
                  className="demo-banner"
                  title="Illustrative records, no live research. Bookmarks and notes are temporary."
                >
                  Illustrative demo
                </span>
              )}
              {persistence === "temporary-memory" && !workspace.demo && (
                <p className="notice">
                  Temporary storage: accounts and workspaces reset on server
                  restart.
                </p>
              )}
            </div>
            <nav className="workspace-tabs" aria-label="Workspace views">
              {[
                ["answer", "Chat with CuraLink", "chat"],
                ["discover", "Find trials", "search"],
                ...(selectedTrials.length || tab === "trialcompare"
                  ? [
                      [
                        "trialcompare",
                        `Trial comparison (${selectedTrials.length})`,
                        "compare",
                      ],
                    ]
                  : []),
                [
                  "shortlist",
                  `Shortlist (${workspace.bookmarks.filter((item) => item.type === "clinicalTrial").length})`,
                  "bookmark",
                ],
                ["context", "Context & notes", "filter"],
              ].map(([id, label, icon]) => (
                <button
                  key={id}
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => setTab(id)}
                >
                  <Icon name={icon} size={17} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
            {["answer", "sources", "compare", "saved"].includes(tab) && (
              <nav
                className="workspace-tabs evidence-subnav"
                aria-label="Evidence tools"
              >
                {[
                  ["sources", `Sources (${latestSources.length})`],
                  ["compare", `Compare (${selected.length})`],
                  ["saved", `Saved (${workspace.bookmarks.length})`],
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
            )}
            {error && (
              <div className="error" role="alert">
                <p>{error}</p>
                {!workspace.demo && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={refreshWorkspace}
                  >
                    Refresh workspace
                  </button>
                )}
              </div>
            )}
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            <div className={`workspace-body view-${tab}`}>
              {tab === "discover" && (
                <TrialDiscovery
                  key={workspace.sessionId}
                  workspace={workspace}
                  busy={busy}
                  onSearch={searchTrials}
                  onSave={bookmark}
                  selected={selectedTrials}
                  onCompare={compareTrial}
                  onOpen={setTrialDetail}
                  onCompareView={() => setTab("trialcompare")}
                />
              )}
              {tab === "trialcompare" && (
                <TrialComparison
                  selected={selectedTrials}
                  onRemove={compareTrial}
                  onOpen={setTrialDetail}
                />
              )}
              {tab === "shortlist" && (
                <TrialShortlist
                  workspace={workspace}
                  selected={selectedTrials}
                  onSave={bookmark}
                  onCompare={compareTrial}
                  onOpen={setTrialDetail}
                  busy={busy}
                />
              )}
              {tab === "answer" && (
                <section className="research-column">
                  <div
                    className="messages"
                    ref={messagesRef}
                    role="region"
                    aria-label="Research conversation"
                    tabIndex={0}
                  >
                    {!workspace.turns.length && (
                      <section className="research-empty">
                        <span className="mini-icon">
                          <Icon name="chat" />
                        </span>
                        <h2>Ask CuraLink</h2>
                        <p>What would you like to understand?</p>
                        <div className="sample-list">
                          {samples.map((sample) => (
                            <button
                              className="sample-button"
                              key={sample.title}
                              disabled={busy}
                              onClick={() => submit(undefined, sample)}
                            >
                              <Icon
                                name={
                                  sample.title.includes("trials")
                                    ? "search"
                                    : "book"
                                }
                                size={20}
                              />
                              <div>
                                {sample.title}
                                <span>{sample.disease}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                        <details className="quick-context">
                          <summary>Add condition & location (optional)</summary>
                          <label htmlFor="quick-condition">
                            Condition (optional if clear from your question)
                          </label>
                          <input
                            id="quick-condition"
                            value={context.disease}
                            onChange={(event) =>
                              setContext({
                                ...context,
                                disease: event.target.value,
                              })
                            }
                            placeholder="e.g. Parkinson disease"
                            maxLength={120}
                            disabled={busy}
                          />
                          <label htmlFor="quick-location">
                            Trial location (optional)
                          </label>
                          <input
                            id="quick-location"
                            value={context.location}
                            onChange={(event) =>
                              setContext({
                                ...context,
                                location: event.target.value,
                              })
                            }
                            placeholder="City or country"
                            maxLength={120}
                            disabled={busy}
                          />
                        </details>
                      </section>
                    )}
                    {workspace.turns.map((turn, index) =>
                      turn.role === "assistant" ? (
                        <Answer
                          turn={turn}
                          onOpen={setSource}
                          key={`${turn.createdAt}-${index}`}
                        />
                      ) : (
                        <article
                          className="user-question"
                          key={`${turn.createdAt}-${index}`}
                        >
                          <span className="sr-only">You asked</span>
                          <p>{turn.message}</p>
                        </article>
                      ),
                    )}
                    {busy && pendingQuestion && (
                      <>
                        <article className="user-question">
                          <span className="eyebrow">You asked</span>
                          <p>{pendingQuestion}</p>
                        </article>
                        <div className="research-progress" role="status">
                          <span className="spinner" />
                          <div>
                            <strong>{progress?.message}</strong>
                            <p>Free-tier services may take a moment.</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {workspace.demo ? (
                    <p className="notice">
                      Sign in and create a workspace to run a live research
                      question.
                    </p>
                  ) : (
                    <form className="composer" onSubmit={submit}>
                      <label htmlFor="question">
                        {workspace.turns.length
                          ? "Ask a follow-up question"
                          : "Your research question"}
                      </label>
                      <textarea
                        id="question"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder="What does the research say about…"
                        rows={3}
                        maxLength={3000}
                        disabled={busy}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            submit(event);
                          }
                        }}
                      />
                      <div className="composer-actions">
                        <button
                          className="text-button"
                          type="button"
                          disabled={busy}
                          onClick={() => setTab("context")}
                        >
                          {context.disease || "Add optional context"}
                          {context.location ? ` · ${context.location}` : ""}
                        </button>
                        {busy ? (
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => abortRef.current?.abort()}
                          >
                            Stop waiting
                          </button>
                        ) : (
                          <button className="primary" disabled={!input.trim()}>
                            <Icon name="arrow" size={18} />
                            <span>Send message</span>
                          </button>
                        )}
                      </div>
                      <p className="small muted">
                        Use non-identifying context · Enter to send
                      </p>
                    </form>
                  )}
                </section>
              )}
              {tab === "sources" && (
                <aside className="evidence-column">
                  <div className="section-heading">
                    <h2>Evidence shelf</h2>
                    <span className="badge">
                      {latestSources.length} sources
                    </span>
                  </div>
                  <p className="small muted">
                    Latest answer’s sources. Citations in earlier answers open
                    their original snapshots.
                  </p>
                  <div className="source-filters">
                    <label htmlFor="source-kind">Record type</label>
                    <select
                      id="source-kind"
                      value={filter.kind}
                      onChange={(event) =>
                        setFilter({ ...filter, kind: event.target.value })
                      }
                    >
                      <option value="all">All records</option>
                      <option value="publication">Publications</option>
                      <option value="clinicalTrial">Clinical trials</option>
                    </select>
                    <details>
                      <summary>Trial filters</summary>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={filter.recruiting}
                          onChange={(event) =>
                            setFilter({
                              ...filter,
                              recruiting: event.target.checked,
                            })
                          }
                        />
                        Recruiting / enrolling
                      </label>
                      <label htmlFor="trial-location">Location text</label>
                      <input
                        id="trial-location"
                        value={filter.location}
                        onChange={(event) =>
                          setFilter({ ...filter, location: event.target.value })
                        }
                        placeholder="e.g. Canada"
                      />
                      <label htmlFor="trial-phase">Phase</label>
                      <select
                        id="trial-phase"
                        value={filter.phase}
                        onChange={(event) =>
                          setFilter({ ...filter, phase: event.target.value })
                        }
                      >
                        <option value="">Any phase</option>
                        {["PHASE1", "PHASE2", "PHASE3", "PHASE4"].map(
                          (phase) => (
                            <option value={phase} key={phase}>
                              {phase.replace("PHASE", "Phase ")}
                            </option>
                          ),
                        )}
                      </select>
                      <label htmlFor="trial-age">Age in years</label>
                      <input
                        id="trial-age"
                        type="number"
                        min="0"
                        max="120"
                        value={filter.age}
                        onChange={(event) =>
                          setFilter({ ...filter, age: event.target.value })
                        }
                      />
                      <p className="small muted">
                        Filters apply to this shortlist, not a new registry
                        search. Unknown age limits remain visible.
                      </p>
                    </details>
                  </div>
                  {filteredSources.map((item) => (
                    <SourceCard
                      key={item.id}
                      source={item}
                      onOpen={setSource}
                      onBookmark={bookmark}
                      bookmarked={workspace.bookmarks.some(
                        (entry) => entry.id === item.id,
                      )}
                      selected={selected.some((entry) => entry.id === item.id)}
                      onSelect={compare}
                    />
                  ))}
                  {!filteredSources.length && (
                    <div className="empty-state">
                      <h3>
                        {latestSources.length
                          ? "No records match these filters"
                          : "Your sources will appear here"}
                      </h3>
                      <p>
                        {latestSources.length
                          ? "Broaden the filters or ask for a different search."
                          : "Run a question to retrieve publications and trials."}
                      </p>
                    </div>
                  )}
                  {selected.length > 0 && (
                    <button
                      className="secondary full"
                      onClick={() => setTab("compare")}
                    >
                      Compare {selected.length} selected papers
                    </button>
                  )}
                </aside>
              )}
              {tab === "compare" && (
                <Comparison
                  sources={selected}
                  onRemove={compare}
                  onOpen={setSource}
                />
              )}
              {tab === "saved" && (
                <section className="saved-view">
                  <h2>Bookmarked sources</h2>
                  <p className="muted">A reading list for this workspace.</p>
                  <div className="saved-grid">
                    {workspace.bookmarks.map((item) => (
                      <SourceCard
                        key={item.id}
                        source={item}
                        onOpen={setSource}
                        onBookmark={bookmark}
                        bookmarked
                        selected={selected.some(
                          (entry) => entry.id === item.id,
                        )}
                        onSelect={compare}
                      />
                    ))}
                  </div>
                  {!workspace.bookmarks.length && (
                    <p className="empty-state">
                      Bookmark a source from the evidence shelf to keep it here.
                    </p>
                  )}
                </section>
              )}
              {tab === "context" && (
                <section className="context-view">
                  <h2>Workspace context & notes</h2>
                  <p className="muted">
                    Context changes apply to your next research question. Use
                    fictitious or non-identifying details.
                  </p>
                  <form
                    onSubmit={async (event) => {
                      event.preventDefault();
                      try {
                        await patchWorkspace({
                          title: new FormData(event.currentTarget).get("title"),
                          notes,
                        });
                        setNotice(
                          "Workspace title and notes saved. Context will apply to your next question.",
                        );
                      } catch (error) {
                        setError(error.message);
                      }
                    }}
                  >
                    <label htmlFor="workspace-title">Workspace title</label>
                    <input
                      id="workspace-title"
                      name="title"
                      defaultValue={workspace.title}
                      key={workspace.sessionId}
                      maxLength={100}
                      required
                      disabled={busy}
                    />
                    <div className="context-fields">
                      {[
                        ["disease", "Condition"],
                        ["location", "Trial location"],
                        ["symptoms", "Symptoms / research context"],
                        ["patientAge", "Age in years"],
                        ["patientComorbidities", "Other conditions"],
                        ["patientMedications", "Current medications"],
                        ...(workspace.context.userType === "clinician"
                          ? [
                              ["specialtyRole", "Specialty / role"],
                              [
                                "clinicalQuestionType",
                                "Clinical question type",
                              ],
                            ]
                          : []),
                      ].map(([key, label]) => (
                        <div key={key}>
                          <label htmlFor={`context-${key}`}>
                            {label} (optional)
                          </label>
                          <input
                            id={`context-${key}`}
                            value={context[key]}
                            maxLength={2000}
                            disabled={busy}
                            onChange={(event) =>
                              setContext({
                                ...context,
                                [key]: event.target.value,
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <label htmlFor="notes">Research notes</label>
                    <textarea
                      id="notes"
                      rows={7}
                      value={notes}
                      maxLength={20000}
                      disabled={busy}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Questions to revisit, sources to read, or discussion points…"
                    />
                    <button className="primary" disabled={busy}>
                      Save title & notes
                    </button>
                  </form>
                  {!workspace.demo && (
                    <button
                      className="danger-button"
                      disabled={busy}
                      onClick={removeWorkspace}
                    >
                      Delete this workspace
                    </button>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </main>
      {source && (
        <SourceDialog source={source} onClose={() => setSource(null)} />
      )}
      {trialDetail && (
        <TrialDialog trial={trialDetail} onClose={() => setTrialDetail(null)} />
      )}
    </div>
  );
}
