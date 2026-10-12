export interface RetryOptions {
  attempts?: number;
  /** Return false to rethrow right away, e.g. when the server already answered. */
  retryIf?: (error: unknown) => boolean;
  /** Runs between a failed attempt and the next one. */
  beforeRetry?: () => Promise<unknown>;
}

/** Runs `action` up to `attempts` times and rethrows the last error. */
export async function retry<T>(
  action: (attempt: number) => Promise<T>,
  { attempts = 2, retryIf = () => true, beforeRetry }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action(attempt);
    } catch (error) {
      if (attempt >= attempts || !retryIf(error)) throw error;
      await beforeRetry?.();
    }
  }
}
