import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { ProductRef } from '../data/products';
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

  async selectCategory(category: ProductRef['category']): Promise<void> {
    await this.page.locator('a.list-group-item', { hasText: category }).click();
  }

  async openProduct(title: string): Promise<void> {
    // The page may have reloaded since (e.g. after login) and /entries can drop,
    // so re-check the product list and reload once if it's empty.
    await retryAfterReload(this.page, () => expect(this.productLink(title)).toBeVisible());
    await this.productLink(title).click();
    // 'commit', not 'load' - the HLS video delays the load event.
    await this.page.waitForURL(/prod\.html\?idp_=/, { waitUntil: 'commit' });
  }
}
