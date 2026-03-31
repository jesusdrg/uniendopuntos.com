export interface WebSearchPort {
  search(query: string, options?: { limit?: number }): Promise<string[]>;
}
