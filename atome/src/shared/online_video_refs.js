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

// A YouTube video's watch address, from its id.
export const youtubeWatchUrl = (ref) => `https://www.youtube.com/watch?v=${ref}`;
// A third party's video an online service hosts (a YouTube or PeerTube Atome: `media_source` the service, its
// reference property) may not be redistributed: eVe never holds its file, so it is shared as its link alone
// (R-005 Q33, user reco 2026-10-30). The server's News publish and the networks' payload read this rule.
// `{ provider, link, title }` for such an Atome's properties, `null` for any other media; a service Atome without a
// valid reference is refused.
const SHARE_LINKS = Object.freeze({
    youtube: (props) => { const ref = youtubeVideoRef(props.youtube_video_id); return ref ? youtubeWatchUrl(ref) : ''; },
    peertube: (props) => peertubeVideoRef(props.peertube_video_url)?.ref || ''
});
export const onlineVideoShareLink = (properties = {}) => {
    const provider = text(properties?.media_source);
    if (!Object.hasOwn(SHARE_LINKS, provider)) return null;
    const link = SHARE_LINKS[provider](properties);
    if (!link) throw new Error('online_video_ref_invalid');
    return { provider, link, title: text(properties[`${provider}_title`] || properties.name) };
};
// The properties an Atome of the service takes again from such a link (`{ provider, link, title }`): a News reference,
// the author's or a reader's, that plays the video in place from its service, never a copy of its file.
const REF_PROPERTIES = Object.freeze({
    youtube: (link) => { try { return { youtube_video_id: youtubeVideoRef(new URL(link).searchParams.get('v')) }; } catch { return { youtube_video_id: '' }; } },
    peertube: (link) => ({ peertube_video_url: peertubeVideoRef(link)?.ref || '' })
});
export const onlineVideoAtomeProps = ({ provider, link, title = '' } = {}) => {
    if (!Object.hasOwn(REF_PROPERTIES, text(provider))) throw new Error('online_video_provider_unknown');
    const name = text(title);
    const props = { media_source: provider, ...REF_PROPERTIES[provider](text(link)), ...(name ? { name, [`${provider}_title`]: name } : {}) };
    if (onlineVideoShareLink(props).link !== text(link)) throw new Error('online_video_ref_invalid');
    return { ...props, media_url: text(link) };
};
