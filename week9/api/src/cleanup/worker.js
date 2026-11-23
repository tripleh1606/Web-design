// Calls the existing storage lifecycle; never owns a competing job store.
export function startCleanupWorker({ lifecycle, repository, intervalSeconds, report = console.warn }) {
  let running = null;
  let stopped = false;
  async function tick() {
    if (stopped || running) return;
    running = (async () => {
      const failures = await lifecycle.recover();
      await repository.pruneSessions();
      if (failures.length) report(`Cleanup pending: ${failures.length} job(s).`);
    })().catch(() => report('Cleanup retry failed; durable jobs retained.'));
    try { await running; } finally { running = null; }
  }
  const timer = setInterval(tick, intervalSeconds * 1000);
  timer.unref();
  return { async stop() { stopped = true; clearInterval(timer); await running; } };
}
