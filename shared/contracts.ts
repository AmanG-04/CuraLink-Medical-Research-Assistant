/** Public API contract. Optional provider metadata is deliberately explicit. */
export type Audience = "patient" | "clinician";
export interface EvidenceDetails {
  population?: string;
  methods?: string;
  intervention?: string;
  findings?: string;
  limitations?: string;
}
export interface Source {
  id: string;
  type: "publication" | "clinicalTrial";
  title: string;
  source: string;
  summary?: string;
  url?: string;
  year?: number | null;
  authors?: string[];
  journal?: string;
  studyType?: string;
  evidenceDetails?: EvidenceDetails;
  rankingReasons?: string[];
  score?: number;
  status?: string;
  eligibility?: string;
  eligibilityConflict?: boolean;
  eligibilityConflictReasons?: string[];
  minimumAge?: string;
  maximumAge?: string;
  phases?: string[];
  location?: string;
  locations?: string[];
  contact?: string;
  lastUpdated?: string;
  citationId?: string;
}
export interface Sources {
  publications: Source[];
  clinicalTrials: Source[];
}
export interface ResearchContext {
  userType: Audience;
  condition?: string;
  location?: string;
  symptoms?: string;
  patientAge?: string;
  patientMedications?: string;
  patientComorbidities?: string;
  clinicalQuestionType?: string;
  specialtyRole?: string;
  intent?: string;
}
export interface Turn {
  role: "user" | "assistant";
  message: string;
  answer?: string;
  sources?: Sources;
  createdAt: string;
  generation?: {
    mode: "ai" | "source-only" | "demo";
    model?: string | null;
    reason?: string;
    durationMs?: number;
    citationValidation?: string;
  };
  retrievalStats?: {
    candidatePoolSize: number;
    selectedCount: number;
    retrievedAt?: string;
    durationMs?: number;
    fromCache?: boolean;
    rankingMethod?: string;
  };
}
export interface Workspace {
  sessionId: string;
  title: string;
  context: ResearchContext;
  notes: string;
  bookmarks: Source[];
  turns: Turn[];
  trialSearch?: TrialSearch | null;
}
export interface ScreeningRow {
  kind: string;
  state: "match" | "conflict" | "unknown";
  label: string;
  evidence: string;
  note: string;
}
export interface TrialSearch {
  input: {
    condition: string;
    location: string;
    intervention: string;
    age: number | "";
    sex: "" | "FEMALE" | "MALE";
    status: "open" | "all";
    phase: string;
    medications: string;
    otherConditions: string;
  };
  results: Array<
    Source & {
      screening: {
        rows: ScreeningRow[];
        counts: { match: number; conflict: number; unknown: number };
        verdict: string;
      };
    }
  >;
  excluded: Array<{ id: string; title: string; reason: string }>;
  retrievedAt: string;
  stats: {
    scanned: number;
    returned: number;
    totalCount: number | null;
    truncated: boolean;
    durationMs: number;
    limit: number;
  };
  methodology: string;
}
export interface ResearchInput {
  sessionId: string;
  message: string;
  disease?: string;
  location?: string;
  symptoms?: string;
  patientAge?: string;
  patientMedications?: string;
  patientComorbidities?: string;
  clinicalQuestionType?: string;
  specialtyRole?: string;
}
export interface ResearchEvent {
  phase:
    | "retrieval"
    | "ranking"
    | "generation"
    | "complete"
    | "error"
    | "connecting";
  message?: string;
  workspace?: Workspace;
  error?: string;
}
