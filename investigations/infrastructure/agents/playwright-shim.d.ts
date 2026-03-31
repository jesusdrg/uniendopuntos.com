declare module "playwright" {
  export const chromium: {
    launch(options?: { headless?: boolean }): Promise<{
      newPage(): Promise<{
        goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
        title(): Promise<string>;
        evaluate<T>(fn: () => T): Promise<T>;
        close(): Promise<void>;
      }>;
      close(): Promise<void>;
    }>;
  };
}
