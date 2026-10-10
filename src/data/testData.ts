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
 * A 300-character username that is still unregistered. DemoBlaze has one public
 * user table, so a fixed string such as 'a'.repeat(300) has long been taken and
 * answers "Wrong password." instead of "User does not exist.". The unique part
 * goes first, so the name stays unique even if the backend truncates it.
 */
export const veryLongUsername = (length = 300): string => {
  const unique = suffix();
  return unique + 'a'.repeat(Math.max(0, length - unique.length));
};
