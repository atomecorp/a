// Conditions connector for the `health` live source. It is a consumer of the
// health owner like the Dashboard: it never requests permissions, never links
// an account and only receives values the owner already reads for the signed-in,
// linked account.

const DEFAULT_FRESHNESS_MS = 15 * 60 * 1000;

export function createNativeHealthConnector({ owner, field = 'heart_rate', monitorId = field, freshnessMs = DEFAULT_FRESHNESS_MS } = {}) {
    if (typeof owner?.subscribe !== 'function') return null;
    return Object.freeze({
        subscribe(publish, revoke) {
            if (typeof publish !== 'function') throw new Error('condition_health_publish_required');
            return owner.subscribe(monitorId, (reading) => {
                if (reading?.state === 'value' && Number.isFinite(reading.measuredTo)) {
                    // Freshness counts from the MEASUREMENT time, not from the
                    // read: an old sample re-read now is not a current value.
                    publish({
                        subjectId: 'current', field, value: reading.value, unit: reading.unit,
                        timestamp: reading.measuredTo, ttlMs: freshnessMs
                    });
                    return;
                }
                if (reading?.state !== 'loading') revoke?.({ subjectId: 'current', field, reasonCode: reading?.reasonCode || reading?.state });
            });
        }
    });
}
