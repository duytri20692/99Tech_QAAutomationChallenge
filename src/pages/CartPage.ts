import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { PlaceOrderModal } from './PlaceOrderModal';
import { isViewCartResponse, waitForResponse } from '../utils/network';
import { retryAfterReload } from '../utils/reload';
import { parseAmount, sum } from '../utils/price';

export interface CartItem {
  title: string;
  price: number;
}

export class CartPage extends BasePage {
  readonly rows: Locator;
  readonly total: Locator;
  readonly placeOrderButton: Locator;

  constructor(page: Page) {
    super(page, '/cart.html');
    this.rows = page.locator('#tbodyid > tr');
    this.total = page.locator('#totalp');
    this.placeOrderButton = page.getByRole('button', { name: 'Place Order' });
  }

  /** Waits for /viewcart (renders the rows). Can't use 'networkidle', the HLS video never idles. */
  protected override async loadOnce(url: string): Promise<void> {
    const rowsRendered = waitForResponse(this.page, isViewCartResponse);
    await super.loadOnce(url);
    await rowsRendered;
  }

  protected override async waitUntilLoaded(): Promise<void> {
    await expect(this.placeOrderButton).toBeVisible();
  }

  row(title: string): Locator {
    return this.rows.filter({ hasText: title });
  }

  /**
   * Rows render once per page load, and /viewcart sometimes misses an item that
   * was just added. Polling the DOM won't help, so reload once and re-check.
   */
  async expectItemCount(count: number): Promise<void> {
    await retryAfterReload(this.page, () => expect(this.rows).toHaveCount(count));
  }

  async getItems(): Promise<CartItem[]> {
    const items: CartItem[] = [];
    for (const row of await this.rows.all()) {
      const cells = row.locator('td');
      items.push({
        title: (await cells.nth(1).innerText()).trim(),
        price: parseAmount(await cells.nth(2).innerText()),
      });
    }
    return items;
  }

  async getTotal(): Promise<number> {
    const text = (await this.total.innerText()).trim();
    return text === '' ? 0 : parseAmount(text);
  }

  /** Asserts the displayed total equals the sum of the row prices. */
  async expectTotalMatchesItems(): Promise<number> {
    const expected = sum((await this.getItems()).map((i) => i.price));
    await expect(this.total).toHaveText(String(expected));
    return expected;
  }

  /**
   * Deletes one row and waits for the count to drop. The site reloads the page
   * after the delete, so this can take a while; reload again if /viewcart is stale.
   */
  async deleteItem(title: string): Promise<void> {
    const before = await this.rows.count();
    await this.row(title).first().getByRole('link', { name: 'Delete' }).click();
    await retryAfterReload(this.page, () => expect(this.rows).toHaveCount(before - 1, { timeout: 30_000 }));
  }

  async openPlaceOrder(): Promise<PlaceOrderModal> {
    await this.placeOrderButton.click();
    const modal = new PlaceOrderModal(this.page);
    await modal.waitUntilOpen();
    return modal;
  }
}
