import { Browser, Page } from '@playwright/test';
import { test, expect } from '../../src/fixtures';
import { env } from '../../config/env';
import { HomePage } from '../../src/pages/HomePage';

/**
 * Lightweight performance checks that fit inside the functional pipeline.
 * They enforce budgets (configurable via env) and attach raw metrics to the report.
 * For load/stress testing, see "Extending to load testing" in the README.
 *
 * Two things keep these numbers meaningful on a shared public site:
 *
 *  - Each budget is asserted on a percentile of several samples, not on one
 *    measurement. One load in a handful is occasionally many times slower than
 *    the rest, and asserting on a single sample measures that noise.
 *  - Every sample runs in a fresh browser context. Reusing one page would serve
 *    every load after the first from the browser cache, where DOMContentLoaded
 *    drops to tens of milliseconds - a number that can never breach the budget,
 *    so the test would pass without checking anything.
 *
 * `npm test` also runs this project on its own, after every other stage, so the
 * numbers are not polluted by the suite's own load.
 */
const percentile = (values: number[], p: number): number =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];

const median = (values: number[]): number => percentile(values, 0.5);

/** Runs `measure` against a cold page, `env.perf.pageSamples` times. */
async function sampleColdLoads<T>(browser: Browser, measure: (page: Page) => Promise<T>): Promise<T[]> {
  const samples: T[] = [];
  for (let i = 0; i < env.perf.pageSamples; i++) {
    const context = await browser.newContext({ baseURL: env.baseUrl });
    try {
      samples.push(await measure(await context.newPage()));
    } finally {
      await context.close();
    }
  }
  return samples;
}

test.describe('Performance budgets', { tag: '@perf' }, () => {
  test('home page navigation timing is within budget', async ({ browser }) => {
    const samples = await sampleColdLoads(browser, async (page) => {
      await new HomePage(page).open();
      return page.evaluate(() => {
        const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        const paint = performance.getEntriesByName('first-contentful-paint')[0];
        return {
          ttfbMs: Math.round(nav.responseStart - nav.requestStart),
          domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
          loadMs: Math.round(nav.loadEventEnd - nav.startTime),
          firstContentfulPaintMs: paint ? Math.round(paint.startTime) : null,
        };
      });
    });

    // loadEventEnd stays 0 until the load event fires, and the framework never
    // waits for it on this site because DemoBlaze streams an HLS video that can
    // hold the event open for tens of seconds. A 0 here means "not measured",
    // not "instant", so those samples are dropped instead of dragging the
    // median down to a number that could never breach the budget.
    const loadSamples = samples.map((s) => s.loadMs).filter((ms) => ms > 0);
    const timing = {
      samples,
      median: {
        ttfbMs: median(samples.map((s) => s.ttfbMs)),
        domContentLoadedMs: median(samples.map((s) => s.domContentLoadedMs)),
        loadMs: loadSamples.length ? median(loadSamples) : null,
      },
    };
    await test.info().attach('home-navigation-timing.json', {
      body: JSON.stringify(timing, null, 2),
      contentType: 'application/json',
    });

    // DOMContentLoaded is the budget that always has a real number behind it.
    expect(timing.median.domContentLoadedMs, 'DOMContentLoaded (median)').toBeLessThan(env.perf.pageLoadBudgetMs);
    if (timing.median.loadMs !== null) {
      expect.soft(timing.median.loadMs, 'load event (median)').toBeLessThan(env.perf.pageLoadBudgetMs);
    }
  });

  test('product list renders within budget', async ({ browser }) => {
    const renders = await sampleColdLoads(browser, async (page) => {
      const homePage = new HomePage(page);
      const started = Date.now();
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await expect(homePage.productCards.first()).toBeVisible();
      return Date.now() - started;
    });

    const report = { samples: renders, medianMs: median(renders), maxMs: Math.max(...renders) };
    await test.info().attach('product-list-render.json', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
    expect(report.medianMs, 'render (median)').toBeLessThan(env.perf.pageLoadBudgetMs);
  });

  test('catalogue and login API latency (p95) are within budget', async ({ api, newUser }) => {
    const samples = env.perf.apiSamples;
    const entries: number[] = [];
    const logins: number[] = [];
    for (let i = 0; i < samples; i++) {
      entries.push((await api.getProducts()).durationMs);
      logins.push((await api.login(newUser.username, newUser.password)).durationMs);
    }
    const report = {
      samples,
      entries: { p95: percentile(entries, 0.95), max: Math.max(...entries), all: entries },
      login: { p95: percentile(logins, 0.95), max: Math.max(...logins), all: logins },
    };
    await test.info().attach('api-latency.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });

    expect.soft(report.entries.p95, 'GET /entries p95').toBeLessThan(env.perf.apiBudgetMs);
    expect(report.login.p95, 'POST /login p95').toBeLessThan(env.perf.apiBudgetMs);
  });
});
