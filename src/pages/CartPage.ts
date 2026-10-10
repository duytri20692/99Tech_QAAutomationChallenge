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

  /**
   * Cart rows are rendered by the /viewcart XHR, so the waiter is registered
   * before the navigation starts. 'networkidle' is unusable here: cart.html
   * streams an HLS video that keeps a request open for the whole session.
   */
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
   * Rows are rendered once, by the /viewcart call the page load fires, so
   * polling the DOM can never see a cart that changed after that call - and
   * DemoBlaze does occasionally answer /viewcart without an item it has just
   * accepted. Reloading re-asks the server, which is also what a user would do.
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
   * Deletes one row for the given product and waits for the row count to drop.
   * DemoBlaze deletes through a POST and then reloads the page, so the row only
   * disappears after that reload and its /viewcart call - hence the budget.
   */
  async deleteItem(title: string): Promise<void> {
    const before = await this.rows.count();
    await this.row(title).first().getByRole('link', { name: 'Delete' }).click();
    // That reload re-renders the rows from one /viewcart answer, and DemoBlaze
    // sometimes answers it with a cart that is emptier than it should be. The
    // count is therefore re-asked rather than polled: polling the DOM would
    // keep reading the same stale render.
    await retryAfterReload(this.page, () => expect(this.rows).toHaveCount(before - 1, { timeout: 30_000 }));
  }

  async openPlaceOrder(): Promise<PlaceOrderModal> {
    await this.placeOrderButton.click();
    const modal = new PlaceOrderModal(this.page);
    await modal.waitUntilOpen();
    return modal;
  }
}
