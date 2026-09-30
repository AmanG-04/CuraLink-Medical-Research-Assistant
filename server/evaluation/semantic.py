"""Optional local embedding experiment. Downloads a public model; no hosted API."""
import json
import subprocess
from sentence_transformers import SentenceTransformer

data = subprocess.check_output([
    "node", "--input-type=module", "-e",
    "import {fixtures} from './server/evaluation/fixtures.js'; console.log(JSON.stringify(fixtures));"
], text=True)
fixtures = json.loads(data)
model = SentenceTransformer("pritamdeka/S-PubMedBert-MS-MARCO")
hits = 0
for fixture in fixtures:
    query = model.encode(fixture["query"], normalize_embeddings=True)
    documents = model.encode([
        doc["title"] + " " + doc["summary"] for doc in fixture["documents"]
    ], normalize_embeddings=True)
    ranked = sorted(range(len(documents)), key=lambda i: float(documents[i] @ query), reverse=True)
    hits += fixture["judgments"].get(fixture["documents"][ranked[0]]["id"], 0) > 0
print(json.dumps({"queries": len(fixtures), "relevant_top_1": hits / len(fixtures),
                  "limitation": "Synthetic fixtures only; not clinical validation."}, indent=2))
