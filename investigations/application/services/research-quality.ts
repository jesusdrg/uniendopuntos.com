import type { FindingDraft } from "@/investigations/domain/ports/llm-router-port";

export type ScrapedQualityReason =
  | "LOW_TEXT_CONTENT"
  | "BOILERPLATE_CONTENT"
  | "CAPTCHA_OR_ACCESS_BLOCKED"
  | "EMPTY_CONTENT";

export type FindingQualityReason = "NON_INFORMATIVE_FINDING";

export type QualityGateResult<TReason extends string> =
  | { passed: true }
  | { passed: false; reason: TReason };

const DEFAULT_SUBQUERY_SUFFIXES = [
  "contexto",
  "evidencias",
  "criticas",
  "community discussion",
  "blog analysis",
] as const;

const BOILERPLATE_PATTERNS = [
  /enable javascript/i,
  /cloudflare/i,
  /ddos protection/i,
  /privacy policy/i,
  /terms of service/i,
  /cookies?/i,
  /sign in/i,
  /subscribe/i,
];

const CAPTCHA_PATTERNS = [
  /captcha/i,
  /verify (you are )?human/i,
  /access denied/i,
  /forbidden/i,
  /request blocked/i,
  /bot detection/i,
];

const NON_INFORMATIVE_PATTERNS = [
  /sin informacion/i,
  /sin información/i,
  /no hay informacion/i,
  /no hay información/i,
  /no se pudo extraer/i,
  /insufficient information/i,
  /not enough information/i,
  /cannot determine/i,
] as const;

type QueueCandidate = {
  id: string;
  normalizedUrl: string;
  createdAt: string;
  discoveredFrom: string | null;
};

export function expandSearchQueries(baseQuery: string): string[] {
  const base = baseQuery.trim();
  if (base.length === 0) {
    return [];
  }

  const unique = new Set<string>([base]);

  for (const suffix of DEFAULT_SUBQUERY_SUFFIXES) {
    unique.add(`${base} ${suffix}`);
  }

  return [...unique];
}

export function capSeedUrlsByDomain(input: {
  urls: string[];
  maxPerDomain: number;
  maxTotal: number;
}): string[] {
  const maxPerDomain = Math.max(1, Math.trunc(input.maxPerDomain));
  const maxTotal = Math.max(1, Math.trunc(input.maxTotal));
  const counts = new Map<string, number>();
  const selected: string[] = [];

  for (const url of input.urls) {
    if (selected.length >= maxTotal) {
      break;
    }

    const domain = safeDomain(url);
    if (!domain) {
      continue;
    }

    const current = counts.get(domain) ?? 0;
    if (current >= maxPerDomain) {
      continue;
    }

    counts.set(domain, current + 1);
    selected.push(url);
  }

  return selected;
}

export function evaluateScrapedContentQuality(input: {
  title: string;
  summary: string;
}): QualityGateResult<ScrapedQualityReason> {
  const combined = `${input.title} ${input.summary}`.replace(/\s+/g, " ").trim();

  if (combined.length === 0) {
    return { passed: false, reason: "EMPTY_CONTENT" };
  }

  if (CAPTCHA_PATTERNS.some((pattern) => pattern.test(combined))) {
    return { passed: false, reason: "CAPTCHA_OR_ACCESS_BLOCKED" };
  }

  if (combined.length < 120) {
    return { passed: false, reason: "LOW_TEXT_CONTENT" };
  }

  if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(combined))) {
    return { passed: false, reason: "BOILERPLATE_CONTENT" };
  }

  return { passed: true };
}

export function evaluateFindingQuality(finding: FindingDraft): QualityGateResult<FindingQualityReason> {
  const title = finding.title.trim();
  const summary = finding.summary.trim();
  const combined = `${title} ${summary}`.replace(/\s+/g, " ").trim();

  if (combined.length < 80) {
    return { passed: false, reason: "NON_INFORMATIVE_FINDING" };
  }

  if (NON_INFORMATIVE_PATTERNS.some((pattern) => pattern.test(combined))) {
    return { passed: false, reason: "NON_INFORMATIVE_FINDING" };
  }

  return { passed: true };
}

export function rankQueueCandidates(candidates: QueueCandidate[]): QueueCandidate[] {
  return [...candidates].sort((left, right) => {
    const scoreDelta = scoreQueueCandidate(right) - scoreQueueCandidate(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

function scoreQueueCandidate(candidate: QueueCandidate): number {
  let score = 0;
  const domain = safeDomain(candidate.normalizedUrl);

  if (candidate.discoveredFrom === null) {
    score += 25;
  }

  if (domain) {
    if (/(docs|wikipedia|arxiv|nature|bbc|reuters|elpais|lanacion|clarin)/i.test(domain)) {
      score += 12;
    }

    if (/(cdn|static|assets|doubleclick)/i.test(domain)) {
      score -= 18;
    }
  }

  const url = candidate.normalizedUrl;
  if (/(analysis|investigation|report|research|blog|community|forum|opinion|critica|evidence)/i.test(url)) {
    score += 10;
  }

  if (/(captcha|login|signup|privacy|terms|cookie|game|ads?)/i.test(url)) {
    score -= 14;
  }

  return score;
}

function safeDomain(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}
