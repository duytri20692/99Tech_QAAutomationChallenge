import { Page } from '@playwright/test';

/**
 * Runs `check`, and when it fails reloads the page once and runs it again.
 *
 * DemoBlaze renders every page from XHRs it never re-fires, so a response that
 * was dropped or came back incomplete is permanent for that document: the
 * assertion can poll the DOM for as long as it likes and will keep reading the
 * same stale render. Only a reload asks the server again, which is also what a
 * user would do.
 */
export async function retryAfterReload(page: Page, check: () => Promise<void>, attempts = 2): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await check();
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
  }
}
