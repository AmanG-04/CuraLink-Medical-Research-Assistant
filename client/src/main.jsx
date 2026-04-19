import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const SESSION_KEY = "curalink-session-id";
const WARMUP_TIMEOUT_MS = 65000;

const personas = {
  patient: {
    label: "Patients and caregivers",
    shortLabel: "Patient",
    intro:
      "I can help translate current research into plain language and look for trial options that may fit your context.",
    placeholder: "Type a name, or say skip",
    samples: ["Can cataracts happen at 21?", "Are there trials near Toronto?", "What should I ask my doctor?"]
  },
  clinician: {
    label: "Clinicians and researchers",
    shortLabel: "Clinician",
    intro:
      "I can help scan publications, compare trial options, and summarize evidence with structured citations.",
    placeholder: "Type a label, or say skip",
    samples: ["Compare DBS trials in Parkinson disease", "Rank recent GLP-1 obesity papers", "Find recruiting ALS trials"]
  }
};

const patientIntakeSteps = [
  {
    key: "patientName",
    prompt: "Hi, I am CuraLink. What name or label should I use for this research conversation?",
    placeholder: "Type a name, or say skip",
    optional: true,
    normalize(value) {
      return isSkip(value) ? "" : value;
    }
  },
  {
    key: "disease",
    prompt: "What condition or disease should I research?",
    placeholder: "Example: kidney stones, cataract, Parkinson disease",
    requiredMessage: "Please share a condition so I can retrieve relevant medical research."
  },
  {
    key: "symptoms",
    prompt: "What symptoms, stage, age, or extra context should I keep in mind?",
    placeholder: "Example: severe pain, 21 years old, recurrent episodes, or skip",
    optional: true,
    normalize(value) {
      return isSkip(value) ? "" : value;
    }
  },
  {
    key: "location",
    prompt: "Where should I look for trial options? You can give a city/country or say skip.",
    placeholder: "Example: India, Toronto Canada, or skip",
    optional: true,
    normalize(value) {
      return isSkip(value) ? "" : value;
    }
  },
  {
    key: "question",
    prompt: "What research question should I answer first?",
    placeholder: "Example: how to prevent it?",
    requiredMessage: "Please ask a research question so I can start."
  }
];

const clinicianIntakeSteps = [
  {
    key: "specialtyRole",
    prompt: "What is your specialty or role in this referral?",
    placeholder: "Example: neurologist, movement disorders fellow, primary care clinician, or skip",
    optional: true,
    normalize(value) {
      return isSkip(value) ? "" : value;
    }
  },
  {
    key: "disease",
    prompt: "What condition or diagnosis should I use for the patient referral?",
    placeholder: "Example: Parkinson disease, ALS, multiple sclerosis",
    requiredMessage: "Please share the patient condition so I can filter trials."
  },
  {
    key: "patientAge",
    prompt: "What is the patient age or age range?",
    placeholder: "Example: 67, 18-35, or skip",
    optional: true,
    normalize(value) {
      return isSkip(value) ? "" : value;
    }
  },
  {
    key: "patientComorbidities",
    prompt: "Any important comorbidities or exclusion concerns?",
    placeholder: "Example: diabetes, CKD, prior stroke, or skip",
    optional: true,
    normalize(value) {
      return isSkip(value) ? "" : value;
    }
  },
  {
    key: "patientMedications",
    prompt: "What current medications should I screen against trial criteria?",
    placeholder: "Example: levodopa, warfarin, steroids, or skip",
    optional: true,
    normalize(value) {
      return isSkip(value) ? "" : value;
    }
  },
  {
    key: "clinicalQuestionType",
    prompt: "What type of clinical question do you want answered?",
    placeholder: "Example: eligibility screening, efficacy, safety, or trial comparison",
    optional: true,
    normalize(value) {
      return isSkip(value) ? "" : value;
    }
  },
  {
    key: "location",
    prompt: "Where should I look for trial options? You can give a city/country or say skip.",
    placeholder: "Example: Canada, Toronto, or skip",
    optional: true,
    normalize(value) {
      return isSkip(value) ? "" : value;
    }
  },
  {
    key: "question",
    prompt: "What should I answer first for this patient referral?",
    placeholder: "Example: Which trials fit this profile?",
    requiredMessage: "Please ask a referral question so I can start."
  }
];

function buildIntakeSteps(persona) {
  return persona === "clinician" ? clinicianIntakeSteps : patientIntakeSteps;
}

function emptyDraft() {
  return {
    patientName: "",
    specialtyRole: "",
    disease: "",
    patientAge: "",
    patientComorbidities: "",
    patientMedications: "",
    clinicalQuestionType: "",
    symptoms: "",
    location: "",
    question: ""
  };
}

function getSessionId() {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, next);
  return next;
}

function createSessionId() {
  const next = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, next);
  return next;
}

function isSkip(value = "") {
  return /^(skip|none|no|na|n\/a)$/i.test(value.trim());
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.details || payload.error || `Request failed with ${response.status}`);
  }

  return response.json();
}

async function wakeBackend() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Health check failed with ${response.status}`);
    }
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

function App() {
  const [sessionId, setSessionId] = useState(() => getSessionId());
  const [persona, setPersona] = useState("");
  const [draft, setDraft] = useState(() => emptyDraft());
  const [stepIndex, setStepIndex] = useState(0);
  const [input, setInput] = useState("");
  const [localTurns, setLocalTurns] = useState([]);
  const [serverTurns, setServerTurns] = useState([]);
  const [context, setContext] = useState({});
  const [latestSources, setLatestSources] = useState({ publications: [], clinicalTrials: [] });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [warmupStatus, setWarmupStatus] = useState("waking");
  const messagesRef = useRef(null);

  const selectedPersona = personas[persona];
  const intakeSteps = useMemo(() => buildIntakeSteps(persona), [persona]);
  const currentStep = intakeSteps[stepIndex];
  const isResearchReady = stepIndex >= intakeSteps.length;
  const displayTurns = [...localTurns, ...serverTurns];

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [displayTurns.length, status]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await wakeBackend();
        if (!cancelled) setWarmupStatus("ready");
      } catch {
        if (!cancelled) setWarmupStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function choosePersona(nextPersona) {
    localStorage.setItem(`${SESSION_KEY}-persona`, nextPersona);
    const nextSteps = buildIntakeSteps(nextPersona);
    setPersona(nextPersona);
    setDraft(emptyDraft());
    setStepIndex(0);
    setInput("");
    setLocalTurns([
      {
        role: "assistant",
        message: nextSteps[0].prompt,
        createdAt: new Date().toISOString()
      }
    ]);
    setServerTurns([]);
    setContext({});
    setLatestSources({ publications: [], clinicalTrials: [] });
    setStatus("idle");
    setError("");
  }

  async function resetSession() {
    try {
      await apiRequest(`/api/conversations/${sessionId}`, { method: "DELETE" });
    } catch {
      // Ignore reset errors and still clear the local state.
    }

    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(`${SESSION_KEY}-persona`);
    const nextSessionId = createSessionId();
    setSessionId(nextSessionId);
    setPersona("");
    setDraft(emptyDraft());
    setStepIndex(0);
    setInput("");
    setLocalTurns([]);
    setServerTurns([]);
    setContext({});
    setLatestSources({ publications: [], clinicalTrials: [] });
    setStatus("idle");
    setError("");
  }

  async function submit(event, preset) {
    event?.preventDefault();
    const value = (preset ?? input).trim();
    if (!value || status === "loading") return;

    setError("");
    setInput("");

    if (!isResearchReady) {
      await handleIntakeValue(value);
      return;
    }

    await runResearch(value, draft);
  }

  function handleTextareaKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submit(undefined, event.currentTarget.value);
  }

  async function handleIntakeValue(value) {
    const step = intakeSteps[stepIndex];
    const normalized = step.normalize ? step.normalize(value) : value;

    if (!normalized && !step.optional) {
      setLocalTurns((turns) => [
        ...turns,
        userTurn(value),
        assistantTurn(step.requiredMessage || "I need that before I can continue.")
      ]);
      return;
    }

    const nextDraft = { ...draft, [step.key]: normalized };
    const nextStepIndex = stepIndex + 1;
    setDraft(nextDraft);
    setStepIndex(nextStepIndex);

    const nextPrompt = intakeSteps[nextStepIndex]?.prompt;
    const nextTurns = [...localTurns, userTurn(value)];
    if (nextPrompt) nextTurns.push(assistantTurn(nextPrompt));

    if (nextStepIndex >= intakeSteps.length) {
      setLocalTurns(nextTurns);
      await runResearch(nextDraft.question, nextDraft, nextTurns);
    } else {
      setLocalTurns(nextTurns);
    }
  }

  async function runResearch(question, contextDraft, preservedLocalTurns = localTurns) {
    setStatus("loading");
    const optimisticTurn = userTurn(question);
    if (isResearchReady) setServerTurns((turns) => [...turns, optimisticTurn]);

    try {
      const payload = await apiRequest("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          userType: persona,
          patientName: contextDraft.patientName,
          specialtyRole: contextDraft.specialtyRole,
          disease: contextDraft.disease,
          patientAge: contextDraft.patientAge,
          patientComorbidities: contextDraft.patientComorbidities,
          patientMedications: contextDraft.patientMedications,
          clinicalQuestionType: contextDraft.clinicalQuestionType,
          symptoms: contextDraft.symptoms,
          location: contextDraft.location,
          message: question,
          referralMode: persona === "clinician"
        })
      });

      setContext(payload.context || {});
      setLatestSources(payload.sources || { publications: [], clinicalTrials: [] });
      setServerTurns(payload.turns || []);
      setLocalTurns(preservedLocalTurns);
    } catch (err) {
      setError(err.message);
      const friendlyMessage = /failed to fetch/i.test(err?.message || "")
        ? "The backend may still be turning on. Please wait about 30 seconds and try again."
        : `I could not generate the answer yet: ${err.message}`;
      setLocalTurns((turns) => [
        ...turns,
        assistantTurn(friendlyMessage)
      ]);
      if (isResearchReady) {
        setServerTurns((turns) => turns.filter((turn) => turn !== optimisticTurn));
      }
    } finally {
      setStatus("idle");
    }
  }

  if (!persona) {
    return (
      <>
        <WarmupNotice status={warmupStatus} />
        <LandingPage onChoose={choosePersona} />
      </>
    );
  }

  return (
    <main className="app-shell">
      <WarmupNotice status={warmupStatus} />
      <section className="chat-page" aria-label="CuraLink medical research assistant">
        <header className="app-header">
          <div>
            <span className="eyebrow">CuraLink</span>
            <h1>{selectedPersona.label}</h1>
          </div>
          <div className="header-actions">
            <span>{selectedPersona.shortLabel} mode</span>
            <button className="secondary-button" type="button" onClick={resetSession}>
              New path
            </button>
          </div>
        </header>

        <section className="chat-grid">
          <section className="chat-panel">
            <div className="messages" aria-live="polite" ref={messagesRef}>
              {displayTurns.map((turn, index) => (
                <article
                  className={`message ${turn.role}`}
                  key={`${turn.role}-${index}-${turn.createdAt}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                >
                  <span>{turn.role === "user" ? "You" : "CuraLink"}</span>
                  <div className="message-body">
                    {turn.role === "assistant" && turn.answer ? (
                      <StructuredAnswer answer={turn.answer} />
                    ) : (
                      <p>{turn.answer || turn.message}</p>
                    )}
                  </div>
                </article>
              ))}

              {status === "loading" && (
                <div className="loading-state" role="status" aria-live="polite" aria-label="Generating answer">
                  <div className="loading-pill">
                    <span className="dot dot-1" />
                    <span className="dot dot-2" />
                    <span className="dot dot-3" />
                    <span>Researching</span>
                  </div>
                  <div className="loading-pill loading-pill-soft">
                    <span className="dot dot-1" />
                    <span className="dot dot-2" />
                    <span className="dot dot-3" />
                    <span>Drafting answer</span>
                  </div>
                </div>
              )}
            </div>

            {error && <div className="error-banner">{error}</div>}

            <form className="message-form" onSubmit={submit}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder={isResearchReady ? "Ask a follow-up question" : currentStep?.placeholder || selectedPersona.placeholder}
                rows={3}
              />
              <button type="submit" disabled={status === "loading" || !input.trim()}>
                {status === "loading" ? "Working..." : "Send"}
              </button>
            </form>

            <p className="chat-disclaimer">
              General information only and not medical advice. Consult a qualified clinician for personal care decisions.
            </p>
          </section>

          <aside className="source-rail">
            <ContextSnapshot context={{ ...draft, ...context }} persona={selectedPersona.shortLabel} />
            <SourceList title="Publications" items={latestSources.publications || []} type="publication" />
            <SourceList title="Clinical trials" items={latestSources.clinicalTrials || []} type="trial" />
          </aside>
        </section>
      </section>
    </main>
  );
}

function WarmupNotice({ status }) {
  if (status === "ready") {
    return <div className="warmup-notice warmup-ready">Backend ready.</div>;
  }

  if (status === "error") {
    return <div className="warmup-notice warmup-error">Could not wake backend yet. First response may be delayed on free tier.</div>;
  }

  return <div className="warmup-notice">Waking backend. On free tier, first request can take up to a minute.</div>;
}

function LandingPage({ onChoose }) {
  return (
    <main className="landing-shell">
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="eyebrow">CuraLink</span>
          <h1>Choose your research path</h1>
          <p>
            Start with the kind of evidence support you need. CuraLink will ask for the right context in chat,
            then retrieve publications and clinical trials with citations.
          </p>
        </div>
        <img
          src="https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=1200&q=80"
          alt="Clinical research team reviewing medical evidence"
        />
      </section>

      <section className="persona-options" aria-label="Choose user type">
        <button className="persona-card" type="button" onClick={() => onChoose("patient")}>
          <span>Path 1</span>
          <strong>Patients and caregivers</strong>
          <p>Understand evidence, personalize around symptoms and location, and explore possible trial options.</p>
        </button>
        <button className="persona-card" type="button" onClick={() => onChoose("clinician")}>
          <span>Path 2</span>
          <strong>Clinicians and researchers</strong>
          <p>Scan publications, compare trials, inspect ranking quality, and keep citations structured.</p>
        </button>
      </section>
    </main>
  );
}

function userTurn(message) {
  return { role: "user", message, createdAt: new Date().toISOString() };
}

function assistantTurn(message) {
  return { role: "assistant", message, createdAt: new Date().toISOString() };
}

function ContextSnapshot({ context, persona }) {
  const rows =
    persona === "Clinician"
      ? [
          ["Mode", "Patient referral"],
          ["Specialty / role", context.specialtyRole],
          ["Patient condition", context.condition],
          ["Patient age", context.patientAge],
          ["Comorbidities", context.patientComorbidities],
          ["Current meds", context.patientMedications],
          ["Question type", context.clinicalQuestionType],
          ["Trial location", context.location]
        ].filter(([, value]) => value)
      : [
          ["Mode", persona],
          ["Name", context.patientName],
          ["Condition", context.condition],
          ["Symptoms", context.symptoms],
          ["Location", context.location]
        ].filter(([, value]) => value);

  return (
    <section className="context-card">
      <div className="source-heading">
        <h2>Context</h2>
        <span>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="quiet">Context will build as the chat begins.</p>
      ) : (
        rows.map(([label, value]) => (
          <p key={label}>
            <strong>{label}:</strong> {value}
          </p>
        ))
      )}
    </section>
  );
}

function StructuredAnswer({ answer }) {
  if (!answer) return <p>No answer generated yet.</p>;
  const sections = parseAnswerSections(answer);

  if (sections.length === 0) {
    return <p>{answer}</p>;
  }

  return (
    <div className="answer-sections">
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
        </section>
      ))}
    </div>
  );
}

function parseAnswerSections(answer) {
  const lines = answer.split("\n").map((line) => line.trim()).filter(Boolean);
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (/^\**\s*Safety(?:\s+Note)?\s*\**:?\s*/i.test(line)) {
      current = null;
      continue;
    }

    const match = line.match(/^\**(Condition Overview|Research Insights|Clinical Trials|Source Attribution)\**:?\s*(.*)$/i);
    if (match) {
      current = { title: match[1], body: match[2] || "" };
      sections.push(current);
    } else if (current) {
      current.body = `${current.body} ${line}`.trim();
    }
  }

  return sections;
}

function SourceList({ title, items, type }) {
  return (
    <section className="source-list">
      <div className="source-heading">
        <h2>{title}</h2>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="quiet">Sources will appear after the first answer.</p>
      ) : (
        items.map((item) => (
          <article className="source-card" key={item.id || item.url || item.title}>
            <span>{type === "publication" ? item.source : item.status}</span>
            <h3>{item.title}</h3>
            {type === "publication" ? (
              <>
                <p>{item.summary || "No abstract available from the source."}</p>
                <small>{[item.year, (item.authors || []).slice(0, 3).join(", ")].filter(Boolean).join(" / ")}</small>
              </>
            ) : (
              <>
                <p>{item.eligibility || "Eligibility details were not provided."}</p>
                {item.eligibilityConflict && (
                  <p className="trial-flag">
                    Possible eligibility conflict: {item.eligibilityConflictReasons?.join(" ") || "Review profile against criteria."}
                  </p>
                )}
                <small>{[item.location, item.contact].filter(Boolean).join(" / ") || "Contact not listed"}</small>
              </>
            )}
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer">
                Open source
              </a>
            )}
          </article>
        ))
      )}
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
