// A control's message to the network (R-347 L12), sent by a server, never by the page: the `/ws/api`
// `network` family (atome/servers/atome-server/src/network/). In the apps (Tauri, iOS) the local server
// sends it — OSC over UDP to the person's own network, or HTTP —; on the Web the central server sends
// HTTP to a public address and refuses OSC (`network_osc_local_only`).
const text = (value) => String(value ?? '').trim();

/** The frame of a request `{ protocol, address, path?, value?, method?, body? }`. */
export const networkFrame = ({ protocol, address, path, value, method, body } = {}) => {
    const frame = { type: 'network', action: 'send', protocol: text(protocol), address: text(address), path: text(path) };
    if (value !== undefined) frame.value = value;
    if (method !== undefined) frame.method = text(method);
    if (body !== undefined) frame.body = body;
    return frame;
};

/** `{ ok, error, status }` from the socket client's settled answer (`http_status` an HTTP status, none for OSC). */
export const networkAnswer = (response) => {
    const ok = response?.ok === true;
    const status = Number(response?.http_status) || null;
    return { ok, error: ok ? null : text(response?.error) || 'network_send_failed', status };
};

/** Sends `request` through the local server when the page runs in an app, else the central one. */
export const sendNetworkMessage = async (request, { onLocalServer, local, central }) => {
    const frame = networkFrame(request);
    return networkAnswer(await (onLocalServer ? local(frame) : central(frame)));
};
