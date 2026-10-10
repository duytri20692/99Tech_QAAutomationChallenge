import { Dialog, Page, Request } from '@playwright/test';
import { DroppedRequestError } from './network';

/**
 * Accepts and reports the next alert, for flows that do not expect one.
 *
 * Without a listener Playwright dismisses alerts silently, which turns an error
 * the site did report into an unexplained timeout somewhere else entirely.
 * `stop()` drops the listener once the outcome is known.
 */
export function watchForDialog(page: Page): { alerted: Promise<string>; stop: () => void } {
  let onDialog: (dialog: Dialog) => void = () => {};
  const alerted = new Promise<string>((resolve) => {
    onDialog = (dialog) => {
      const message = dialog.message();
      dialog.accept().then(
        () => resolve(message),
        () => resolve(message),
      );
    };
  });
  page.on('dialog', onDialog);
  return { alerted, stop: () => page.off('dialog', onDialog) };
}

export interface AcceptDialogOptions {
  timeout?: number;
  /**
   * URL pattern of the XHR that produces the alert, for the alerts that come
   * from an XHR callback. The site never retries such a call itself, so when it
   * fails no alert can ever follow: the wait is cut short and the action is
   * repeated once. A request that failed this way never reached the server, so
   * repeating it cannot apply the action twice.
   *
   * Leave unset for alerts that fire straight from the click handler.
   */
  triggeredBy?: RegExp;
}

/**
 * DemoBlaze reports most outcomes through native browser alerts. Some fire
 * straight from the click handler (order-form validation) and some fire later,
 * from an XHR callback (add to cart, log in).
 *
 * The handler is registered before the action and accepts the dialog as soon as
 * it appears, which covers both cases: a synchronous alert blocks the click
 * until it is dismissed, so waiting for the click to finish first would
 * deadlock.
 */
export async function acceptNextDialog(
  page: Page,
  trigger: () => Promise<unknown>,
  options: AcceptDialogOptions = {},
): Promise<string> {
  const { timeout = 15_000, triggeredBy } = options;
  const attempts = triggeredBy ? 2 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await acceptOnce(page, trigger, timeout, triggeredBy);
    } catch (error) {
      lastError = error;
      if (!(error instanceof DroppedRequestError)) break;
    }
  }
  throw lastError;
}

async function acceptOnce(
  page: Page,
  trigger: () => Promise<unknown>,
  timeout: number,
  triggeredBy: RegExp | undefined,
): Promise<string> {
  const accepted = new Promise<string>((resolve, reject) => {
    const stopListening = (): void => {
      clearTimeout(timer);
      page.off('dialog', onDialog);
      page.off('requestfailed', onRequestFailed);
    };
    const onDialog = (dialog: Dialog): void => {
      stopListening();
      const message = dialog.message();
      dialog.accept().then(() => resolve(message), reject);
    };
    const onRequestFailed = (request: Request): void => {
      if (!triggeredBy?.test(request.url())) return;
      stopListening();
      reject(new DroppedRequestError(request.url()));
    };
    const timer = setTimeout(() => {
      stopListening();
      reject(new Error(`No dialog appeared within ${timeout}ms`));
    }, timeout);

    page.on('dialog', onDialog);
    if (triggeredBy) page.on('requestfailed', onRequestFailed);
  });
  // Keep the rejection attached: a failing trigger must not turn it into an
  // unhandled rejection.
  accepted.catch(() => {});

  await trigger();
  return accepted;
}
