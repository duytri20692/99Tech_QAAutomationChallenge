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

const toNumber = (value: string | undefined, fallback: number): number =>
  value !== undefined && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : fallback;

const toOptionalNumber = (value: string | undefined): number | undefined =>
  value !== undefined && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : undefined;

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
  // One run means one worker count for every project, so it has to suit the
  // one that degrades first. WebKit on Windows is that one: measured over 5
  // runs at 8 workers, mobile-safari's p99 was 41.5s against a p90 of 21s and
  // 8 tests ran over 30s - the tail that produced the flaky clusters. It is
  // clean at 6, and the medians barely move with the worker count, so the cost
  // of staying low is wall-clock time rather than per-test speed. Still capped
  // by half the cores, so smaller machines scale down.
  workers: toOptionalNumber(process.env.WORKERS) ?? (isCI ? 2 : Math.max(1, Math.min(6, Math.floor(cpus().length / 2)))),
  // DemoBlaze is a shared public site: under parallel load a request can simply
  // be slow. One local retry keeps that noise out of the result without hiding
  // it, because Playwright still reports a retried test as "flaky".
  retries: toNumber(process.env.RETRIES, isCI ? 2 : 1),
  testTimeout: toNumber(process.env.TEST_TIMEOUT, 60_000),
  expectTimeout: toNumber(process.env.EXPECT_TIMEOUT, 10_000),
  // Recording video runs an ffmpeg process per worker for *every* test, not
  // just the failing ones, and a browser that dies under that load leaves the
  // run hanging on a context it can never close. Traces cost far less and are
  // what a failure is actually investigated with, so only video is off by
  // default outside CI.
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
    // A public demo site is noisy: a single page load was measured at 15.8s
    // against an 8s budget while nothing else ran. The page budgets are
    // therefore asserted on the median of several samples, the same way the
    // API latency budget already uses a percentile.
    pageSamples: toNumber(process.env.PERF_PAGE_SAMPLES, 3),
  },
} as const;
