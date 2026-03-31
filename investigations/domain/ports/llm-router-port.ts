export type FindingDraft = {
  title: string;
  summary: string;
  confidence?: "low" | "medium" | "high";
  evidence?: string[];
  gaps?: string[];
};

export interface LlmRouterPort {
  generateFinding(input: {
    query: string;
    url: string;
    title: string;
    summary: string;
  }): Promise<FindingDraft>;
}
