import { Page } from '@playwright/test';

/**
 * Runs `check`; if it fails, reloads once and runs it again.
 * DemoBlaze never re-fires its XHRs, so a bad response stays on the page until reload.
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
