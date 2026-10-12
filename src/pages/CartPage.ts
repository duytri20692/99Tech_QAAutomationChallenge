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
  /** Item count of the latest /viewcart response, i.e. how many rows the page will render. */
  private viewCartItems?: Promise<number>;

  constructor(page: Page) {
    super(page, '/cart.html');
    this.rows = page.locator('#tbodyid > tr');
    this.total = page.locator('#totalp');
    this.placeOrderButton = page.getByRole('button', { name: 'Place Order' });
    page.on('response', (response) => {
      if (!isViewCartResponse(response)) return;
      this.viewCartItems = response.json().then((body: { Items: unknown[] }) => body.Items.length);
      this.viewCartItems.catch(() => {}); // a broken body fails waitForAllRows, not the process
    });
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
   * Counts rows only once every /viewcart item has its row, so a half-rendered
   * cart can't pass. Only the rendering is retried, never the count itself.
   */
  async expectItemCount(count: number): Promise<void> {
    await this.waitForAllRows();
    expect(await this.rows.count(), 'cart rows').toBe(count);
  }

  /**
   * Each row comes from its own POST /view, rendered as it arrives. The site
   * never retries a dropped /view, so the row stays missing until a reload.
   */
  private async waitForAllRows(): Promise<void> {
    await retryAfterReload(this.page, async () => {
      if (!this.viewCartItems) throw new Error('The cart page has not received /viewcart yet');
      await expect(this.rows).toHaveCount(await this.viewCartItems);
    });
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
   * Deletes one row and waits until /viewcart reports one item fewer. The site
   * reloads the cart after the delete; reload again if that read is stale.
   */
  async deleteItem(title: string): Promise<void> {
    await this.waitForAllRows();
    const before = await this.rows.count();
    await this.row(title).first().getByRole('link', { name: 'Delete' }).click();
    await retryAfterReload(this.page, () =>
      expect.poll(() => this.viewCartItems, { timeout: 30_000 }).toBe(before - 1),
    );
    await this.expectItemCount(before - 1);
  }

  async openPlaceOrder(): Promise<PlaceOrderModal> {
    await this.placeOrderButton.click();
    const modal = new PlaceOrderModal(this.page);
    await modal.waitUntilOpen();
    return modal;
  }
}
