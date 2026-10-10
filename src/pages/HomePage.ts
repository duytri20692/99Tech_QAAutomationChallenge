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
    // The caller may arrive on a page that reloaded after it was last checked -
    // logging in reloads, for instance - so the product list is re-asserted
    // here rather than assumed. A dropped /entries leaves it empty for good,
    // which would otherwise surface as a click timing out on a missing link.
    await retryAfterReload(this.page, () => expect(this.productLink(title)).toBeVisible());
    await this.productLink(title).click();
    // 'commit' rather than the default 'load': DemoBlaze pages stream an HLS
    // video, so 'load' can take tens of seconds. The caller asserts the page
    // content it actually depends on.
    await this.page.waitForURL(/prod\.html\?idp_=/, { waitUntil: 'commit' });
  }
}
