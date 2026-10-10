import { expect, Locator, Page } from '@playwright/test';
import { Messages } from '../data/messages';
import { parseAmount } from '../utils/price';

export interface ConfirmationDetails {
  id: string;
  amount: number;
  cardNumber: string;
  name: string;
  date: string;
  raw: string;
}

/** SweetAlert dialog shown after a successful purchase. */
export class OrderConfirmation {
  readonly root: Locator;
  readonly heading: Locator;
  readonly details: Locator;
  readonly okButton: Locator;

  constructor(page: Page) {
    this.root = page.locator('.sweet-alert');
    this.heading = this.root.locator('h2');
    this.details = this.root.locator('p.lead');
    this.okButton = this.root.getByRole('button', { name: 'OK' });
  }

  async expectVisible(): Promise<void> {
    await expect(this.root).toBeVisible();
    await expect(this.heading).toHaveText(Messages.order.thankYou);
  }

  async readDetails(): Promise<ConfirmationDetails> {
    const raw = await this.details.innerText();
    const field = (label: string): string => {
      const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith(`${label}:`));
      return line ? line.split(':').slice(1).join(':').trim() : '';
    };
    return {
      id: field('Id'),
      amount: parseAmount(field('Amount')),
      cardNumber: field('Card Number'),
      name: field('Name'),
      date: field('Date'),
      raw,
    };
  }

  /**
   * Clicking OK dismisses the dialog. The app does not navigate away: its
   * SweetAlert build never invokes the confirm callback that would redirect
   * to the home page, so the browser stays on the cart page.
   */
  async confirm(): Promise<void> {
    await this.okButton.click();
    await expect(this.root).toBeHidden();
  }
}
