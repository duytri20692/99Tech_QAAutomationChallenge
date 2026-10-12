import { Dialog, Page, Request } from '@playwright/test';
import { DroppedRequestError } from './network';

/**
 * Accepts and reports an unexpected alert. Otherwise Playwright dismisses it
 * silently and the error shows up as a random timeout. Call `stop()` when done.
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
   * XHR that produces the alert. If it fails, stop waiting and retry the action
   * once (it never reached the server). Leave unset for click-handler alerts.
   */
  triggeredBy?: RegExp;
}

/**
 * Runs `trigger` and returns the text of the alert it causes. The listener is
 * set up before the click because a sync alert blocks the click itself.
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
  // Avoid an unhandled rejection if trigger() throws.
  accepted.catch(() => {});

  await trigger();
  return accepted;
}
