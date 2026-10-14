import { createGpsProvider } from './gps_provider.js';
import { GPS_ERRORS } from '../atome/src/squirrel/gps/contracts.js';
import { wsResponse } from './wsResponse.js';

// Bounded provider requests, not a second account/state transport.
export function createWsGpsHandler({ provider = createGpsProvider(), now = Date.now } = {}) {
    const windows = new Map();
    return async (message, address) => {
        if (message?.type !== 'gps-resource') return null;
        const respond = fields => wsResponse('gps-resource', message, fields.ok === true, fields);
        const { action, input = {} } = message;
        if (!['describe', 'route', 'search', 'tiles'].includes(action) || !input || typeof input !== 'object' || Array.isArray(input))
            return respond({ success: false, ok: false, error: 'INVALID_ARGUMENT' });
        const timestamp = now(), key = String(address || 'unknown');
        const window = windows.get(key);
        const entry = window && timestamp - window.at < 60000 ? window : { at: timestamp, count: 0 };
        if (++entry.count > 60) return respond({ success: false, ok: false, error: 'RATE_LIMITED' });
        windows.set(key, entry);
        if (windows.size > 10000) for (const [id, value] of windows) if (timestamp - value.at >= 60000) windows.delete(id);
        try {
            let data;
            if (action === 'describe') data = provider.describe();
            if (action === 'route') data = { route: await provider.route(input) };
            if (action === 'search') data = { places: await provider.search(input.query) };
            if (action === 'tiles') {
                if (!Array.isArray(input.tiles) || input.tiles.length > 32) throw new Error('INVALID_ARGUMENT');
                const tiles = [];
                // Bound provider concurrency and the complete WS frame, including base64 expansion.
                let bytes = 0;
                for (const tile of input.tiles) {
                    const source = await provider.tile(tile); bytes += source.length;
                    if (bytes > 8000000) throw new Error('INVALID_PROVIDER_RESPONSE');
                    tiles.push({ ...tile, source });
                }
                data = { tiles };
            }
            return respond({ success: true, ok: true, ...data });
        } catch (error) {
            return respond({ success: false, ok: false, error: GPS_ERRORS.includes(error.message) ? error.message : 'PROVIDER_UNAVAILABLE' });
        }
    };
}
export const handleWsGpsOperation = createWsGpsHandler();
