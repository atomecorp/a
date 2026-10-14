// Valhalla polyline6 is the canonical compact geometry; decoded points are projections.
export function decodeGpsShape(shape) {
    if (typeof shape !== 'string' || shape.length > 1000000) throw new Error('INVALID_PROVIDER_RESPONSE');
    const points = []; let index = 0, lat = 0, lon = 0;
    const read = () => {
        let value = 0, shift = 0, byte;
        do {
            if (index >= shape.length || shift > 30) throw new Error('INVALID_PROVIDER_RESPONSE');
            byte = shape.charCodeAt(index++) - 63;
            if (byte < 0 || byte > 63) throw new Error('INVALID_PROVIDER_RESPONSE');
            value |= (byte & 31) << shift; shift += 5;
        } while (byte >= 32);
        return value & 1 ? ~(value >> 1) : value >> 1;
    };
    while (index < shape.length) {
        lat += read(); lon += read(); points.push({ lat: lat / 1e6, lon: lon / 1e6 });
        if (points.length > 50000) throw new Error('INVALID_PROVIDER_RESPONSE');
    }
    return points;
}
export function encodeGpsShape(points) {
    let lat = 0, lon = 0, shape = '';
    const write = delta => {
        let value = delta < 0 ? ~(delta << 1) : delta << 1;
        while (value >= 32) { shape += String.fromCharCode((32 | (value & 31)) + 63); value >>>= 5; }
        shape += String.fromCharCode(value + 63);
    };
    for (const point of points) {
        const a = Math.round(point.lat * 1e6), b = Math.round(point.lon * 1e6);
        write(a - lat); write(b - lon); lat = a; lon = b;
    }
    return shape;
}
