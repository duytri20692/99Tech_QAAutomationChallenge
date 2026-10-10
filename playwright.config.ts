import { defineConfig, devices } from '@playwright/test';
import { env } from './config/env';

/**
 * Projects:
 *  - chromium / firefox / webkit        -> desktop cross-browser UI tests
 *  - mobile-chrome / mobile-safari      -> cross-platform (emulated mobile) UI tests
 *  - api                                -> browserless REST tests against api.demoblaze.com
 *  - perf                               -> lightweight performance budgets (Chromium only)
 *
 * Test types are also tagged (@smoke, @regression, @api, @perf, @known-defect)
 * so any slice can be run with --grep.
 */
export default defineConfig({
  testDir: './tests',
  timeout: env.testTimeout,
  expect: { timeout: env.expectTimeout },
  fullyParallel: true,
  forbidOnly: env.isCI,
  retries: env.retries,
  workers: env.workers,
  outputDir: 'reports/test-artifacts',
  reporter: [
    [env.isCI ? 'github' : 'list'],
    ['html', { open: 'never', outputFolder: 'reports/html' }],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
    ['json', { outputFile: 'reports/json/results.json' }],
    ['allure-playwright', { resultsDir: 'reports/allure-results', detail: true, suiteTitle: true }],
  ],
  use: {
    baseURL: env.baseUrl,
    headless: env.headless,
    trace: env.trace,
    screenshot: 'only-on-failure',
    video: env.video,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', testDir: './tests/ui', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testDir: './tests/ui', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testDir: './tests/ui', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', testDir: './tests/ui', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', testDir: './tests/ui', use: { ...devices['iPhone 14'] } },
    { name: 'api', testDir: './tests/api', use: { baseURL: env.apiUrl } },
    // The budgets measure the machine, so anything running beside them
    // corrupts the number: a page load measured at 15.8s against an 8s budget
    // turned out to be the suite's own load, not the site. Depending on every
    // other project makes this one run last, by itself, inside the same run.
    // Playwright skips a project whose dependency failed, so a genuinely broken
    // functional suite skips the budgets - which is the right order of concern.
    // `--no-deps` runs this project on its own (see `npm run test:perf`).
    {
      name: 'perf',
      testDir: './tests/perf',
      use: { ...devices['Desktop Chrome'] },
      retries: 0,
      dependencies: ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari', 'api'],
    },
  ],
});
