type BrowserLike = {
  newPage(): Promise<{
    goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<void>;
    title(): Promise<string>;
    evaluate<T>(fn: () => T): Promise<T>;
    close(): Promise<void>;
  }>;
  close(): Promise<void>;
};

export async function launchChromiumBrowser(): Promise<BrowserLike> {
  const playwrightModule = await import("playwright");
  const maybeChromium = (playwrightModule as { chromium?: { launch: (input: { headless: boolean }) => Promise<BrowserLike> } }).chromium;

  if (!maybeChromium) {
    throw new Error("Playwright chromium no disponible en runtime.");
  }

  return maybeChromium.launch({ headless: true });
}
