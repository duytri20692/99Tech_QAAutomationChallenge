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
   * Bootstrap opens these modals from its data-toggle handler, which is only
   * bound once bootstrap.js has run. Right after a page load a click can land
   * before that and is then silently lost, so it is retried until the modal
   * really is open.
   *
   * The link is a *toggle*: clicking it again while the modal is open closes it.
   * A retry therefore only clicks from the closed state, and uses Bootstrap's
   * own `show` class rather than visibility, which is still true during the
   * closing animation and would let a retry mistake a closing modal for an open
   * one.
   */
  private async openModal(link: Locator, dialog: Locator): Promise<void> {
    await this.ensureExpanded(link);
    await expect(async () => {
      if (!(await this.isOpen(dialog))) await link.click();
      await expect(dialog).toHaveClass(/\bshow\b/, { timeout: 2_000 });
      // The budget covers a browser that has gone slow, not just a lost click:
      // WebKit under load has been measured stalling for tens of seconds, and
      // 15s was not enough to open a modal during one of those stalls.
    }).toPass({ timeout: 30_000 });
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

  /**
   * Cart rows come from the /viewcart XHR, which the site never retries itself,
   * so a dropped call leaves the cart looking empty for good. The waiter is
   * registered before the click and the page reloaded once if nothing arrives —
   * the same protection CartPage.open() gets from BasePage.
   */
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

  /**
   * The welcome name is filled by the POST /check that every page load fires
   * from the cookie token. That call has no error handler and the site never
   * retries it, so a dropped one leaves the navbar looking logged out for good,
   * however long the assertion waits. The page is reloaded once instead.
   */
  private async expectWelcomeName(username: string): Promise<void> {
    await retryAfterReload(this.page, () => expect(this.welcomeUser).toHaveText(`Welcome ${username}`));
  }

  async expectLoggedOut(): Promise<void> {
    await expect(this.welcomeUser).toHaveCSS('display', 'none');
    await expect(this.logoutLink).toHaveCSS('display', 'none');
    await expect(this.loginLink).not.toHaveCSS('display', 'none');
  }
}
