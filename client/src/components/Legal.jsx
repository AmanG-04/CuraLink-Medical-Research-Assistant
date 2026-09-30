const documents = {
  disclaimer: {
    title: "Medical & research disclaimer",
    sections: [
      [
        "Educational use only",
        "CuraLink is a portfolio research prototype for exploring publications and trial registrations. It does not provide medical advice, diagnosis, treatment, prescribing, or clinical decision support. It is not a medical device or a substitute for a qualified healthcare professional.",
      ],
      [
        "No emergency support",
        "Do not use CuraLink for urgent symptoms or emergencies. Contact your local emergency number or seek immediate medical care. Never delay professional care because of information shown here.",
      ],
      [
        "Evidence and AI limitations",
        "Searches may miss relevant research. Abstracts can omit important methods, findings and limitations. AI can make incorrect or unsupported statements even when a citation exists. Citation validation checks source identifiers, not whether every claim is true. Verify information in the original publication and discuss personal decisions with a clinician.",
      ],
      [
        "Clinical trials",
        "Trial status, locations and contacts can change. Listings and automated conflict flags do not establish eligibility, suitability, safety or benefit. The study team must confirm eligibility and enrollment availability.",
      ],
      [
        "Demonstration records",
        "Sample workspaces contain clearly labeled illustrative fixtures. They are not real publications, medical evidence or enrollment opportunities.",
      ],
    ],
  },
  terms: {
    title: "Terms of use",
    sections: [
      [
        "Scope and acceptance",
        "By creating an account or using CuraLink, you agree to these Terms and acknowledge the Privacy Notice and Medical Disclaimer. Use is limited to adults aged 18 or older for educational research and project demonstration. If you do not agree, do not use the service.",
      ],
      [
        "Accounts",
        "Choose a unique password and keep it private. You are responsible for activity under your account. This prototype does not currently provide password recovery. Do not impersonate others or share credentials.",
      ],
      [
        "Acceptable use",
        "Do not enter identifying patient information, confidential clinical records, illegal content or material you do not have permission to use. Do not attack the service, bypass usage controls, automate excessive requests or attempt to access another user's workspaces.",
      ],
      [
        "Research output",
        "You must independently verify sources and obtain professional advice for personal care decisions. Outputs are not a systematic review. External publications and websites remain subject to their owners' rights and terms; links do not imply endorsement.",
      ],
      [
        "Availability and stored data",
        "CuraLink uses free-tier services. Requests can be limited or fail, and the backend can take time to start. The service may change or stop. Keep your own exports of important work. Workspace deletion removes active records, but hosting/database backups may retain copies under provider policies.",
      ],
      [
        "Warranty and liability",
        "To the extent permitted by applicable law, this prototype is provided as available without warranties of accuracy, fitness for a particular purpose or uninterrupted operation. Its operator is not responsible for decisions made from research output. Nothing in these Terms excludes rights or liabilities that cannot legally be excluded.",
      ],
      [
        "Changes",
        "Updates will be published on this page with a revised date. Review the Terms when returning to the service. These Terms do not claim healthcare regulatory certification or compliance.",
      ],
    ],
  },
  privacy: {
    title: "Privacy notice",
    sections: [
      [
        "What is stored",
        "Account records contain a username and a salted password hash, never a plaintext password. Active sessions use a random token in an HttpOnly cookie, with a hashed token stored by the backend. Workspaces contain your questions, context, responses, trial search filters and screening profiles, source snapshots, bookmarks and notes.",
      ],
      [
        "Use fictitious, non-identifying context",
        "This showcase is not intended to store protected health information or clinical records. Do not include patient names, addresses, record numbers or other identifying details. Condition and profile information can still be sensitive even without a name.",
      ],
      [
        "Third-party processing",
        "The frontend runs on Vercel, the API on Render and persistent records on MongoDB Atlas. Research queries are sent to PubMed/NCBI, OpenAlex and ClinicalTrials.gov. Questions, selected context, recent conversation text and source excerpts are sent to Hugging Face Inference and its selected model provider when AI generation is configured. These providers process data under their own policies.",
      ],
      [
        "Storage and access",
        "Saved workspaces are scoped to your account. The application operator and infrastructure providers may have administrative access; account isolation is not end-to-end encryption. In local memory-only mode, records disappear when the server restarts. Research traces log operational metrics rather than questions or medical profiles. Infrastructure providers may record IP addresses and request metadata.",
      ],
      [
        "Cookies and browser storage",
        "A necessary session cookie keeps you signed in for up to seven days. Browser storage remembers the selected workspace. No advertising or analytics tracking is added by this application.",
      ],
      [
        "Retention and controls",
        "You can export and delete workspaces in the app and sign out to revoke the current session. Expired sessions are removed automatically from MongoDB. Account records remain until administrative deletion; self-service account deletion and password recovery are not currently available. Deleted data may remain in provider backups according to their policies.",
      ],
      [
        "Questions and updates",
        "Contact the project owner through github.com/AmanG-04/curalink for privacy questions or administrative account deletion. Do not post sensitive data in a public issue. This notice will be updated as processing or storage changes.",
      ],
    ],
  },
};

export function LegalLinks() {
  return (
    <nav className="legal-links" aria-label="Legal information">
      <a href="#disclaimer">Medical disclaimer</a>
      <a href="#terms">Terms of use</a>
      <a href="#privacy">Privacy notice</a>
    </nav>
  );
}

export function LegalPage({ page }) {
  const document = documents[page];
  return (
    <main className="legal-page">
      <a className="brand" href="#">
        CuraLink
      </a>
      <a className="back-link" href="#">
        Back to research
      </a>
      <h1>{document.title}</h1>
      <p className="muted">Last updated September 30, 2026</p>
      {document.sections.map(([title, body]) => (
        <section key={title}>
          <h2>{title}</h2>
          <p>{body}</p>
        </section>
      ))}
      <LegalLinks />
    </main>
  );
}
