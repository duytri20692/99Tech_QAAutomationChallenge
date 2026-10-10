import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { acceptNextDialog } from '../utils/dialog';
import { parseAmount } from '../utils/price';
import { Messages } from '../data/messages';

export class ProductPage extends BasePage {
  readonly name: Locator;
  readonly price: Locator;
  readonly addToCartButton: Locator;

  constructor(page: Page) {
    super(page, '/prod.html');
    this.name = page.locator('#tbodyid h2.name');
    this.price = page.locator('#tbodyid h3.price-container');
    this.addToCartButton = page.getByRole('link', { name: 'Add to cart' });
  }

  async openById(id: number): Promise<void> {
    await this.navigate(`/prod.html?idp_=${id}`);
  }

  protected override async waitUntilLoaded(): Promise<void> {
    await expect(this.name).not.toBeEmpty();
    await expect(this.price).toContainText('$');
  }

  async getTitle(): Promise<string> {
    return (await this.name.innerText()).trim();
  }

  async getPrice(): Promise<number> {
    return parseAmount(await this.price.innerText());
  }

  /** Adds the product and asserts the "Product added" confirmation alert. */
  async addToCart(): Promise<void> {
    const message = await acceptNextDialog(this.page, () => this.addToCartButton.click(), {
      triggeredBy: /\/addtocart$/,
    });
    expect(message).toMatch(Messages.cart.productAdded);
  }
}
