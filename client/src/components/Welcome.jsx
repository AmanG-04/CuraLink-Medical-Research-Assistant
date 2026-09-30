import { useState } from "react";
import { LegalLinks } from "./Legal.jsx";
import { Icon } from "./Icon.jsx";

export function Welcome({ onAuth, onDemo, ready, persistence }) {
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onAuth(mode, {
        username: data.get("username"),
        password: data.get("password"),
        acceptedTerms: data.get("terms") === "on",
      });
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="welcome">
      <header className="welcome-header">
        <a className="brand" href="#">
          CuraLink
          <span>Your medical research assistant</span>
        </a>
        <span className="connection">
          <i className={ready ? "online" : ""} />
          {ready ? "Research service ready" : "Starting research service…"}
        </span>
      </header>
      <div className="welcome-grid">
        <section className="welcome-copy">
          <span className="eyebrow">Source-backed medical research</span>
          <h1>
            Ask better questions.
            <br />
            Explore the evidence.
          </h1>
          <p>
            Chat about medical research with answers grounded in publications and clinical trials.
          </p>
          <div className="welcome-workflow">
            <div>
              <Icon name="chat" />
              <span>Ask</span>
            </div>
            <Icon name="arrow" size={16} />
            <div>
              <Icon name="check" />
              <span>Inspect sources</span>
            </div>
            <Icon name="arrow" size={16} />
            <div>
              <Icon name="bookmark" />
              <span>Save findings</span>
            </div>
          </div>
          <div className="audience-grid">
            <article>
              <span className="mini-icon">
                <Icon name="help" size={18} />
              </span>
              <h2>Patients & caregivers</h2>
              <p>Clear checks and questions for your care team.</p>
            </article>
            <article>
              <span className="mini-icon">
                <Icon name="book" size={18} />
              </span>
              <h2>Clinicians & researchers</h2>
              <p>Source-backed screening and side-by-side comparisons.</p>
            </article>
          </div>
          <div className="provider-line">
            PubMed · OpenAlex · ClinicalTrials.gov
          </div>
          <button className="text-button" onClick={() => onDemo("patient")}>
            Explore the sample workspace <span aria-hidden="true">↗</span>
          </button>
          <p className="small muted">
            The sample uses illustrative records. No account or live AI request
            needed.
          </p>
        </section>
        <section className="auth-card" aria-label="Account access">
          <span className="eyebrow">Your research shelf</span>
          <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="muted">
            Keep your shortlists, evidence and notes together.
          </p>
          <div className="segmented" aria-label="Account action">
            <button
              aria-pressed={mode === "login"}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Sign in
            </button>
            <button
              aria-pressed={mode === "register"}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Create account
            </button>
          </div>
          <form onSubmit={submit}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9_]+"
              required
              placeholder="e.g. research_aman"
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              placeholder="At least 8 characters"
            />
            {mode === "register" && (
              <label className="check-label">
                <input name="terms" type="checkbox" required />
                <span>
                  I am 18 or older, accept the <a href="#terms">Terms</a> and
                  acknowledge the <a href="#privacy">Privacy Notice</a> and{" "}
                  <a href="#disclaimer">Medical Disclaimer</a>.
                </span>
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy
                ? "Connecting…"
                : mode === "login"
                  ? "Open my workspaces"
                  : "Create account"}
            </button>
          </form>
          <p className="small muted">
            Use a unique password. Password recovery is not available in this
            showcase.
          </p>
          {!ready && (
            <p className="notice">
              The free-tier backend may take up to a minute to start.
            </p>
          )}
          {persistence === "temporary-memory" && (
            <p className="notice">
              Demo storage is temporary and resets when the server restarts.
            </p>
          )}
        </section>
      </div>
      <footer className="welcome-footer">
        <p>
          Educational prototype. Not medical advice. Use non-identifying or
          fictitious context.
        </p>
        <LegalLinks />
        <a className="small" href="#benchmark">
          Retrieval benchmark
        </a>
      </footer>
    </main>
  );
}
