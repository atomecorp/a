// Slippy-map presentation contract.
//
// Pure Web Mercator projection and tile arithmetic: no DOM, no renderer, no
// network. It answers one question — given a centre, a zoom and a viewport,
// which tiles are visible and where does each one sit in pixels — so the same
// numbers drive the canvas builder and the probe.
//
// Replaces Leaflet's internal projection. Leaflet could not be ported: it is a
// DOM library that builds its own elements, and nothing of it can live inside a
// WebGPU canvas.

const TILE_SIZE_PX = 256;
const MIN_ZOOM = 0;
const MAX_ZOOM = 19;
// Web Mercator cannot represent the poles; this is the standard cut-off, the
// same one Leaflet and every XYZ tile scheme use.
const MAX_LATITUDE = 85.0511287798;

const isFiniteNumber = (value) => Number.isFinite(Number(value));
const toNumber = (value) => Number(value);

// Longitude wraps rather than clamps: panning east past 180° is legitimate and
// must continue smoothly instead of sticking at the antimeridian.
const wrapLongitude = (lon) => {
    const value = toNumber(lon);
    const wrapped = ((value + 180) % 360 + 360) % 360;
    return wrapped - 180;
};

const clampLatitude = (lat) => Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, toNumber(lat)));

const normalizeZoom = (zoom) => {
    const value = toNumber(zoom);
    if (!isFiniteNumber(value)) throw new Error('squirrel_map_zoom_required');
    if (value < MIN_ZOOM || value > MAX_ZOOM) {
        throw new Error(`squirrel_map_zoom_out_of_range:${value}`);
    }
    return value;
};

const normalizeCenter = (center) => {
    const lon = center?.lon ?? center?.lng ?? center?.longitude;
    const lat = center?.lat ?? center?.latitude;
    if (!isFiniteNumber(lon)) throw new Error('squirrel_map_longitude_required');
    if (!isFiniteNumber(lat)) throw new Error('squirrel_map_latitude_required');
    if (Math.abs(toNumber(lat)) > 90) {
        throw new Error(`squirrel_map_latitude_out_of_range:${toNumber(lat)}`);
    }
    return { lon: wrapLongitude(lon), lat: clampLatitude(lat) };
};

// World pixel coordinates at a given zoom: the whole globe is
// `TILE_SIZE_PX * 2^zoom` pixels wide.
const lonLatToWorld = ({ lon, lat, zoom }) => {
    const z = normalizeZoom(zoom);
    const { lon: safeLon, lat: safeLat } = normalizeCenter({ lon, lat });
    const scale = TILE_SIZE_PX * (2 ** z);
    const x = ((safeLon + 180) / 360) * scale;
    const sinLat = Math.sin((safeLat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
    return { x, y, scale };
};

const worldToLonLat = ({ x, y, zoom }) => {
    const z = normalizeZoom(zoom);
    const scale = TILE_SIZE_PX * (2 ** z);
    const lon = wrapLongitude(((toNumber(x) / scale) * 360) - 180);
    const n = Math.PI - (2 * Math.PI * (toNumber(y) / scale));
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lon, lat: clampLatitude(lat) };
};

const normalizeViewport = ({ width, height }) => {
    const w = Math.round(toNumber(width));
    const h = Math.round(toNumber(height));
    if (!isFiniteNumber(w) || w <= 0) throw new Error('squirrel_map_viewport_width_required');
    if (!isFiniteNumber(h) || h <= 0) throw new Error('squirrel_map_viewport_height_required');
    return { width: w, height: h };
};

// The visible tile grid. Each entry carries its XYZ address and the pixel
// position of its top-left corner inside the viewport, so the caller only has
// to place an image there.
const tilesForViewport = ({ center, zoom, width, height } = {}) => {
    const z = normalizeZoom(zoom);
    const safeCenter = normalizeCenter(center);
    const viewport = normalizeViewport({ width, height });
    const world = lonLatToWorld({ ...safeCenter, zoom: z });
    const tileCount = 2 ** z;
    const originX = world.x - (viewport.width / 2);
    const originY = world.y - (viewport.height / 2);
    const firstTileX = Math.floor(originX / TILE_SIZE_PX);
    const firstTileY = Math.floor(originY / TILE_SIZE_PX);
    const lastTileX = Math.floor((originX + viewport.width - 1) / TILE_SIZE_PX);
    const lastTileY = Math.floor((originY + viewport.height - 1) / TILE_SIZE_PX);

    const tiles = [];
    for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
        // Rows above the north pole or below the south pole have no tile: the
        // map ends there, it does not wrap vertically.
        if (tileY < 0 || tileY >= tileCount) continue;
        for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
            // Columns wrap: the world repeats east-west.
            const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
            tiles.push({
                x: wrappedX,
                y: tileY,
                z,
                left: Math.round((tileX * TILE_SIZE_PX) - originX),
                top: Math.round((tileY * TILE_SIZE_PX) - originY),
                size: TILE_SIZE_PX
            });
        }
    }
    return tiles;
};

// Where a geographic point lands inside the viewport, in pixels. Used for the
// marker; a point outside the viewport returns `visible: false` rather than a
// clamped position, so the caller can skip drawing it.
const projectToViewport = ({ point, center, zoom, width, height } = {}) => {
    const z = normalizeZoom(zoom);
    const viewport = normalizeViewport({ width, height });
    const world = lonLatToWorld({ ...normalizeCenter(center), zoom: z });
    const target = lonLatToWorld({ ...normalizeCenter(point), zoom: z });
    const x = target.x - world.x + (viewport.width / 2);
    const y = target.y - world.y + (viewport.height / 2);
    return {
        x,
        y,
        visible: x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height
    };
};

// Panning by a *drag* delta, in pointer pixels: the deltas are how far the
// finger moved, not how far the viewport should travel. Dragging the map to the
// right therefore reveals what lies to the west and the centre longitude
// decreases — the convention every map obeys, and the reason the deltas are
// subtracted here. Latitude clamps at the Mercator limit, so dragging past the
// pole stops instead of flipping the world over.
const panCenter = ({ center, zoom, deltaX = 0, deltaY = 0 } = {}) => {
    const z = normalizeZoom(zoom);
    const world = lonLatToWorld({ ...normalizeCenter(center), zoom: z });
    return worldToLonLat({
        x: world.x - toNumber(deltaX),
        y: world.y - toNumber(deltaY),
        zoom: z
    });
};

const clampZoom = (zoom) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(toNumber(zoom) || 0)));

const normalizeMapPresentation = ({ center, zoom, width, height } = {}) => {
    const z = normalizeZoom(zoom);
    const safeCenter = normalizeCenter(center);
    const viewport = normalizeViewport({ width, height });
    return {
        center: safeCenter,
        zoom: z,
        width: viewport.width,
        height: viewport.height,
        tiles: tilesForViewport({ center: safeCenter, zoom: z, ...viewport }),
        tileSize: TILE_SIZE_PX
    };
};

export {
    MAX_LATITUDE,
    MAX_ZOOM,
    MIN_ZOOM,
    TILE_SIZE_PX,
    clampZoom,
    lonLatToWorld,
    normalizeMapPresentation,
    panCenter,
    projectToViewport,
    tilesForViewport,
    worldToLonLat,
    wrapLongitude
};
