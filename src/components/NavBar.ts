import { expect, Locator, Page } from '@playwright/test';
import { isViewCartResponse, waitForResponse } from '../utils/network';
import { retryAfterReload } from '../utils/reload';

/**
 * Top navigation. On narrow (mobile) viewports Bootstrap collapses the links
 * behind a hamburger toggler, so every action first makes sure the menu is open.
 */
export class NavBar {
  readonly toggler: Locator;
  readonly cartLink: Locator;
  readonly loginLink: Locator;
  readonly signUpLink: Locator;
  readonly logoutLink: Locator;
  readonly welcomeUser: Locator;
  readonly loginDialog: Locator;
  readonly signUpDialog: Locator;

  constructor(private readonly page: Page) {
    this.toggler = page.locator('button.navbar-toggler');
    this.cartLink = page.locator('#cartur');
    this.loginLink = page.locator('#login2');
    this.signUpLink = page.locator('#signin2');
    this.logoutLink = page.locator('#logout2');
    this.welcomeUser = page.locator('#nameofuser');
    this.loginDialog = page.locator('#logInModal');
    this.signUpDialog = page.locator('#signInModal');
  }

  private async ensureExpanded(target: Locator): Promise<void> {
    if ((await this.toggler.isVisible()) && !(await target.isVisible())) {
      await this.toggler.click();
      await expect(target).toBeVisible();
    }
  }

  /**
   * A click right after page load can be lost (bootstrap.js not bound yet), so
   * retry until the modal opens. The link is a toggle, so only click when the
   * modal is closed - checked via the `show` class, since visibility stays true
   * during the closing animation.
   */
  private async openModal(link: Locator, dialog: Locator): Promise<void> {
    await this.ensureExpanded(link);
    await expect(async () => {
      if (!(await this.isOpen(dialog))) await link.click();
      await expect(dialog).toHaveClass(/\bshow\b/, { timeout: 2_000 });
    }).toPass({ timeout: 30_000 }); // WebKit under load can stall >15s
  }

  private async isOpen(dialog: Locator): Promise<boolean> {
    return ((await dialog.getAttribute('class')) ?? '').split(/\s+/).includes('show');
  }

  async openLogin(): Promise<void> {
    await this.openModal(this.loginLink, this.loginDialog);
  }

  async openSignUp(): Promise<void> {
    await this.openModal(this.signUpLink, this.signUpDialog);
  }

  /** Waits for /viewcart; reloads once if it never arrives (site doesn't retry it). */
  async openCart(): Promise<void> {
    await this.ensureExpanded(this.cartLink);
    const rowsRendered = waitForResponse(this.page, isViewCartResponse);
    await this.cartLink.click();
    await this.page.waitForURL(/cart\.html/, { waitUntil: 'commit' });
    try {
      await rowsRendered;
    } catch {
      const retried = waitForResponse(this.page, isViewCartResponse);
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await retried;
    }
  }

  async logout(): Promise<void> {
    await this.ensureExpanded(this.logoutLink);
    await this.logoutLink.click();
    await this.expectLoggedOut();
  }

  /** Uses CSS display (not visibility) so the check also works when the mobile menu is collapsed. */
  async expectLoggedInAs(username: string): Promise<void> {
    await this.expectWelcomeName(username);
    await expect(this.welcomeUser).not.toHaveCSS('display', 'none');
    await expect(this.logoutLink).not.toHaveCSS('display', 'none');
    await expect(this.loginLink).toHaveCSS('display', 'none');
    await expect(this.signUpLink).toHaveCSS('display', 'none');
  }

  /** Welcome name comes from POST /check, which the site never retries - reload once if missing. */
  private async expectWelcomeName(username: string): Promise<void> {
    await retryAfterReload(this.page, () => expect(this.welcomeUser).toHaveText(`Welcome ${username}`));
  }

  async expectLoggedOut(): Promise<void> {
    await expect(this.welcomeUser).toHaveCSS('display', 'none');
    await expect(this.logoutLink).toHaveCSS('display', 'none');
    await expect(this.loginLink).not.toHaveCSS('display', 'none');
  }
}
