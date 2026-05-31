# CuraLink

CuraLink is a hosted MERN prototype for source-backed medical research assistance. It accepts structured patient/research context, retrieves broad candidate pools from OpenAlex, PubMed, and ClinicalTrials.gov, ranks them, and asks an open-source Hugging Face model to produce a structured answer grounded in those sources.

## Stack

- React + Vite client
- Node + Express API
- MongoDB Atlas persistence, with an in-memory fallback for local demos
- Hugging Face Inference using `Qwen/Qwen2.5-7B-Instruct` with Qwen fallback models
- OpenAlex, PubMed E-utilities, and ClinicalTrials.gov v2 retrieval adapters

## Local Setup

```bash
npm install
cp .env.example server/.env
npm run dev
```

The client runs at `http://localhost:5173` and the API at `http://localhost:5000`.

For full persistence and LLM output, set `MONGODB_URI` and `HF_API_TOKEN` in `server/.env`. Without them, the API still runs with memory-backed conversations and a deterministic source summary fallback.

## Deployment

- Frontend: Vercel, root directory `client`, build command `npm run build`, output `dist`
- Backend: Render web service, root directory `server`, build command `npm install`, start command `npm start`
- Database: MongoDB Atlas connection string in `MONGODB_URI`

Set `VITE_API_BASE_URL` on Vercel to the Render API URL.
