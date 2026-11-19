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
