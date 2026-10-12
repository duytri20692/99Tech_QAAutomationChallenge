import { expect, Locator, Page } from '@playwright/test';
import { OrderDetails } from '../data/testData';
import { OrderConfirmation } from '../components/OrderConfirmation';
import { acceptNextDialog } from '../utils/dialog';
import { fillAndVerify } from '../utils/form';
import { waitForResponse } from '../utils/network';

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
    const footer = this.root.locator('.modal-footer');
    this.purchaseButton = footer.getByRole('button', { name: 'Purchase' });
    this.closeButton = footer.getByRole('button', { name: 'Close' });
    this.confirmation = new OrderConfirmation(page);
  }

  /** Same as LoginModal: wait for Bootstrap's focus on the modal root before typing. */
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

  /**
   * Happy path: purchase and return the confirmation dialog. Purchase also fires
   * POST /deletecart without waiting for it, and leaving the page cancels it, so
   * wait for it here or the cart is never emptied.
   */
  async purchase(): Promise<OrderConfirmation> {
    const cartCleared = waitForResponse(this.page, (response) => response.url().includes('/deletecart'));
    await this.purchaseButton.click();
    await this.confirmation.expectVisible();
    expect((await cartCleared).ok(), 'POST /deletecart succeeded').toBe(true);
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
