#!/usr/bin/env node
/**
 * `npm test` - one `playwright test` run, guarded by the single-run lock.
 *
 * The lock exists because two runs share `reports/` and every `playwright test`
 * empties its output directory on start, so the second one deletes the first
 * one's artifacts mid-run. That surfaces as a storm of failures that are not
 * real; see scripts/run-lock.js.
 *
 * Arguments are passed through, so `npm test -- --grep @smoke` works. The CLI
 * runs through node rather than `npx` with a shell, because a shell would
 * re-split the arguments and lose the quoting.
 */
const { spawnSync } = require('child_process');
const { acquire } = require('./run-lock');

const args = process.argv.slice(2);

// `perf` depends on every other project so that it runs last and alone, but a
// dependency is run in full regardless of any filter - so `--grep @smoke` would
// drag the whole suite in behind it. A filtered run is not a measurement run,
// so it drops the dependency and simply runs what was asked for.
const selecting = args.some((arg) => /^(-g|--grep|--grep-invert)(=|$)/.test(arg) || !arg.startsWith('-'));
const noDeps = selecting && !args.includes('--no-deps') ? ['--no-deps'] : [];

acquire();

const result = spawnSync(
  process.execPath,
  [require.resolve('@playwright/test/cli'), 'test', ...noDeps, ...args],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
