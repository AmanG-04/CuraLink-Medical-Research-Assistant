import dotenv from "dotenv";

dotenv.config();

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: toInt(process.env.PORT, 5000),
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGODB_URI || "",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  hfApiToken: process.env.HF_API_TOKEN || "",
  hfModel: process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct",
  hfTimeoutMs: toInt(process.env.HF_TIMEOUT_MS, 30000),
  ncbiApiKey: process.env.NCBI_API_KEY || "",
  ncbiTool: process.env.NCBI_TOOL || "curalink",
  ncbiEmail: process.env.NCBI_EMAIL || "",
  openAlexPageSize: toInt(process.env.OPENALEX_PAGE_SIZE, 100),
  pubMedRetMax: toInt(process.env.PUBMED_RETMAX, 80),
  clinicalTrialsPageSize: toInt(process.env.CLINICAL_TRIALS_PAGE_SIZE, 80),
  cacheTtlMinutes: toInt(process.env.API_CACHE_TTL_MINUTES, 30)
};

export function allowedOrigins() {
  return config.clientOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
