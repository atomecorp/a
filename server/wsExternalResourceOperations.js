// Canonical early provider dispatch, after device-session validation in /ws/api.
import { handleWsPersonalImport } from './ws_personal_import.js';
import { handleWsYoutubeSearch } from './ws_youtube_search.js';
import { handleWsPeertube } from './ws_peertube.js';
import { handleWsTvCatalog, handleWsTvResolve } from './ws_tv_catalog.js';
import { handleWsShows } from './ws_shows.js';
import { handleWsShop } from './ws_shop.js';
import { handleWsCoaches } from './ws_coaches.js';
import { handleWsVideoCatalog } from './ws_video_catalog.js';
import { handleWsGpsOperation } from './wsGpsOperations.js';
import { handleWsOpenFoodFacts } from './ws_open_food_facts.js';
import { handleWsBookSource } from './ws_book_sources.js';
import { handleWsMediaLibrary } from './ws_media_library.js';
import { handleWsBugReport } from './ws_bug_reports.js';

export async function handleWsExternalResourceOperation(data, connection, address) {
    return await handleWsPersonalImport(data, connection)
        || await handleWsYoutubeSearch(data, address)
        || await handleWsPeertube(data, address)
        || await handleWsTvCatalog(data)
        || await handleWsTvResolve(data)
        || await handleWsShows(data, address, { publicEvents: connection?._wsApiPublicEvents, viewerId: connection?._wsApiUserId || null })
        || await handleWsShop(data, connection)
        || await handleWsCoaches(data, connection)
        || await handleWsVideoCatalog(data, address)
        || await handleWsGpsOperation(data, address)
        || await handleWsOpenFoodFacts(data, address)
        || await handleWsBookSource(data, address)
        // An account is its own client (a proxied server sees every address alike).
        || await handleWsMediaLibrary(data, connection?._wsApiUserId ? `user:${connection._wsApiUserId}` : address)
        || await handleWsBugReport(data, connection, address);
}
