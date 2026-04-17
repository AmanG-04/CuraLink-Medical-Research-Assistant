import { describe, expect, it } from "vitest";
import { normalizeClinicalTrial } from "../src/services/clinicalTrials.js";
import { fetchOpenAlexPublications, reconstructOpenAlexAbstract } from "../src/services/openalex.js";
import { fetchPubMedPublications, normalizePubMedArticle } from "../src/services/pubmed.js";

describe("source adapters", () => {
  it("reconstructs OpenAlex inverted abstracts", () => {
    expect(
      reconstructOpenAlexAbstract({
        Deep: [0],
        brain: [1],
        stimulation: [2],
        helps: [3]
      })
    ).toBe("Deep brain stimulation helps");
  });

  it("fetches and normalizes OpenAlex publications with a mocked fetch", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              id: "https://openalex.org/W1",
              title: "Adaptive DBS",
              publication_year: 2024,
              abstract_inverted_index: { Adaptive: [0], DBS: [1] },
              authorships: [{ author: { display_name: "A Researcher" } }],
              primary_location: {
                landing_page_url: "https://example.org/paper",
                source: { display_name: "Journal", is_core: true }
              }
            }
          ]
        })
      );

    const records = await fetchOpenAlexPublications({ query: "Parkinson DBS" }, fetcher);
    expect(records[0]).toMatchObject({
      source: "OpenAlex",
      title: "Adaptive DBS",
      year: 2024
    });
  });

  it("normalizes PubMed article metadata", () => {
    const record = normalizePubMedArticle({
      MedlineCitation: {
        PMID: { text: "12345" },
        Article: {
          ArticleTitle: "DBS outcomes",
          Abstract: { AbstractText: ["Useful summary"] },
          Journal: { Title: "Neurology", JournalIssue: { PubDate: { Year: "2023" } } },
          AuthorList: { Author: [{ ForeName: "Ada", LastName: "Lovelace" }] }
        }
      }
    });

    expect(record.url).toBe("https://pubmed.ncbi.nlm.nih.gov/12345/");
    expect(record.authors).toEqual(["Ada Lovelace"]);
    expect(record.summary).toBe("Useful summary");
  });

  it("fetches PubMed records with mocked esearch and efetch calls", async () => {
    const fetcher = async (url) => {
      const href = String(url);
      if (href.includes("esearch.fcgi")) {
        return new Response(
          JSON.stringify({ esearchresult: { idlist: ["12345"] } }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(`<?xml version="1.0"?>
        <PubmedArticleSet>
          <PubmedArticle>
            <MedlineCitation>
              <PMID>12345</PMID>
              <Article>
                <ArticleTitle>DBS outcomes</ArticleTitle>
                <Abstract><AbstractText>Useful summary</AbstractText></Abstract>
                <Journal><Title>Neurology</Title><JournalIssue><PubDate><Year>2023</Year></PubDate></JournalIssue></Journal>
              </Article>
            </MedlineCitation>
          </PubmedArticle>
        </PubmedArticleSet>`);
    };

    const records = await fetchPubMedPublications({ query: "Parkinson DBS" }, fetcher);
    expect(records[0].title).toBe("DBS outcomes");
  });

  it("normalizes ClinicalTrials.gov v2 studies", () => {
    const record = normalizeClinicalTrial({
      protocolSection: {
        identificationModule: {
          nctId: "NCT123",
          briefTitle: "DBS feasibility study"
        },
        statusModule: {
          overallStatus: "RECRUITING",
          studyFirstPostDateStruct: { date: "2025-01-01" }
        },
        descriptionModule: {
          briefSummary: "A brief summary"
        },
        eligibilityModule: {
          eligibilityCriteria: "Inclusion Criteria: adults"
        },
        contactsLocationsModule: {
          centralContacts: [{ name: "Study Desk", email: "study@example.org" }],
          locations: [{ facility: "Clinic", city: "Toronto", country: "Canada" }]
        }
      }
    });

    expect(record.url).toBe("https://clinicaltrials.gov/study/NCT123");
    expect(record.location).toContain("Toronto");
    expect(record.contact).toContain("study@example.org");
  });
});
