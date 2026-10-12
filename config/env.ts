import dotenv from 'dotenv';
import path from 'path';
import { cpus } from 'os';

/**
 * Central, typed configuration. Values come from (highest priority first):
 *   1. real environment variables (CI secrets / shell)
 *   2. .env.<TEST_ENV>   e.g. .env.staging
 *   3. .env
 *   4. the defaults below
 */
const envName = process.env.TEST_ENV ?? 'prod';
dotenv.config({ path: path.resolve(__dirname, `../.env.${envName}`), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const toOptionalNumber = (value: string | undefined): number | undefined =>
  value !== undefined && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : undefined;

const toNumber = (value: string | undefined, fallback: number): number => toOptionalNumber(value) ?? fallback;

const toBoolean = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined || value.trim() === '' ? fallback : ['true', '1', 'yes'].includes(value.toLowerCase());

/** Capture modes shared by Playwright's `video` and `trace`. */
const captureModes = ['off', 'on', 'retain-on-failure', 'on-first-retry'] as const;
type CaptureMode = (typeof captureModes)[number];

const toCaptureMode = (value: string | undefined, fallback: CaptureMode): CaptureMode =>
  captureModes.includes(value as CaptureMode) ? (value as CaptureMode) : fallback;

const isCI = !!process.env.CI;

export const env = {
  name: envName,
  isCI,
  baseUrl: process.env.BASE_URL || 'https://www.demoblaze.com',
  apiUrl: process.env.API_URL || 'https://api.demoblaze.com',
  headless: toBoolean(process.env.HEADLESS, true),
  // WebKit on Windows got flaky at 8 workers in local runs and was stable
  // at 6. Capped by half the cores.
  workers: toOptionalNumber(process.env.WORKERS) ?? (isCI ? 2 : Math.max(1, Math.min(6, Math.floor(cpus().length / 2)))),
  // Public demo site, requests are sometimes just slow. Retried tests still show as "flaky".
  retries: toNumber(process.env.RETRIES, isCI ? 2 : 1),
  testTimeout: toNumber(process.env.TEST_TIMEOUT, 60_000),
  expectTimeout: toNumber(process.env.EXPECT_TIMEOUT, 10_000),
  // Video runs ffmpeg for every test and can hang the run under load; traces
  // are enough for debugging, so video is off locally.
  video: toCaptureMode(process.env.VIDEO, isCI ? 'retain-on-failure' : 'off'),
  trace: toCaptureMode(process.env.TRACE, 'retain-on-failure'),
  staticUser:
    process.env.TEST_USERNAME && process.env.TEST_PASSWORD
      ? { username: process.env.TEST_USERNAME, password: process.env.TEST_PASSWORD }
      : undefined,
  perf: {
    pageLoadBudgetMs: toNumber(process.env.PERF_PAGE_LOAD_BUDGET_MS, 8_000),
    apiBudgetMs: toNumber(process.env.PERF_API_BUDGET_MS, 3_000),
    apiSamples: toNumber(process.env.PERF_API_SAMPLES, 5),
    pageSamples: toNumber(process.env.PERF_PAGE_SAMPLES, 3),
  },
} as const;
