import { XMLParser } from "fast-xml-parser";
import { config } from "../config/env.js";
import { arrayify, cleanText, truncate } from "../utils/text.js";

const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "text"
});

function withNcbiParams(url) {
  url.searchParams.set("tool", config.ncbiTool);
  if (config.ncbiEmail) url.searchParams.set("email", config.ncbiEmail);
  if (config.ncbiApiKey) url.searchParams.set("api_key", config.ncbiApiKey);
  return url;
}

function abstractToText(abstractText) {
  return arrayify(abstractText)
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part === "object") return part.text || Object.values(part).join(" ");
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function authorName(author) {
  if (!author) return "";
  const collective = author.CollectiveName;
  if (collective) return collective;
  return [author.ForeName, author.LastName].filter(Boolean).join(" ");
}

function articleYear(article) {
  return (
    article.Journal?.JournalIssue?.PubDate?.Year ||
    article.ArticleDate?.Year ||
    article.Journal?.JournalIssue?.PubDate?.MedlineDate?.match(/\d{4}/)?.[0] ||
    null
  );
}

export function normalizePubMedArticle(pubmedArticle) {
  const citation = pubmedArticle.MedlineCitation || {};
  const article = citation.Article || {};
  const pmid = String(citation.PMID?.text || citation.PMID || "");
  const title = cleanText(article.ArticleTitle || "Untitled publication");
  const abstract = abstractToText(article.Abstract?.AbstractText);
  const authors = arrayify(article.AuthorList?.Author)
    .map(authorName)
    .filter(Boolean)
    .slice(0, 8);

  return {
    id: `pubmed:${pmid}`,
    type: "publication",
    source: "PubMed",
    title,
    summary: truncate(abstract, 900),
    authors,
    year: Number.parseInt(articleYear(article), 10) || null,
    journal: article.Journal?.Title || article.Journal?.ISOAbbreviation || "",
    url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "",
    doi: "",
    pmid,
    credibility: 1,
    raw: pubmedArticle
  };
}

export async function fetchPubMedPublications(context, fetcher = fetch) {
  const searchQuery = context.retrievalQuery || context.query;
  if (!searchQuery) return [];

  const searchUrl = withNcbiParams(new URL(`${BASE_URL}/esearch.fcgi`));
  searchUrl.searchParams.set("db", "pubmed");
  searchUrl.searchParams.set("term", searchQuery);
  searchUrl.searchParams.set("retmode", "json");
  searchUrl.searchParams.set("retmax", String(config.pubMedRetMax));
  searchUrl.searchParams.set("sort", "relevance");

  const searchResponse = await fetcher(searchUrl);
  if (!searchResponse.ok) throw new Error(`PubMed search returned ${searchResponse.status}`);
  const searchPayload = await searchResponse.json();
  const ids = searchPayload.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  const fetchUrl = withNcbiParams(new URL(`${BASE_URL}/efetch.fcgi`));
  fetchUrl.searchParams.set("db", "pubmed");
  fetchUrl.searchParams.set("id", ids.join(","));
  fetchUrl.searchParams.set("retmode", "xml");

  const fetchResponse = await fetcher(fetchUrl);
  if (!fetchResponse.ok) throw new Error(`PubMed fetch returned ${fetchResponse.status}`);
  const xml = await fetchResponse.text();
  const parsed = xmlParser.parse(xml);
  const articles = arrayify(parsed.PubmedArticleSet?.PubmedArticle);
  return articles.map(normalizePubMedArticle);
}
