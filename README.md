# DemoBlaze E2E Automation Framework

Playwright + TypeScript framework for **https://www.demoblaze.com**, covering the **Login** and **Cart / Place Order** features with UI, API, regression and performance tests, cross-browser and mobile execution, CI/CD pipelines and multi-format reporting.

| Deliverable | Location |
|---|---|
| Test case suite (63 cases: Login 29, Cart 34) | [`docs/DemoBlaze_Test_Cases.xlsx`](docs/DemoBlaze_Test_Cases.xlsx) |
| Framework + demo scripts | this repository |
| CI/CD | [`.github/workflows/e2e.yml`](.github/workflows/e2e.yml), [`Jenkinsfile`](Jenkinsfile) |

> Built with help from AI coding tools for some parts. Test design, debugging decisions and final review are mine.

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
│   └── utils/                  # retry, alerts, form filling, network waits, reload-retry, price parsing
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

**One run, perf last.** Everything runs in one `playwright test` run with one report. The `perf` project depends on all other projects, so it runs at the end on its own and the suite's load doesn't skew the numbers (details in [playwright.config.ts](playwright.config.ts)). If a functional project fails, perf is skipped. `npm run test:perf` runs perf alone; filtered runs like `npm test -- --grep @smoke` skip the dependency ([scripts/run.js](scripts/run.js)).

**6 workers by default.** WebKit on Windows gets flaky above that (see [config/env.ts](config/env.ts)). `WORKERS` overrides it.

**`npm test` uses a single-run lock** ([scripts/run-lock.js](scripts/run-lock.js)), so two runs can't delete each other's files in `reports/`. A lock left by a killed run is taken over automatically.

**Handling DemoBlaze specifics.**
- Most results are native `alert()` dialogs fired after an XHR. `utils/dialog.ts` sets up the listener before the click and returns the alert text. If the XHR fails, it reports that instead of a plain timeout.
- Bootstrap focuses the modal root when its fade ends, which can swallow a `fill()`. Modals wait for that focus, and `utils/form.ts` re-checks every value it fills.
- Cart rows load asynchronously, one `POST /view` per row. `CartPage` counts rows only after every item from `/viewcart` has its row, so a half-rendered cart can't pass a count check. Only the rendering is retried, never the count.
- The site never retries its own XHRs, so a dropped request leaves the page broken until reload. `utils/reload.ts` reloads once for the product list, welcome name and cart rows. Navigation, login, add to cart and user signup are retried once, but only when the request never reached the server, so nothing is applied twice.
- The nav links are Bootstrap toggles, so a second click closes the modal. `NavBar` only clicks when the modal is closed (checked via the `show` class).
- On mobile viewports the navbar collapses; `NavBar` opens the hamburger menu when needed, so the same tests run on desktop and mobile.
- Prices are read from the product page at runtime instead of being hard-coded, so price changes don't break tests.

**Data-driven negative tests.** Login and order-form validation cases are tables of inputs and expected alerts, so adding a case is one line.

**Known defects stay visible without breaking the build.** `TC_CART_005` (duplicate rows, DEF-01) and `TC_CART_026` (purchase with an empty cart, DEF-02) are marked with `test.fail()` and an `issue` annotation. Each passes while its bug exists, and Playwright reports it as "unexpectedly passed" once the bug is fixed, prompting removal of the marker.

**Traceability.** Test titles start with the test case ID from the workbook (e.g. `TC_LOGIN_008`), so a case in the workbook can be found in the specs by searching its ID.

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

`tests/ui/checkout.spec.ts › TC_CART_020` runs the demo flow as `test.step`s:

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
