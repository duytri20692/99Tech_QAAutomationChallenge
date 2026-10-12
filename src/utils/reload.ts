import { Page } from '@playwright/test';
import { retry } from './retry';

/**
 * Runs `check`; if it fails, reloads once and runs it again.
 * DemoBlaze never re-fires its XHRs, so a bad response stays on the page until reload.
 */
export async function retryAfterReload(page: Page, check: () => Promise<void>, attempts = 2): Promise<void> {
  await retry(check, { attempts, beforeRetry: () => page.reload({ waitUntil: 'domcontentloaded' }) });
}
