import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { retryAfterReload } from '../utils/reload';

export class HomePage extends BasePage {
  readonly productCards: Locator;

  constructor(page: Page) {
    super(page, '/index.html');
    this.productCards = page.locator('#tbodyid .card');
  }

  protected override async waitUntilLoaded(): Promise<void> {
    await expect(this.productCards.first()).toBeVisible();
  }

  productLink(title: string): Locator {
    return this.page.locator('#tbodyid a.hrefch', { hasText: title });
  }

  async openProduct(title: string): Promise<void> {
    // The page may have reloaded since (e.g. after login) and /entries can drop,
    // so re-check the product list and reload once if it's empty.
    await retryAfterReload(this.page, () => expect(this.productLink(title)).toBeVisible());
    await this.productLink(title).click();
    await this.page.waitForURL(/prod\.html\?idp_=/, { waitUntil: 'commit' });
  }
}
