/** Synthetic relevance fixtures. Not a clinical benchmark or real publications. */
const topics = [
  ["Parkinson disease", "deep brain stimulation", "DBS"],
  ["lung cancer", "immunotherapy", "checkpoint inhibitors"],
  ["kidney stones", "recurrence prevention", "nephrolithiasis prevention"],
  ["diabetes", "glucose monitoring", "continuous glucose monitoring"],
  ["asthma", "inhaled corticosteroids", "inhaled steroids"],
  ["multiple sclerosis", "disease modifying therapy", "DMT"],
  ["obesity", "GLP-1 therapy", "glucagon like peptide"],
  ["migraine", "preventive therapy", "prophylaxis"],
  ["breast cancer", "targeted therapy", "precision oncology"],
  ["epilepsy", "seizure control", "antiseizure medication"],
  ["arthritis", "exercise", "physical activity"],
  ["depression", "psychotherapy", "cognitive behavioral therapy"],
];
const intents = [
  "What evidence supports",
  "Compare studies of",
  "What are the limitations of",
  "Summarize recent research on",
];
export const fixtures = topics.flatMap(
  ([condition, intervention, synonym], topicIndex) =>
    intents.map((intent, intentIndex) => {
      const query = `${intent} ${intervention} for ${condition}?`;
      const documents = topics.map(
        ([otherCondition, otherIntervention], index) => ({
          id: `topic-${index}`,
          type: "publication",
          title: `${otherCondition}: ${otherIntervention}`,
          summary: `Methods: A synthetic example of ${otherIntervention} in ${otherCondition}. Results: No real medical findings. Limitations: Illustrative fixture only.`,
          year: 2025,
          source: "Synthetic",
          credibility: 0.75,
        }),
      );
      documents.push({
        id: "synonym",
        type: "publication",
        title: `${condition}: ${synonym}`,
        summary: `Synthetic abstract about ${condition} and ${synonym}. No clinical findings.`,
        year: 2024,
        source: "Synthetic",
        credibility: 0.75,
      });
      documents.push({
        id: "noisy",
        type: "publication",
        title: "Broad research index",
        summary: topics
          .map(([name, intervention]) => `${name} ${intervention}`)
          .join(" "),
        year: 2026,
        source: "Synthetic",
        credibility: 1,
      });
      return {
        id: `${topicIndex}-${intentIndex}`,
        query,
        context: { condition, intent: intervention, question: query },
        documents,
        judgments: { [`topic-${topicIndex}`]: 3, synonym: 2 },
      };
    }),
);
