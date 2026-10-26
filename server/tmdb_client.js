import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalShowsConfig } from './auth_secret_config.js';

// The server's one TMDB client (The Movie Database): the films showing of the
// Spectacles rubric (ws_shows.js) and the films and series of Divertissement ›
// Vidéo (ws_video_catalog.js). One Atome key for every user (`TMDB_API_KEY`: the
// server's environment, in development also `Private/tmdb.env`), never on a device.

const TMDB = 'https://api.themoviedb.org/3';
const TMDB_IMAGES = 'https://image.tmdb.org/t/p';
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localConfigRead = new WeakSet();

const text = value => String(value == null ? '' : value).trim();

// The key of `env`, its development file read once.
export const tmdbKey = (env = process.env) => {
    if (!localConfigRead.has(env)) { loadLocalShowsConfig(PROJECT_ROOT, env); localConfigRead.add(env); }
    return text(env.TMDB_API_KEY);
};

// An image of TMDB at `size` (`w92` a logo, `w342` a poster); '' without a file.
export const tmdbImage = (size, file) => (text(file) ? `${TMDB_IMAGES}/${size}${text(file)}` : '');

// `route` (`movie/now_playing`, `discover/tv`…) read with `params`; a TMDB refusal throws its status.
export const readTmdb = async ({ fetchResource = fetch, key }, route, params = {}) => {
    const url = `${TMDB}/${route}?${new URLSearchParams({ api_key: key, ...params })}`;
    const response = await fetchResource(url, { signal: AbortSignal.timeout(8000), redirect: 'error', headers: { accept: 'application/json' } });
    if (!response.ok) throw Object.assign(new Error(`status_${response.status}`), { status: response.status });
    return response.json();
};
