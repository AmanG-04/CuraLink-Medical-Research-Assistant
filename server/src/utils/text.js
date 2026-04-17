export function arrayify(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function cleanText(value = "") {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(value = "", max = 900) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}...`;
}

export function normalize(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function keywordSet(...parts) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "can",
    "could",
    "did",
    "do",
    "does",
    "directly",
    "for",
    "from",
    "how",
    "in",
    "is",
    "it",
    "may",
    "near",
    "of",
    "old",
    "older",
    "olds",
    "on",
    "or",
    "see",
    "should",
    "sun",
    "the",
    "this",
    "to",
    "what",
    "when",
    "where",
    "why",
    "will",
    "with",
    "would",
    "year",
    "years",
    "year-old",
    "yearolds",
    "yesterday",
    "today",
    "tomorrow",
    "with"
  ]);

  return new Set(
    normalize(parts.filter(Boolean).join(" "))
      .split(" ")
      .filter((word) => word.length > 2 && !stopWords.has(word))
  );
}

export function keywordScore(text, keywords) {
  const haystack = normalize(text);
  if (!haystack || keywords.size === 0) return 0;

  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) score += 1;
  }

  return score / keywords.size;
}

export function titleKey(title = "") {
  return normalize(title).replace(/\b(the|a|an)\b/g, "").replace(/\s+/g, " ").trim();
}
