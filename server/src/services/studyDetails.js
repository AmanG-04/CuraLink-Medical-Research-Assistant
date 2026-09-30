/** Preserve explicitly labeled abstract sections; never infer absent clinical fields. */
export function studyDetails(summary = "") {
  const result = {};
  const labels = {
    methods: "methods",
    participants: "population",
    population: "population",
    intervention: "intervention",
    results: "findings",
    limitations: "limitations",
  };
  const pattern =
    /\b(Methods|Participants|Population|Intervention|Results|Limitations):\s*([\s\S]*?)(?=\b(?:Background|Objective|Methods|Participants|Population|Intervention|Results|Conclusion|Limitations):|$)/gi;
  for (const match of summary.matchAll(pattern))
    result[labels[match[1].toLowerCase()]] = match[2].trim();
  return result;
}
