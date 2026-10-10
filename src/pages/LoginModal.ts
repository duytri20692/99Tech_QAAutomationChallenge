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
    // The modal header also carries a button named "Close" (the x), so the
    // footer buttons are scoped to avoid an ambiguous locator.
    const footer = this.root.locator('.modal-footer');
    this.submitButton = footer.getByRole('button', { name: 'Log in' });
    this.closeButton = footer.getByRole('button', { name: 'Close' });
  }

  /**
   * The modal already counts as visible while its fade is still running, and
   * Bootstrap focuses the modal root once that fade ends. Waiting for the focus
   * to have landed means typing can no longer be interrupted by it.
   */
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
   * Happy path: submit and wait until the modal closes and the page reloads.
   *
   * The site never retries a dropped /login, so the modal would otherwise just
   * sit there until the budget ran out with nothing to say about why. The
   * submit is repeated once; the fields are not refilled, because the modal
   * keeps its values when the page has not reloaded.
   */
  async login(username: string, password: string, attempts = 2): Promise<void> {
    await this.fill(username, password);
    let lastDroppedUrl = '';
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const outcome = await this.submitAndWaitForClose();
      if (outcome.kind === 'closed') return;
      // An alert means the server answered and turned the login down. Repeating
      // the same credentials cannot change that answer.
      if (outcome.kind === 'rejected') {
        throw new Error(`Login was rejected for "${username}": ${outcome.message}`);
      }
      lastDroppedUrl = outcome.url;
    }
    throw new DroppedRequestError(lastDroppedUrl);
  }

  private async submitAndWaitForClose(): Promise<SubmitOutcome> {
    const { dropped, stop } = watchForDroppedRequest(this.page, LOGIN_REQUEST);
    // logIn() reports a refused login through an alert and leaves the modal
    // open. Without this watcher Playwright dismisses that alert unseen and the
    // real reason is lost behind a modal-still-visible timeout.
    const { alerted, stop: stopDialog } = watchForDialog(this.page);
    // logIn() hides the modal itself and only then calls location.reload(), so a
    // hidden modal means the credentials were accepted - not that the page that
    // shows the user as logged in exists yet. The reload is waited for
    // separately, because on this site a page load can take tens of seconds.
    const reloaded = this.page.waitForEvent('domcontentloaded', { timeout: 30_000 });
    // The modal hides from the /login callback, which can be slow under load.
    const closed = expect(this.root)
      .toBeHidden({ timeout: 30_000 })
      .then((): SubmitOutcome => ({ kind: 'closed' }));
    // Keep the rejections attached: the race can end on another promise first.
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
