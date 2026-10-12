import { Browser, Page } from '@playwright/test';
import { test, expect } from '../../src/fixtures';
import { env } from '../../config/env';
import { HomePage } from '../../src/pages/HomePage';

/**
 * Lightweight performance budgets. Raw metrics are attached to the report.
 *
 * - Budgets use a median/percentile of several samples; one slow load is noise.
 * - Each sample uses a fresh context, otherwise later loads come from cache.
 * - The perf project runs last, after the other projects (see playwright.config.ts).
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

    // loadEventEnd is 0 if the load event hasn't fired yet (HLS video delays it).
    // 0 means "not measured", so drop those samples from the median.
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
