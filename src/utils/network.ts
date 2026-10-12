import { Page, Request, Response } from '@playwright/test';

/** A request failed before reaching the server, and the site won't retry it. */
export class DroppedRequestError extends Error {
  constructor(readonly url: string) {
    super(`The request never completed, so nothing can follow it (${url})`);
    this.name = 'DroppedRequestError';
  }
}

/** Resolves when a request matching `pattern` fails. Call `stop()` when done. */
export function watchForDroppedRequest(
  page: Page,
  pattern: RegExp,
): { dropped: Promise<string>; stop: () => void } {
  let onRequestFailed: (request: Request) => void = () => {};
  const dropped = new Promise<string>((resolve) => {
    onRequestFailed = (request) => {
      if (pattern.test(request.url())) resolve(request.url());
    };
  });
  page.on('requestfailed', onRequestFailed);
  return { dropped, stop: () => page.off('requestfailed', onRequestFailed) };
}

/** The XHR that renders the cart rows on cart.html. */
export const isViewCartResponse = (response: Response): boolean => response.url().includes('/viewcart');

/**
 * Response waiter to register before the triggering action. The catch avoids
 * an unhandled rejection if the action fails first.
 * 20s: slow is still OK, but callers that retry pay it twice within the test timeout.
 */
export function waitForResponse(
  page: Page,
  predicate: (response: Response) => boolean,
  timeout = 20_000,
): Promise<Response> {
  const pending = page.waitForResponse(predicate, { timeout });
  pending.catch(() => {});
  return pending;
}
