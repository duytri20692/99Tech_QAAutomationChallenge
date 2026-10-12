import { Page } from '@playwright/test';
import { NavBar } from '../components/NavBar';

/** Shared behaviour for every page object: navigation + access to the nav bar. */
export abstract class BasePage {
  readonly nav: NavBar;

  protected constructor(
    protected readonly page: Page,
    protected readonly path: string,
  ) {
    this.nav = new NavBar(page);
  }

  async open(): Promise<void> {
    await this.navigate(this.path);
  }

  /** Page content comes from an XHR the site never retries, so navigate again once on failure. */
  protected async navigate(url: string, attempts = 2): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.loadOnce(url);
        return;
      } catch (error) {
        if (attempt === attempts) throw error;
      }
    }
  }

  /**
   * Uses 'domcontentloaded' - pages stream an HLS video, so 'load' can take tens
   * of seconds. Override to register response waiters before navigating.
   */
  protected async loadOnce(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.waitUntilLoaded();
  }

  /** Override to wait for the page's asynchronously loaded content. */
  protected async waitUntilLoaded(): Promise<void> {}
}
