const HEALTH_SAMPLE_EVENT = 'atome:native-health-sample';
const HEALTH_REVOKED_EVENT = 'atome:native-health-revoked';

export function createNativeHealthConnector({ invoke, eventTarget } = {}) {
    if (typeof invoke !== 'function' || !eventTarget?.addEventListener) return null;
    return Object.freeze({
        subscribe(publish, revoke) {
            if (typeof publish !== 'function') throw new Error('condition_health_publish_required');
            const onSample = (event) => {
                const detail = event?.detail || {};
                publish({
                    subjectId: detail.subjectId || detail.subject_id || 'current',
                    field: detail.field || 'heart_rate',
                    value: detail.value,
                    unit: detail.unit || 'bpm',
                    timestamp: detail.timestamp,
                    ttlMs: detail.ttlMs || detail.ttl_ms
                });
            };
            const onRevoked = (event) => revoke?.({
                subjectId: event?.detail?.subjectId || event?.detail?.subject_id || 'current',
                field: event?.detail?.field || 'heart_rate'
            });
            eventTarget.addEventListener(HEALTH_SAMPLE_EVENT, onSample);
            eventTarget.addEventListener(HEALTH_REVOKED_EVENT, onRevoked);
            void invoke('health_heart_rate_start', {}).then(undefined, (error) => onRevoked({
                detail: { reasonCode: error?.message || 'condition_health_start_failed' }
            }));
            let active = true;
            return () => {
                if (!active) return false;
                active = false;
                eventTarget.removeEventListener(HEALTH_SAMPLE_EVENT, onSample);
                eventTarget.removeEventListener(HEALTH_REVOKED_EVENT, onRevoked);
                void invoke('health_heart_rate_stop', {}).then(undefined, (error) => onRevoked({
                    detail: { reasonCode: error?.message || 'condition_health_stop_failed' }
                }));
                return true;
            };
        }
    });
}

export { HEALTH_REVOKED_EVENT, HEALTH_SAMPLE_EVENT };
