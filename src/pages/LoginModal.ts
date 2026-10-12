import { expect, Locator, Page } from '@playwright/test';
import { acceptNextDialog, watchForDialog } from '../utils/dialog';
import { fillAndVerify } from '../utils/form';
import { DroppedRequestError, watchForDroppedRequest } from '../utils/network';

/** The XHR behind both the happy path and the rejection alert. */
const LOGIN_REQUEST = /\/login$/;

/** How a submit ended: accepted, turned down by the server, or never sent. */
type SubmitOutcome =
  | { kind: 'closed' }
  | { kind: 'dropped'; url: string }
  | { kind: 'rejected'; message: string };

export class LoginModal {
  readonly root: Locator;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly closeButton: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('#logInModal');
    this.usernameInput = page.locator('#loginusername');
    this.passwordInput = page.locator('#loginpassword');
    // Header "x" is also named "Close", so scope to the footer.
    const footer = this.root.locator('.modal-footer');
    this.submitButton = footer.getByRole('button', { name: 'Log in' });
    this.closeButton = footer.getByRole('button', { name: 'Close' });
  }

  /** Bootstrap focuses the modal root after the fade, which can eat a fill - wait for that first. */
  async waitUntilOpen(): Promise<void> {
    await expect(this.root).toBeVisible();
    await expect(this.root).toBeFocused();
    await expect(this.usernameInput).toBeEditable();
  }

  async fill(username: string, password: string): Promise<void> {
    await this.waitUntilOpen();
    await fillAndVerify(this.usernameInput, username);
    await fillAndVerify(this.passwordInput, password);
  }

  /**
   * Happy path: submit, wait for the modal to close and the page to reload.
   * A dropped /login is submitted again once (fields keep their values).
   */
  async login(username: string, password: string, attempts = 2): Promise<void> {
    await this.fill(username, password);
    let lastDroppedUrl = '';
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const outcome = await this.submitAndWaitForClose();
      if (outcome.kind === 'closed') return;
      // Server said no - retrying won't change that.
      if (outcome.kind === 'rejected') {
        throw new Error(`Login was rejected for "${username}": ${outcome.message}`);
      }
      lastDroppedUrl = outcome.url;
    }
    throw new DroppedRequestError(lastDroppedUrl);
  }

  private async submitAndWaitForClose(): Promise<SubmitOutcome> {
    const { dropped, stop } = watchForDroppedRequest(this.page, LOGIN_REQUEST);
    // A rejected login shows an alert; catch it so the real error is reported.
    const { alerted, stop: stopDialog } = watchForDialog(this.page);
    // The modal hides first, then the page reloads - wait for both.
    const reloaded = this.page.waitForEvent('domcontentloaded', { timeout: 30_000 });
    const closed = expect(this.root)
      .toBeHidden({ timeout: 30_000 })
      .then((): SubmitOutcome => ({ kind: 'closed' }));
    // Avoid unhandled rejections if the race ends on another promise.
    reloaded.catch(() => {});
    closed.catch(() => {});

    try {
      await this.submitButton.click();
      const outcome = await Promise.race<SubmitOutcome>([
        closed,
        dropped.then((url) => ({ kind: 'dropped', url })),
        alerted.then((message) => ({ kind: 'rejected', message })),
      ]);
      if (outcome.kind !== 'closed') return outcome;
      await reloaded;
      return outcome;
    } finally {
      stop();
      stopDialog();
    }
  }

  /** Negative path: submit and return the text of the resulting alert. */
  async submitExpectingAlert(username: string, password: string): Promise<string> {
    await this.fill(username, password);
    return acceptNextDialog(this.page, () => this.submitButton.click(), { triggeredBy: LOGIN_REQUEST });
  }

  async close(): Promise<void> {
    await this.closeButton.click();
    await expect(this.root).toBeHidden();
  }
}
