/**
 * Single-run lock. Two runs share `reports/` and Playwright clears its output
 * dir on start, so a second run deletes the first one's artifacts mid-run
 * (shows up as `browserContext.close: ENOENT` and fake failures).
 *
 * Stores the owner pid. If that process is gone (killed run), the lock is taken over.
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
        "Two runs share reports/ and delete each other's artifacts, which shows up as",
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

module.exports = { acquire };
