export const createSyncQueueWorker = ({
  drain,
  onError = () => {},
  initialDelayMs = 500,
  intervalMs = 2000,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval
} = {}) => {
  if (typeof drain !== 'function') throw new Error('sync_queue_worker_drain_required');
  let initialTimer = null;
  let intervalTimer = null;
  let inFlight = null;

  const run = () => {
    if (inFlight) return inFlight;
    const current = Promise.resolve()
      .then(drain)
      .catch((error) => {
        onError(error);
        return null;
      })
      .finally(() => {
        if (inFlight === current) inFlight = null;
      });
    inFlight = current;
    return current;
  };

  const start = () => {
    if (initialTimer || intervalTimer) return false;
    initialTimer = setTimeoutFn(() => {
      initialTimer = null;
      void run();
    }, initialDelayMs);
    intervalTimer = setIntervalFn(() => { void run(); }, intervalMs);
    return true;
  };

  const stop = () => {
    if (initialTimer) clearTimeoutFn(initialTimer);
    if (intervalTimer) clearIntervalFn(intervalTimer);
    initialTimer = null;
    intervalTimer = null;
    return true;
  };

  return {
    run,
    start,
    stop,
    state: () => ({ active: !!(initialTimer || intervalTimer), processing: !!inFlight })
  };
};
