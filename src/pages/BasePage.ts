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

  /**
   * DemoBlaze fills its pages from an XHR that it never retries itself, so a
   * request the backend drops leaves the page empty for good and waiting longer
   * cannot help. The navigation is repeated once before giving up.
   */
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
   * One navigation attempt. 'domcontentloaded' rather than the default 'load':
   * DemoBlaze pages stream an HLS video, so the load event can take tens of
   * seconds. waitUntilLoaded asserts the content the page actually needs.
   * Override to register response waiters before the navigation starts.
   */
  protected async loadOnce(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.waitUntilLoaded();
  }

  /** Override to wait for the page's asynchronously loaded content. */
  protected async waitUntilLoaded(): Promise<void> {}
}
