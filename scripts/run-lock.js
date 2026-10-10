/**
 * A single-run lock for the project.
 *
 * Two runs of this suite share `reports/`, and every `playwright test` empties
 * its output directory when it starts. A second run therefore deletes the
 * artifacts of the first while it is still writing them, which surfaces as a
 * storm of `browserContext.close: ENOENT` failures plus timeouts from the two
 * suites competing for the machine - failures that look real and are not.
 *
 * The lock records the owning process id. A lock whose process is gone was left
 * behind by a run that was killed, and is taken over rather than respected, so
 * a crashed run never blocks the next one.
 *
 * It only guards runs of *this* project. A suite running in another checkout
 * has its own `reports/` and cannot corrupt this one, though it still competes
 * for CPU and will widen the slow tail that makes WebKit flaky.
 */
const fs = require('fs');
const path = require('path');

const LOCK_FILE = path.join('reports', '.run.lock');

const read = () => {
  try {
    return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
  } catch {
    return null;
  }
};

/** `kill(pid, 0)` only probes. EPERM means the process exists but is not ours. */
const isRunning = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

/** Takes the lock, or reports who holds it and exits. Releases on the way out. */
function acquire() {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });

  const held = read();
  if (held && isRunning(held.pid)) {
    console.error(
      [
        '',
        `Another run of this project is already in progress (pid ${held.pid}, started ${held.startedAt}).`,
        '',
        'Two runs share reports/ and delete each other’s artifacts, which shows up as',
        'failures that are not real. Wait for it to finish, or stop it.',
        '',
        `If that process is gone, delete ${LOCK_FILE} and try again.`,
        '',
      ].join('\n'),
    );
    process.exit(2);
  }

  fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2));

  const release = () => {
    const current = read();
    if (current && current.pid === process.pid) fs.rmSync(LOCK_FILE, { force: true });
  };
  process.on('exit', release);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      release();
      process.exit(130);
    });
  }
}

module.exports = { acquire, LOCK_FILE };
