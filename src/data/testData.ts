import { randomBytes } from 'crypto';

export interface Credentials {
  username: string;
  password: string;
}

export interface OrderDetails {
  name: string;
  country: string;
  city: string;
  card: string;
  month: string;
  year: string;
}

const suffix = (): string => `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;

/** Unique, collision-free credentials for self-registered test users. */
export const newCredentials = (prefix = 'qa'): Credentials => ({
  username: `${prefix}_${suffix()}`,
  password: `Pw_${randomBytes(6).toString('hex')}!`,
});

export const validOrder = (overrides: Partial<OrderDetails> = {}): OrderDetails => ({
  name: 'Jane Tester',
  country: 'Vietnam',
  city: 'Ho Chi Minh City',
  card: '4111111111111111',
  month: '12',
  year: '2030',
  ...overrides,
});

/** Inputs used by negative / edge-case login tests. */
export const MaliciousInput = {
  sqlInjection: `' OR '1'='1`,
  xss: `<img src=x onerror="window.__xss=true">`,
} as const;

/**
 * Unregistered 300-char username. A fixed 'a'.repeat(300) is already taken on
 * the shared site. Unique part goes first in case the backend truncates.
 */
export const veryLongUsername = (length = 300): string => {
  const unique = suffix();
  return unique + 'a'.repeat(Math.max(0, length - unique.length));
};
