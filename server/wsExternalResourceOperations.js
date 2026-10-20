// Canonical early provider dispatch, after device-session validation in /ws/api.
import { handleWsPersonalImport } from './ws_personal_import.js';
import { handleWsYoutubeSearch } from './ws_youtube_search.js';
import { handleWsPeertube } from './ws_peertube.js';
import { handleWsTvCatalog, handleWsTvResolve } from './ws_tv_catalog.js';
import { handleWsGpsOperation } from './wsGpsOperations.js';
import { handleWsOpenFoodFacts } from './ws_open_food_facts.js';
import { handleWsBookSource } from './ws_book_sources.js';
import { handleWsMediaLibrary } from './ws_media_library.js';

export async function handleWsExternalResourceOperation(data, connection, address) {
    return await handleWsPersonalImport(data, connection)
        || await handleWsYoutubeSearch(data, address)
        || await handleWsPeertube(data, address)
        || await handleWsTvCatalog(data)
        || await handleWsTvResolve(data)
        || await handleWsGpsOperation(data, address)
        || await handleWsOpenFoodFacts(data, address)
        || await handleWsBookSource(data, address)
        || await handleWsMediaLibrary(data, address);
}
