# Retrieval evaluation

Run `npm run evaluate` from the repository root. This uses 48 hand-authored synthetic questions across 12 topics, small synthetic candidate pools, and explicit relevance judgments. It makes no external requests and does not use Hugging Face credits.

The runner compares keyword-only retrieval with the application's BM25/keyword/metadata ranker. It prints Precision@8, nDCG@8, relevant top-1 rate, and local ranking latency. Citation and abstention checks apply to extractive fixture output only.

## Interpretation

These fixtures are regression tests for ranking mechanics. They are deliberately small and are not an independently labeled biomedical benchmark. A high score does not demonstrate clinical accuracy, coverage of real literature, or lower hallucination rates. Do not present the scores as clinical validation on a resume.

For a meaningful next experiment, collect real provider candidate pools for representative questions, have an independent reviewer label relevance, freeze those pools and judgments, and run both rankers against them. Assess claim support separately from citation-ID validity. Measure end-to-end latency and cache hit rate from real traces, not this local scoring loop.

## Optional local semantic reranking

An optional Python script compares a biomedical sentence embedding score without adding a hosted vector service. It requires a local Python environment and `sentence-transformers`. It downloads a public model once; do not run it on a free Render instance. The model's terms and local memory requirements apply.

1. Install `sentence-transformers` in a local virtual environment.
2. Run `python server/evaluation/semantic.py` from the repository root.
3. Compare scores and resource use on independently labeled real candidate pools before enabling embeddings in production.

The production application intentionally keeps lexical ranking until semantic improvements are demonstrated. No model training or fine-tuning is claimed.
