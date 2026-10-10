import { Page, Request, Response } from '@playwright/test';

/**
 * Thrown when a request the site will never retry failed before reaching the
 * server, so whatever was supposed to follow it can never happen.
 */
export class DroppedRequestError extends Error {
  constructor(readonly url: string) {
    super(`The request never completed, so nothing can follow it (${url})`);
    this.name = 'DroppedRequestError';
  }
}

/**
 * Watches for the first request matching `pattern` to fail.
 *
 * A failed request never reached the server, so the action behind it had no
 * effect and may safely be repeated. `stop()` drops the listener once the
 * outcome is known.
 */
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
 * Registers a response waiter before the action that triggers it.
 *
 * The rejection is kept attached, so an action that fails before the response
 * arrives cannot turn the orphaned waiter into an unhandled rejection.
 */
export function waitForResponse(
  page: Page,
  predicate: (response: Response) => boolean,
  timeout = 20_000,
): Promise<Response> {
  // Explicit, and deliberately longer than the default: a slow response is
  // still a success, and the callers that retry pay this budget twice, so it
  // has to stay well inside the test timeout.
  const pending = page.waitForResponse(predicate, { timeout });
  pending.catch(() => {});
  return pending;
}
