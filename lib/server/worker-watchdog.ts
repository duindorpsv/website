const stages = ['archive-initialization', 'sportlink-scheduler', 'sponsor-scheduler', 'storage', 'claim', 'job', 'retention', 'orphan-cleanup', 'idle', 'retry-delay', 'shutdown'] as const;
export type WorkerStage = typeof stages[number];
export type WorkerStallReport = {code: 'worker-stalled'; stage: WorkerStage; elapsed_ms: number};
type WatchdogOptions = {onStall?: (report: WorkerStallReport) => void; now?: () => number; timeoutMs?: number};

function stopStalledWorker(report: WorkerStallReport) {
  console.error(JSON.stringify(report));
  process.exit(1);
}

/** A stopped await cannot report its own failure. Exit so the process supervisor can recover it. */
export function createWorkerWatchdog({onStall = stopStalledWorker, now = () => performance.now(), timeoutMs = 5 * 60_000}: WatchdogOptions = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Ongeldige workerbewakingstermijn.');
  let stage: WorkerStage = 'archive-initialization', lastProgressAt = now(), stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    const elapsed = Math.max(0, Math.floor(now() - lastProgressAt));
    if (elapsed < timeoutMs) return;
    stopped = true;
    clearInterval(timer);
    onStall({code: 'worker-stalled', stage, elapsed_ms: elapsed});
  }, Math.min(30_000, timeoutMs));
  timer.unref();
  return {
    progress(nextStage: WorkerStage) {
      if (stopped) return;
      if (!stages.includes(nextStage)) throw new TypeError('Ongeldige workerfase.');
      stage = nextStage;
      lastProgressAt = now();
    },
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

/** A finished or unowned renewal must not keep a later worker stage alive. */
export function createWorkerLeaseRenewal(renew: () => PromiseLike<{length: number}>, progress: (stage: WorkerStage) => void) {
  let active = true, inFlight = false;
  const timer = setInterval(() => {
    if (!active || inFlight) return;
    inFlight = true;
    void Promise.resolve().then(renew).then(rows => {
      if (active && rows.length > 0) progress('job');
    }).catch(() => {}).finally(() => {inFlight = false;});
  }, 20_000);
  timer.unref();
  return {
    stop() {
      active = false;
      clearInterval(timer);
    },
  };
}
