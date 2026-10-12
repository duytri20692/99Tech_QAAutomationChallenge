import { expect, Locator } from '@playwright/test';

/**
 * Fills a field and re-checks the value. Bootstrap can steal focus mid-fill
 * (modal fade), leaving the field empty while fill() still succeeds.
 * Timeout must stay above the action timeout so a retry can actually happen.
 */
export async function fillAndVerify(field: Locator, value: string, timeout = 30_000): Promise<void> {
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 1_000 });
  }).toPass({ timeout });
}
