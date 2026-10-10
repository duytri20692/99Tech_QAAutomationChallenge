import { expect, Locator } from '@playwright/test';

/**
 * Fills a field and verifies the value actually landed.
 *
 * `fill()` focuses the element and inserts the text as two separate protocol
 * steps, and it never re-reads the value afterwards. Bootstrap focuses a
 * modal's own root element when the fade transition ends, so a fill that is in
 * flight at that moment types into the modal instead of the field and leaves it
 * empty while still reporting success. The field is therefore re-read, and the
 * fill retried, until the value is really there.
 *
 * The budget has to stay above the action timeout that `fill()` itself obeys,
 * or one slow fill eats the whole retry budget and the failure surfaces as a
 * bare "timeout waiting on the predicate" without ever having retried.
 */
export async function fillAndVerify(field: Locator, value: string, timeout = 30_000): Promise<void> {
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value, { timeout: 1_000 });
  }).toPass({ timeout });
}
