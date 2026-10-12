#!/usr/bin/env node
/**
 * `npm test` - runs `playwright test` behind the single-run lock (see run-lock.js).
 * Args are passed through, e.g. `npm test -- --grep @smoke`. Spawned via node,
 * not a shell, so quoting in the args is kept.
 */
const { spawnSync } = require('child_process');
const { acquire } = require('./run-lock');

const args = process.argv.slice(2);

// perf depends on all other projects, and dependencies ignore --grep, so a
// filtered run would pull in the whole suite. Filtered runs skip the deps.
const selecting = args.some((arg) => /^(-g|--grep|--grep-invert)(=|$)/.test(arg) || !arg.startsWith('-'));
const noDeps = selecting && !args.includes('--no-deps') ? ['--no-deps'] : [];

acquire();

const result = spawnSync(
  process.execPath,
  [require.resolve('@playwright/test/cli'), 'test', ...noDeps, ...args],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
