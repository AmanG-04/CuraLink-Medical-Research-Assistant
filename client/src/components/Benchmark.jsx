import { LegalLinks } from "./Legal.jsx";

export function Benchmark() {
  return (
    <main className="legal-page">
      <a className="brand" href="#">
        CuraLink
      </a>
      <a className="back-link" href="#">
        Back to research
      </a>
      <span className="eyebrow">Engineering evaluation</span>
      <h1>Retrieval benchmark</h1>
      <p>
        Recorded September 30, 2026. An offline comparison across 48 synthetic
        questions and 12 topics.
      </p>
      <p className="notice">
        Synthetic fixtures test ranking mechanics. These scores do not establish
        real-world medical relevance, clinical accuracy, or AI claim support.
      </p>
      <div className="table-scroll">
        <table>
          <caption>Recorded synthetic ranking results</caption>
          <thead>
            <tr>
              <th scope="col">Ranker</th>
              <th scope="col">Precision@8</th>
              <th scope="col">nDCG@8</th>
              <th scope="col">Relevant top-1</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Keyword-only baseline</th>
              <td>0.237</td>
              <td>0.857</td>
              <td>0.750</td>
            </tr>
            <tr>
              <th scope="row">BM25 + metadata</th>
              <td>0.250</td>
              <td>0.901</td>
              <td>0.854</td>
            </tr>
          </tbody>
        </table>
      </div>
      <section>
        <h2>What the metrics mean</h2>
        <p>
          Precision@8 measures how many of the first eight records are labeled
          relevant. nDCG@8 rewards placing highly relevant records earlier.
          Relevant top-1 measures whether the first result is labeled relevant.
          Each fixture contains two relevant records in a pool of fourteen, so
          even an ideal Precision@8 is 0.250.
        </p>
      </section>
      <section>
        <h2>Reproduce the results</h2>
        <p>
          Run <code>npm run evaluate</code> in the repository. The runner makes
          no network or model calls. It also prints local ranking latency and
          checks extractive citation identifiers and empty-source abstention.
          This dashboard is a recorded snapshot, not live telemetry.
        </p>
        <a
          href="https://github.com/AmanG-04/curalink/tree/main/server/evaluation"
          target="_blank"
          rel="noopener noreferrer"
        >
          Read the fixtures and methodology
        </a>
      </section>
      <section>
        <h2>What still needs evaluation</h2>
        <p>
          Real provider coverage, independently labeled relevance, claim-level
          support, clinician-reviewed eligibility screening and end-to-end
          latency need separate evaluation. An optional local embedding
          experiment is provided; embeddings are not enabled in production.
        </p>
      </section>
      <LegalLinks />
    </main>
  );
}
