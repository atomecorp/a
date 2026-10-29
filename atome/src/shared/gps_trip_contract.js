// Canonical private itinerary description. Device fixes are transient capabilities.
export const GPS_POINT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['lat', 'lon'], properties: { lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 }, label: { type: 'string', maxLength: 512 } } });
export const GPS_ROUTE_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['shape', 'maneuvers', 'distance_m', 'duration_s', 'provider', 'calculated_at'], properties: {
        shape: { type: 'string', minLength: 4, maxLength: 1000000 },
        via_indices: { type: 'array', maxItems: 16, items: { type: 'integer', minimum: 0 } },
        maneuvers: { type: 'array', maxItems: 5000, items: { type: 'object', additionalProperties: false,
            required: ['instruction', 'begin', 'end', 'distance_m', 'duration_s'], properties: {
                instruction: { type: 'string', maxLength: 2048 }, begin: { type: 'integer', minimum: 0 },
                end: { type: 'integer', minimum: 0 }, distance_m: { type: 'number', minimum: 0 },
                duration_s: { type: 'number', minimum: 0 } } } },
        distance_m: { type: 'number', minimum: 0 }, duration_s: { type: 'number', minimum: 0 },
        provider: { type: 'string', enum: ['valhalla'] }, calculated_at: { type: 'string', format: 'date-time' }
    } });
// One per account, rewritten in place while its owner shares it. Contacts only
// ever read it through a read-only linked share the owner granted them.
export const LIVE_POSITION_TYPE = Object.freeze({ type: 'live_position', kind: 'data_model', traits: [], schema: {
    lat: { type: 'number', minimum: -90, maximum: 90 }, lon: { type: 'number', minimum: -180, maximum: 180 },
    accuracy: { type: 'number', minimum: 0 }, timestamp: { type: 'number', minimum: 0 },
    // The owner's display name: a contact who does not have them in their book still knows whose dot it is.
    name: { type: 'string', maxLength: 128 },
    access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] }
} });
export const livePositionId = ownerId => 'live_position_' + ownerId;
export const isLivePositionId = id => String(id || '').startsWith('live_position_');
export const GPS_TRIP_TYPE = Object.freeze({ type: 'gps_trip', kind: 'data_model', traits: ['navigable'], schema: {
    name: { type: 'string', maxLength: 512 }, origin: GPS_POINT_SCHEMA, destination: GPS_POINT_SCHEMA,
    waypoints: { type: 'array', maxItems: 16, items: GPS_POINT_SCHEMA }, route: GPS_ROUTE_SCHEMA,
    waypoint_offset: { type: 'integer', minimum: 0, maximum: 16 },
    status: { type: 'string', enum: ['planned', 'navigating', 'stopped', 'arrived', 'interrupted'] },
    revision: { type: 'number', minimum: 0 },
    // Kept among the user's favourite trips (Trajets' Favoris).
    favorite: { type: 'boolean' },
    navigation_device: { type: 'string', maxLength: 200 }, started_at: { type: 'string' }, ended_at: { type: 'string' },
    access: { type: 'string', enum: ['private'] },
    visibility: { type: 'string', enum: ['private'] }
} });
