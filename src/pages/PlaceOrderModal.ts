import { expect, Locator, Page } from '@playwright/test';
import { OrderDetails } from '../data/testData';
import { OrderConfirmation } from '../components/OrderConfirmation';
import { acceptNextDialog } from '../utils/dialog';
import { fillAndVerify } from '../utils/form';

export class PlaceOrderModal {
  readonly root: Locator;
  readonly totalLabel: Locator;
  readonly fields: Record<keyof OrderDetails, Locator>;
  readonly purchaseButton: Locator;
  readonly closeButton: Locator;
  readonly confirmation: OrderConfirmation;

  constructor(private readonly page: Page) {
    this.root = page.locator('#orderModal');
    this.totalLabel = page.locator('#totalm');
    this.fields = {
      name: page.locator('#name'),
      country: page.locator('#country'),
      city: page.locator('#city'),
      card: page.locator('#card'),
      month: page.locator('#month'),
      year: page.locator('#year'),
    };
    // The modal header also carries a button named "Close" (the x), so the
    // footer buttons are scoped to avoid an ambiguous locator.
    const footer = this.root.locator('.modal-footer');
    this.purchaseButton = footer.getByRole('button', { name: 'Purchase' });
    this.closeButton = footer.getByRole('button', { name: 'Close' });
    this.confirmation = new OrderConfirmation(page);
  }

  /**
   * The modal already counts as visible while its fade is still running, and
   * Bootstrap focuses the modal root once that fade ends. Waiting for the focus
   * to have landed means typing can no longer be interrupted by it.
   */
  async waitUntilOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
    await expect(this.root).toBeFocused();
    await expect(this.fields.name).toBeEditable();
  }

  /** Fills only the provided fields, so tests can leave any field empty on purpose. */
  async fill(details: Partial<OrderDetails>): Promise<void> {
    for (const [key, value] of Object.entries(details) as [keyof OrderDetails, string][]) {
      if (value !== undefined) await fillAndVerify(this.fields[key], value);
    }
  }

  /** Happy path: purchase and return the confirmation dialog. */
  async purchase(): Promise<OrderConfirmation> {
    await this.purchaseButton.click();
    await this.confirmation.expectVisible();
    return this.confirmation;
  }

  /** Negative path: purchase and return the validation alert text. */
  async purchaseExpectingAlert(): Promise<string> {
    return acceptNextDialog(this.page, () => this.purchaseButton.click());
  }

  async close(): Promise<void> {
    await this.closeButton.click();
    await expect(this.root).toBeHidden();
  }
}
