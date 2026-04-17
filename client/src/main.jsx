import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const SESSION_KEY = "curalink-session-id";

function getSessionId() {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, next);
  return next;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return response.json();
}

const starterPrompts = [
  "What does recent evidence say about DBS outcomes?",
  "Are there recruiting trials near this location?",
  "What risks or limitations do the papers mention?"
];

function App() {
  const sessionId = useMemo(getSessionId, []);
  const [form, setForm] = useState({
    patientName: "",
    disease: "",
    additionalQuery: "",
    location: ""
  });
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState([]);
  const [context, setContext] = useState({});
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest(`/api/conversations/${sessionId}`)
      .then((payload) => {
        setTurns(payload.turns || []);
        setContext(payload.context || {});
      })
      .catch(() => {
        setTurns([]);
      });
  }, [sessionId]);

  const latestAssistantTurn = [...turns].reverse().find((turn) => turn.role === "assistant");
  const latestSources = latestAssistantTurn?.sources || { publications: [], clinicalTrials: [] };

  function updateForm(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submitChat(event, presetMessage) {
    event?.preventDefault();
    const outgoingMessage = presetMessage ?? message;
    if (!outgoingMessage.trim() && !form.disease.trim() && !form.additionalQuery.trim()) {
      setError("Add a disease, research focus, or question to begin.");
      return;
    }

    setError("");
    setStatus("loading");
    const optimisticUserTurn = {
      role: "user",
      message: outgoingMessage || [form.disease, form.additionalQuery].filter(Boolean).join(" - "),
      createdAt: new Date().toISOString()
    };
    setTurns((current) => [...current, optimisticUserTurn]);
    setMessage("");

    try {
      const payload = await apiRequest("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          message: outgoingMessage,
          ...form
        })
      });

      setContext(payload.context || {});
      setTurns(payload.turns || []);
    } catch (err) {
      setError(err.message);
      setTurns((current) => current.filter((turn) => turn !== optimisticUserTurn));
    } finally {
      setStatus("idle");
    }
  }

  function clearLocalSession() {
    localStorage.removeItem(SESSION_KEY);
    window.location.reload();
  }

  return (
    <main className="app-shell">
      <section className="assistant-layout" aria-label="CuraLink research assistant">
        <aside className="context-rail">
          <div className="brand-block">
            <span className="eyebrow">CuraLink</span>
            <h1>Medical research companion</h1>
            <p>
              Bring a condition, a research angle, and a location. CuraLink gathers
              publications and trials, then answers with citations.
            </p>
          </div>

          <img
            className="research-image"
            src="https://images.unsplash.com/photo-1579165466741-7f35e4755660?auto=format&fit=crop&w=900&q=80"
            alt="Researcher working in a medical laboratory"
          />

          <form className="structured-form" onSubmit={submitChat}>
            <label>
              Patient name
              <input
                name="patientName"
                value={form.patientName}
                onChange={updateForm}
                placeholder="John Smith"
              />
            </label>
            <label>
              Disease of interest
              <input
                name="disease"
                value={form.disease}
                onChange={updateForm}
                placeholder="Parkinson disease"
              />
            </label>
            <label>
              Research focus
              <input
                name="additionalQuery"
                value={form.additionalQuery}
                onChange={updateForm}
                placeholder="Deep brain stimulation"
              />
            </label>
            <label>
              Location
              <input
                name="location"
                value={form.location}
                onChange={updateForm}
                placeholder="Toronto, Canada"
              />
            </label>
            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Researching..." : "Start research"}
            </button>
          </form>

          <div className="context-summary">
            <span>Current context</span>
            <strong>{context.condition || "No condition yet"}</strong>
            <p>{[context.intent, context.location].filter(Boolean).join(" / ") || "Follow-up context will appear here."}</p>
          </div>
        </aside>

        <section className="chat-workspace">
          <div className="chat-header">
            <div>
              <span className="eyebrow">Source-backed chat</span>
              <h2>Ask a research question</h2>
            </div>
            <button className="secondary-button" type="button" onClick={clearLocalSession}>
              New session
            </button>
          </div>

          <div className="starter-row" aria-label="Suggested follow-up questions">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={(event) => submitChat(event, prompt)}
                disabled={status === "loading"}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="messages" aria-live="polite">
            {turns.length === 0 && (
              <div className="empty-state">
                <h3>Try the sample brief</h3>
                <p>Parkinson disease, deep brain stimulation, Toronto, Canada.</p>
              </div>
            )}

            {turns.map((turn, index) => (
              <article className={`message ${turn.role}`} key={`${turn.role}-${index}-${turn.createdAt}`}>
                <span>{turn.role === "user" ? "You" : "CuraLink"}</span>
                <div className="message-body">
                  {turn.role === "assistant" ? (
                    <StructuredAnswer answer={turn.answer || turn.message} />
                  ) : (
                    <p>{turn.message}</p>
                  )}
                </div>
              </article>
            ))}

            {status === "loading" && (
              <div className="progress-strip">
                Retrieving a broad candidate pool, ranking sources, and drafting a grounded answer.
              </div>
            )}
          </div>

          {error && <div className="error-banner">{error}</div>}

          <form className="message-form" onSubmit={submitChat}>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask a follow-up, such as: What are the most common risks?"
              rows={3}
            />
            <button type="submit" disabled={status === "loading"}>
              Send
            </button>
          </form>
        </section>

        <aside className="source-rail">
          <SourceList title="Publications" items={latestSources.publications || []} type="publication" />
          <SourceList title="Clinical trials" items={latestSources.clinicalTrials || []} type="trial" />
        </aside>
      </section>
    </main>
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
    const match = line.match(/^\**(Condition Overview|Research Insights|Clinical Trials|Source Attribution|Safety Note)\**:?\s*(.*)$/i);
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
