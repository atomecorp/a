// Which side of a connected screen this page is (R-212, user 17 Nov. 2026). The device's own page
// leads; the page a connected screen shows (HDMI, USB-C, AirPlay, Cast, a Mac's second screen)
// follows it: a second view of the same document, at that screen's own size, read only, no tools.
// The host that opens the follower page names its role in the page's address, read once here.
const ROLE_PARAM = 'display';
const FOLLOWER = 'follower';

const readRole = () => {
    const search = globalThis.location?.search || '';
    return new URLSearchParams(search).get(ROLE_PARAM) === FOLLOWER ? FOLLOWER : 'leader';
};
const role = readRole();

export const isExternalDisplayFollower = () => role === FOLLOWER;

// The follower page: this page's own address, its role named (the hosts open it: Web, Tauri, iOS, Android).
export const externalDisplayFollowerUrl = (href = globalThis.location?.href) => {
    const url = new URL(href);
    url.searchParams.set(ROLE_PARAM, FOLLOWER);
    url.hash = '';
    return url.toString();
};

// Two followers that are no connected screen (R-248, user 24 Nov. 2026, Téléporte: « l'ensemble du bureau si rien n'est
// sélectionné »):
// - the stream page (`stream=1`): the follower drawn out of sight at a television's size inside the device's own page,
//   whose pictures go to an Apple TV or a Chromecast as a live video (eVe/domains/screens/view_cast.js);
// - a remote follower (`remote=<surface id>`): another device of the account showing this device's place, the two pages
//   linked through the server's seats.
const STREAM_PARAM = 'stream';
const REMOTE_PARAM = 'remote';
const readParam = name => new URLSearchParams(globalThis.location?.search || '').get(name) || '';
const stream = role === FOLLOWER && readParam(STREAM_PARAM) === '1';
const remoteLeader = role === FOLLOWER ? readParam(REMOTE_PARAM) : '';

// The remote command that carries a remote follower's messages (its place, its transport): the link itself, not an
// order of the person's (remote_command.js announces every order, never this).
export const EXTERNAL_DISPLAY_RELAY_TOOL = 'display.relay';

export const isExternalDisplayStream = () => stream;
export const externalDisplayRemoteLeader = () => remoteLeader;
// A follower in the device's own browser (a connected screen, the stream page) lives on the device's session: it never
// renews it, asks the device's page for its key and syncs under a source of its own. A remote follower is another device,
// signed in on its own: its session stays its own.
export const externalDisplaySharesDeviceSession = () => role === FOLLOWER && !remoteLeader;

export const externalDisplayStreamUrl = (href = globalThis.location?.href) => {
    const url = new URL(externalDisplayFollowerUrl(href));
    url.searchParams.set(STREAM_PARAM, '1');
    return url.toString();
};

export const externalDisplayRemoteUrl = (leaderSurfaceId, href = globalThis.location?.href) => {
    const url = new URL(externalDisplayFollowerUrl(href));
    url.searchParams.set(REMOTE_PARAM, String(leaderSurfaceId));
    return url.toString();
};

// The page a remote follower goes back to: its own address, without the follower's marks.
export const externalDisplayLeaderUrl = (href = globalThis.location?.href) => {
    const url = new URL(href);
    [ROLE_PARAM, STREAM_PARAM, REMOTE_PARAM].forEach(name => url.searchParams.delete(name));
    url.hash = '';
    return url.toString();
};
