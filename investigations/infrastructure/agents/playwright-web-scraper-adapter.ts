import { IntegrationError } from "@/investigations/application/errors/integration-error";
import type { ScrapedDocument, WebScraperPort } from "@/investigations/domain/ports/web-scraper-port";
import { normalizeUrl } from "@/investigations/infrastructure/persistence/url-normalizer";

type PageLike = {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<void>;
  title(): Promise<string>;
  evaluate<T>(fn: () => T): Promise<T>;
  close(): Promise<void>;
};

type BrowserLike = {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
};

type BrowserLauncher = () => Promise<BrowserLike>;

export class PlaywrightWebScraperAdapter implements WebScraperPort {
  constructor(
    private readonly createBrowser: BrowserLauncher,
    private readonly timeoutMs = 20_000,
  ) {}

  async scrape(url: string): Promise<ScrapedDocument> {
    const normalizedUrl = normalizeUrl(url);
    const browser = await this.createBrowser();
    const page = await browser.newPage();

    try {
      await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
      const title = (await page.title()).trim() || "Sin titulo";

      const extracted = await page.evaluate(() => {
        const text = document.body?.innerText ?? "";
        const summary = text.replace(/\s+/g, " ").trim().slice(0, 480);
        const links = Array.from(document.querySelectorAll("a[href]"))
          .map((element) => element.getAttribute("href") ?? "")
          .filter((href) => href.trim().length > 0)
          .slice(0, 20);

        return {
          summary,
          links,
        };
      });

      const outgoingUrls = new Set<string>();
      for (const rawHref of extracted.links) {
        try {
          const resolved = new URL(rawHref, normalizedUrl).toString();
          outgoingUrls.add(normalizeUrl(resolved));
        } catch {
          continue;
        }
      }

      return {
        title,
        summary: extracted.summary || "Sin contenido textual extraible.",
        outgoingUrls: [...outgoingUrls],
      };
    } catch (error: unknown) {
      if (isTimeoutError(error)) {
        throw new IntegrationError("timeout", `Playwright agoto el timeout para ${normalizedUrl}.`);
      }

      throw new IntegrationError("upstream-failure", `Playwright no pudo scrapear ${normalizedUrl}.`);
    } finally {
      await page.close();
      await browser.close();
    }
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "TimeoutError" || /timeout/i.test(error.message);
}
