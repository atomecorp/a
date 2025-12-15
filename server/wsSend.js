export function wsSendRaw(connection, raw, meta = null) {
    try {
        connection.send(raw);
        return true;
    } catch (error) {
        const details = error?.message || error;
        if (meta) {
            console.error('❌ WebSocket send error:', meta, details);
        } else {
            console.error('❌ WebSocket send error:', details);
        }
        return false;
    }
}

export function wsSendJson(connection, payload, meta = null) {
    return wsSendRaw(connection, JSON.stringify(payload), meta);
}

export function wsBroadcastJson(connections, payload, meta = null) {
    const raw = JSON.stringify(payload);
    let sent = 0;
    connections.forEach((conn) => {
        if (wsSendRaw(conn, raw, meta)) sent += 1;
    });
    return sent;
}

export function wsSendJsonToTargets(targets, payload, meta = null) {
    if (!targets || targets.size === 0) {
        return { delivered: false, recipientConnections: 0 };
    }

    const raw = JSON.stringify(payload);
    let delivered = false;
    targets.forEach((conn) => {
        if (wsSendRaw(conn, raw, meta)) delivered = true;
    });

    return { delivered, recipientConnections: targets.size };
}
