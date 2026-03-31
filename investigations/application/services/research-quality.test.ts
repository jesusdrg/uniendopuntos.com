import { describe, expect, it } from "bun:test";

import {
  capSeedUrlsByDomain,
  evaluateFindingQuality,
  evaluateScrapedContentQuality,
  expandSearchQueries,
  rankQueueCandidates,
} from "@/investigations/application/services/research-quality";

describe("research-quality", () => {
  it("expands base query into diverse subqueries", () => {
    const queries = expandSearchQueries("licitaciones publicas");

    expect(queries.length).toBeGreaterThanOrEqual(6);
    expect(queries.some((item) => item.includes("evidencias"))).toBeTrue();
    expect(queries.some((item) => item.includes("criticas"))).toBeTrue();
  });

  it("caps seed URLs to reduce domain dominance", () => {
    const selected = capSeedUrlsByDomain({
      urls: [
        "https://a.com/1",
        "https://a.com/2",
        "https://a.com/3",
        "https://b.com/1",
        "https://c.com/1",
      ],
      maxPerDomain: 2,
      maxTotal: 10,
    });

    expect(selected).toEqual([
      "https://a.com/1",
      "https://a.com/2",
      "https://b.com/1",
      "https://c.com/1",
    ]);
  });

  it("rejects boilerplate or blocked scrape payloads", () => {
    const blocked = evaluateScrapedContentQuality({
      title: "Access denied",
      summary: "Please complete captcha to continue",
    });

    const empty = evaluateScrapedContentQuality({
      title: "",
      summary: "",
    });

    expect(blocked.passed).toBeFalse();
    if (!blocked.passed) {
      expect(blocked.reason).toBe("CAPTCHA_OR_ACCESS_BLOCKED");
    }

    expect(empty.passed).toBeFalse();
    if (!empty.passed) {
      expect(empty.reason).toBe("EMPTY_CONTENT");
    }
  });

  it("rejects non-informative findings", () => {
    const invalid = evaluateFindingQuality({
      title: "Sin informacion suficiente",
      summary: "No hay informacion para confirmar hechos.",
      confidence: "low",
      evidence: [],
      gaps: [],
    });

    expect(invalid.passed).toBeFalse();
  });

  it("ranks useful and diverse queue candidates first", () => {
    const ranked = rankQueueCandidates([
      {
        id: "1",
        normalizedUrl: "https://cdn.example.com/captcha",
        createdAt: "2026-03-30T10:00:00.000Z",
        discoveredFrom: "https://seed.com",
      },
      {
        id: "2",
        normalizedUrl: "https://reuters.com/investigation/report",
        createdAt: "2026-03-30T10:01:00.000Z",
        discoveredFrom: null,
      },
    ]);

    expect(ranked[0]?.id).toBe("2");
  });
});
