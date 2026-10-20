// How an online video service names one video. The client (Finder, tool,
// viewing lists), the command contracts and the server read the same rules.
//
// YouTube: the 11-character video id.
// PeerTube: federated, so a video is only named with its instance: the
// canonical watch address `https://{host}/w/{shortUUID}` or
// `https://{host}/videos/watch/{uuid}` (an embed address names it too).

const text = (value) => String(value == null ? '' : value).trim();

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const YOUTUBE_VIDEO_ID_PATTERN = '^[A-Za-z0-9_-]{11}$';
export const youtubeVideoRef = (value) => (YOUTUBE_VIDEO_ID.test(text(value)) ? text(value) : '');

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SHORT_UUID = '[1-9A-HJ-NP-Za-km-z]{20,24}';
const PEERTUBE_PATH = new RegExp(`^/(?:w/(${SHORT_UUID})|videos/(?:watch|embed)/(${UUID}|${SHORT_UUID}))/?$`);
// A host name with a dot; never an IP literal, a port or a local name.
const PUBLIC_HOST = /^(?=.{4,253}$)(?!\d+(?:\.\d+){3}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const PEERTUBE_VIDEO_URL_PATTERN = '^https://[^/]+/(?:w|videos/watch|videos/embed)/[^/?#]+/?$';

// `{ ref, host, id }` for a PeerTube video address, `null` otherwise. `ref` is
// the address kept on the Atome: https, the instance host and the watch path.
export const peertubeVideoRef = (value) => {
    let url;
    try { url = new URL(text(value)); } catch { return null; }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.port || url.username || !PUBLIC_HOST.test(host)) return null;
    const match = PEERTUBE_PATH.exec(url.pathname);
    if (!match) return null;
    const id = match[1] || match[2];
    return { ref: id.includes('-') ? `https://${host}/videos/watch/${id}` : `https://${host}/w/${id}`, host, id };
};
