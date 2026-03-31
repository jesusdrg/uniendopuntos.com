export type ScrapedDocument = {
  title: string;
  summary: string;
  outgoingUrls: string[];
};

export interface WebScraperPort {
  scrape(url: string): Promise<ScrapedDocument>;
}
