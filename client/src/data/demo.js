// Illustrative fixtures, not a live literature search or clinical findings.
export function demoWorkspace(userType = "patient") {
  const demoTrials = [
    {
      id: "DEMO-001",
      title: "Illustrative Parkinson trial: device-based intervention",
      status: "EXAMPLE_ONLY",
      phases: ["PHASE2"],
      minimumAge: "18 Years",
      maximumAge: "65 Years",
      city: "Toronto",
      conflict: false,
    },
    {
      id: "DEMO-002",
      title: "Illustrative Parkinson trial: age-restricted cohort",
      status: "EXAMPLE_ONLY",
      phases: ["PHASE3"],
      minimumAge: "60 Years",
      maximumAge: "80 Years",
      city: "Toronto",
      conflict: true,
    },
    {
      id: "DEMO-003",
      title: "Illustrative Parkinson trial: observational follow-up",
      status: "EXAMPLE_ONLY",
      phases: [],
      minimumAge: "18 Years",
      maximumAge: "N/A",
      city: "Ottawa",
      conflict: false,
    },
  ].map((trial) => ({
    ...trial,
    type: "clinicalTrial",
    source: "Illustrative fixture",
    sponsor: "Example research team",
    sex: "ALL",
    location: `${trial.city}, Canada`,
    locations: [`${trial.city}, Canada`],
    summary:
      "Illustrative trial for exploring the interface. Not a real study or enrollment opportunity.",
    eligibility:
      "Example criteria: diagnosis confirmed by the study team. All clinical details require review.",
    siteDetails: [
      {
        facility: "Example research center",
        city: trial.city,
        country: "Canada",
        status: "EXAMPLE_ONLY",
        contacts: [],
      },
    ],
    screening: {
        counts: {
          match: trial.conflict || trial.maximumAge === "N/A" ? 1 : 2,
        conflict: trial.conflict ? 1 : 0,
          unknown: trial.maximumAge === "N/A" ? 4 : 3,
      },
      rows: [
        {
          kind: "age",
          state: trial.conflict
            ? "conflict"
            : trial.maximumAge === "N/A"
              ? "unknown"
              : "match",
          label: "Age range",
          evidence: `Minimum age: ${trial.minimumAge}; maximum age: ${trial.maximumAge}`,
          note: trial.conflict
            ? "Example age 50 falls below the reported minimum."
            : "Illustrative age-bound observation; not an eligibility verdict.",
        },
        {
          kind: "sex",
          state: "match",
          label: "Registry sex criterion",
          evidence: "Sex: ALL",
          note: "Example registry field only.",
        },
        {
          kind: "status",
          state: "unknown",
          label: "Enrollment",
          evidence: "EXAMPLE_ONLY",
          note: "This is not a real enrollment opportunity.",
        },
        {
          kind: "medications",
          state: "unknown",
          label: "Medications",
          evidence: "No medication details supplied",
          note: "Confirm with the study team.",
        },
        {
          kind: "clinical",
          state: "unknown",
          label: "Full eligibility",
          evidence: "Example criteria: diagnosis confirmed by the study team.",
          note: "All clinical requirements remain unknown.",
        },
      ],
    },
  }));
  const publications = [
    {
      id: "demo-review",
      type: "publication",
      source: "Illustrative fixture",
      title: "Example evidence review: evaluating study quality",
      year: 2025,
      studyType: "Example review",
      authors: ["Demo research team"],
      summary:
        "This illustrative record demonstrates how CuraLink displays an abstract. A real source would report the population, intervention, results and limitations here. This record contains no medical findings.",
      rankingReasons: [
        "Demo ranking explanation",
        "Not retrieved from a provider",
      ],
    },
    {
      id: "demo-study",
      type: "publication",
      source: "Illustrative fixture",
      title: "Example comparative study: methods and outcomes",
      year: 2024,
      studyType: "Example comparative study",
      authors: ["Demo study team"],
      summary:
        "This second illustrative record lets you compare metadata, open evidence details and bookmark a source. It is not a publication and should not be cited as medical evidence.",
      rankingReasons: ["Demo comparison record"],
    },
  ];
  const clinicalTrials = [
    {
      id: "demo-trial",
      type: "clinicalTrial",
      title: "Example trial listing: screening checklist",
      source: "Illustrative fixture",
      status: "EXAMPLE_ONLY",
      phases: ["PHASE2"],
      minimumAge: "18 Years",
      maximumAge: "65 Years",
      location: "Example research center",
      eligibility:
        "Illustrative inclusion criteria: age range and diagnosis confirmed by the study team. Illustrative exclusion criteria: protocol-specific conditions. This is not an actual trial.",
      eligibilityMatch: "unknown",
      rankingReasons: ["Demo screening example"],
    },
  ];
  const answer =
    "Condition Overview:\nThis sample workspace shows how to inspect and organize evidence. It uses illustrative records, not live research or medical conclusions.\n\nResearch Insights:\n- Open a citation to view its source excerpt and ranking explanation [P1].\n- Select the two example papers to compare their metadata [P2].\n\nThis is a UI demonstration, not evidence about a condition.\n\nClinical Trials:\nThe example listing shows registry-style fields and a screening checklist [T1]. It is not an enrollment opportunity.\n\nSource Attribution:\n[P1] Example evidence review\n[P2] Example comparative study\n[T1] Example trial listing";
  return {
    sessionId: "demo",
    title: "Explore a sample workspace",
    demo: true,
    trialSearch: {
      input: {
        condition: "Parkinson disease",
        location: "Canada",
        age: 50,
        status: "all",
        phase: "",
        sex: "",
        intervention: "",
        medications: "",
        otherConditions: "",
      },
      results: demoTrials,
      excluded: [],
      retrievedAt: "2026-09-30T00:00:00Z",
      stats: { scanned: 3, returned: 3, totalCount: 3, truncated: false },
      methodology: "Illustrative records only. No registry request was made.",
    },
    context: { userType, condition: "Evidence inspection demo" },
    bookmarks: [],
    notes: "Try opening a citation, comparing papers, and exporting a brief.",
    turns: [
      {
        role: "user",
        message: "Show me how to review and compare evidence.",
        createdAt: "2026-09-30T00:00:00Z",
      },
      {
        role: "assistant",
        message: answer,
        answer,
        sources: { publications, clinicalTrials },
        generation: { mode: "demo" },
        retrievalStats: {
          candidatePoolSize: 3,
          selectedCount: 3,
          rankingMethod: "Illustrative fixtures, no live search",
        },
        createdAt: "2026-09-30T00:00:01Z",
      },
    ],
  };
}
