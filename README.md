# DemoBlaze E2E Automation Framework

Playwright + TypeScript framework for **https://www.demoblaze.com**, covering the **Login** and **Cart / Place Order** features with UI, API, regression and performance tests, cross-browser and mobile execution, CI/CD pipelines and multi-format reporting.

| Deliverable | Location |
|---|---|
| Test case suite (63 cases: Login 29, Cart 34) | [`docs/DemoBlaze_Test_Cases.xlsx`](docs/DemoBlaze_Test_Cases.xlsx) |
| Framework + demo scripts | this repository |
| CI/CD | [`.github/workflows/e2e.yml`](.github/workflows/e2e.yml), [`Jenkinsfile`](Jenkinsfile) |

---

## 1. Quick start

**Prerequisites:** Node.js 20+ and Git. (Java is only needed if you want to view the Allure report.)

```bash
git clone <this-repo-url>
cd demoblaze-e2e
npm ci
npx playwright install --with-deps      # downloads Chromium, Firefox and WebKit

# Run the demo scenario (login -> add to cart -> place order) in a visible browser
npm run test:demo

# Run everything (all browsers, mobile, API, perf) in one run
npm test

# Open the HTML report
npm run report
```

No account setup is needed: each test registers its own unique user through the API, so runs are isolated and repeatable. To use a fixed account instead, set `TEST_USERNAME` / `TEST_PASSWORD` (see Configuration).

### Useful commands

| Command | What it runs |
|---|---|
| `npm run test:demo` | The demo E2E scenario, headed, Chromium |
| `npm run test:smoke` | `@smoke` tests on every project |
| `npm run test:regression` | `@regression` tests on every project |
| `npm run test:ui` | Desktop UI tests on Chromium, Firefox, WebKit |
| `npm run test:mobile` | UI tests on Pixel 7 and iPhone 14 emulation |
| `npm run test:api` | REST API tests (no browser) |
| `npm run test:perf` | Performance budget checks, on their own (`--no-deps`) |
| `npm run test:single` | The whole suite in one pass, one worker count (no staging) |
| `npm run test:headed` / `test:debug` | Headed / step-through debugging on Chromium |
| `npx playwright test --project=firefox --grep @smoke` | Any project × tag combination |
| `npm run report` | Open the HTML report |
| `npm run allure:generate && npm run allure:open` | Build and open the Allure report |
| `npm run typecheck` | TypeScript compile check |

---

## 2. Framework structure

```
demoblaze-e2e/
├── config/
│   └── env.ts                  # typed configuration from env vars / .env files
├── src/
│   ├── api/
│   │   ├── DemoblazeApiClient.ts   # typed REST client (signup, login, entries, cart…)
│   │   └── types.ts
│   ├── components/
│   │   ├── NavBar.ts           # shared navbar, handles the collapsed mobile menu
│   │   └── OrderConfirmation.ts
│   ├── pages/                  # Page Object Model
│   │   ├── BasePage.ts
│   │   ├── HomePage.ts
│   │   ├── LoginModal.ts
│   │   ├── ProductPage.ts
│   │   ├── CartPage.ts
│   │   └── PlaceOrderModal.ts
│   ├── fixtures/
│   │   └── index.ts            # custom Playwright fixtures (pages, api, users)
│   ├── data/                   # test data, products, expected messages
│   └── utils/                  # alerts, form filling, network waits, reload-retry, price parsing
├── tests/
│   ├── ui/                     # login.spec.ts, cart.spec.ts, checkout.spec.ts (demo)
│   ├── api/                    # auth.api.spec.ts, cart.api.spec.ts
│   └── perf/                   # performance.perf.spec.ts
├── docs/DemoBlaze_Test_Cases.xlsx
├── playwright.config.ts        # projects, reporters, retries, artifacts
├── .github/workflows/e2e.yml   # GitHub Actions
├── Jenkinsfile                 # Jenkins pipeline
└── .env.example
```

### Design decisions and rationale

**Playwright + TypeScript.** One tool covers UI, API and basic performance checks, runs on Chromium, Firefox and WebKit, emulates mobile devices, and has auto-waiting, tracing and parallelism built in. TypeScript catches broken locators and data shapes at compile time.

**Layered architecture.** Tests describe *what* is verified, page objects describe *how* to interact with the page, and fixtures wire everything together. When the UI changes, only the page object changes.

```
tests  ->  fixtures  ->  page objects / components  ->  Playwright
                    \->  API client                  ->  api.demoblaze.com
```

**Custom fixtures instead of `beforeEach` boilerplate.** Tests just declare what they need, e.g. `async ({ loggedInUser, productPage, cartPage }) => …`. The `newUser` fixture registers a fresh user through the API (fast), and `loggedInUser` logs that user in through the UI.

**Test isolation.** Every cart test gets its own freshly registered user, so carts never leak between tests and tests can run fully in parallel and in any order.

**One run, with the budgets last.** The suite is a single `playwright test` run, so the terminal shows `Running 161 tests` and one report comes out of it. The `perf` project declares every other project as a dependency, which makes Playwright run it at the end, by itself: the budgets measure the machine, and a page load timed at 15.8s against an 8s budget turned out to be the suite's own load rather than the site. The trade is that Playwright skips a project whose dependency failed, so a genuinely broken functional suite skips the budgets — the right order of concern. `npm run test:perf` uses `--no-deps` to run them alone. A dependency is always run in full, whatever the filter, so a filtered run such as `npm test -- --grep @smoke` would otherwise drag the whole suite along behind it; [scripts/run.js](scripts/run.js) drops the dependency whenever a filter is given, because a filtered run is not a measurement run.

**One worker count, chosen for the browser that degrades first.** WebKit on Windows slows down sharply when several of its browsers run at once: over 5 runs at 8 workers, mobile-safari's p99 was 41.5s against a p90 of 21s and 8 tests exceeded 30s, which is what produced the flaky clusters. It is clean at 6. Medians barely move with the worker count, so the cost of staying low is wall-clock time, not per-test speed. `WORKERS` overrides it.

**`npm test` holds a single-run lock** ([scripts/run-lock.js](scripts/run-lock.js)). Two runs share `reports/`, and every `playwright test` empties its output directory on start, so the second deletes the first one's artifacts mid-run — which surfaces as a storm of failures that are not real. A lock left by a run that was killed is taken over, never respected, so nothing has to be cleaned by hand. A suite running in a *different* checkout cannot corrupt this one, but it still competes for the machine and widens the slow tail.

**Handling DemoBlaze specifics.**
- Most outcomes are native `alert()` dialogs that fire after an XHR. `utils/dialog.ts` arms the listener *before* the click and returns the alert text for assertions. It also watches the XHR itself, so a dropped call is reported as such instead of as a bare dialog timeout.
- Bootstrap focuses a modal's own root when its fade ends, which silently swallows a `fill()` that is in flight. Modals wait for that focus before typing, and `utils/form.ts` re-reads every field it fills.
- Cart rows load asynchronously; assertions use Playwright's retrying `expect` instead of fixed sleeps.
- The site never retries its own XHRs, so a request the backend drops is final: the page stays empty, the modal never closes, the alert never comes, the navbar keeps looking logged out, the cart looks short. Polling the DOM cannot help, because the DOM was rendered once from that one response — only a reload asks again, which is what `utils/reload.ts` does for the product list, the welcome name and the cart rows. Navigation (`BasePage`), opening the cart and the welcome name (`NavBar`), registering a user (`DemoblazeApiClient`) and the XHR-backed actions (`LoginModal`, `ProductPage`) each repeat once instead of waiting longer. Only a request that never reached the server is repeated, so an action can never be applied twice.
- The nav links that open the modals are Bootstrap *toggles*, so a retried click closes what the first click opened. `NavBar` only clicks from the closed state, and reads Bootstrap's `show` class rather than visibility, which stays true throughout the closing animation.
- On mobile viewports the navbar collapses; `NavBar` opens the hamburger menu when needed, so the same tests run on desktop and mobile.
- Prices are read from the product page at runtime instead of being hard-coded, so price changes don't break tests.

**Data-driven negative tests.** Login and order-form validation cases are tables of inputs and expected alerts, so adding a case is one line.

**Known defects stay visible without breaking the build.** `TC_CART_026` (purchase with an empty cart) is marked with `test.fail()` and an `issue` annotation. It passes while the bug exists, and Playwright reports it as "unexpectedly passed" once the bug is fixed, prompting removal of the marker.

**Traceability.** Test titles start with the test case ID from the workbook (e.g. `TC_LOGIN_008`), and the workbook's *Automation Reference* column points back to the spec.

---

## 3. Test types and tags

| Type | Where | How it's selected |
|---|---|---|
| UI (functional, negative, edge) | `tests/ui` | projects `chromium`, `firefox`, `webkit`, `mobile-chrome`, `mobile-safari` |
| API | `tests/api` | project `api` / tag `@api` |
| Smoke | critical paths | tag `@smoke` |
| Regression | full functional suite | tag `@regression` |
| Performance | `tests/perf` | project `perf` / tag `@perf` |
| Known defects | expected failures | tag `@known-defect` |

**Performance** tests check navigation timing (TTFB, DOMContentLoaded, load, FCP), product-list render time, and p95 latency of `GET /entries` and `POST /login` against configurable budgets. Raw metrics are attached to the report. For load or stress testing, the same API client endpoints can be scripted in k6 or Artillery and added as another CI job.

---

## 4. Demo scenario

`tests/ui/checkout.spec.ts › TC_CART_020` runs the requested flow as readable `test.step`s:

1. **Log in with valid credentials** and verify `Welcome <username>`.
2. **Open "Samsung galaxy s6" and add it to the cart**, verifying the title and the "Product added" alert.
3. **Verify the cart** row title, price and that the total equals the sum of the rows.
4. **Place the order** and verify the confirmation: order id, amount equals the cart total, name, card number and date format.
5. **Confirm** and verify the cart is empty afterwards.

Edge and negative cases around it: missing name, missing card, all fields empty, mandatory-fields-only order, closing the modal, and the empty-cart purchase defect. The login and cart specs add wrong / unknown / empty / case-swapped credentials, SQL-injection and script payloads, very long input, duplicate products, deletion, and cart persistence across reloads and re-login.

---

## 5. Configuration

All settings are optional. Copy `.env.example` to `.env`, or pass them as environment variables (CI secrets override files). `TEST_ENV=staging` additionally loads `.env.staging`.

| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `https://www.demoblaze.com` | Web app URL |
| `API_URL` | `https://api.demoblaze.com` | REST API URL |
| `TEST_USERNAME` / `TEST_PASSWORD` | – | Use a fixed account for login tests; otherwise users are auto-registered |
| `HEADLESS` | `true` | Run browsers headless |
| `WORKERS` | 6 local (capped by half the cores) / 2 CI | Parallel workers. WebKit degrades sharply above this on Windows |
| `RETRIES` | 1 local / 2 CI | Retries for flaky network conditions; a retried test is still reported as `flaky` |
| `TEST_TIMEOUT` / `EXPECT_TIMEOUT` | 60000 / 10000 | Timeouts in ms |
| `VIDEO` | `off` local / `retain-on-failure` CI | Video capture. Recording runs an ffmpeg per worker for every test, so it is off locally by default |
| `TRACE` | `retain-on-failure` | Trace capture. Cheaper than video and the primary tool for investigating a failure |
| `PERF_PAGE_LOAD_BUDGET_MS` | 8000 | Page load budget |
| `PERF_API_BUDGET_MS` | 3000 | API p95 budget |
| `PERF_API_SAMPLES` | 5 | Requests per API endpoint in the perf test |
| `PERF_PAGE_SAMPLES` | 3 | Page loads sampled per perf test; budgets assert on the median |

---

## 6. Reporting

Every run produces:

- **HTML report**: `reports/html`, with traces and screenshots on failure, plus videos when `VIDEO` is enabled (`npm run report`).
- **JUnit XML**: `reports/junit/results.xml`, for Jenkins, GitLab and Azure DevOps test tabs.
- **JSON**: `reports/json/results.json`, for dashboards and custom tooling.
- **Allure**: `reports/allure-results`, with steps, attachments and annotations.
- On CI, inline GitHub annotations via the `github` reporter.

---

## 7. CI/CD

**GitHub Actions** (`.github/workflows/e2e.yml`):
- **Pull requests** run `@smoke`. **Pushes to `main`** run everything. A **nightly schedule** runs the full regression plus the perf job.
- An API job runs alongside a UI matrix of `chromium`, `firefox`, `webkit`, `mobile-chrome` and `mobile-safari`, with `fail-fast: false`.
- **Manual runs** (`workflow_dispatch`) accept a tag filter and a base URL.
- Reports are uploaded as artifacts per project. Optional `TEST_USERNAME` / `TEST_PASSWORD` repository secrets are picked up automatically.

**Jenkins** (`Jenkinsfile`) runs inside the official Playwright Docker image, with parameters for project, tag and URL, a nightly cron, and JUnit plus HTML report publishing.

---

## 8. Extending the framework

- **New page:** add a class in `src/pages` extending `BasePage`, then register it in `src/fixtures/index.ts`.
- **New endpoint:** add a method to `DemoblazeApiClient`.
- **New environment:** create `.env.<name>` and run with `TEST_ENV=<name>`.
- **New browser or device:** add a project in `playwright.config.ts` and to the CI matrix.
