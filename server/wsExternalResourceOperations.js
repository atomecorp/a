// Canonical early provider dispatch, after device-session validation in /ws/api.
import { handleWsPersonalImport } from './ws_personal_import.js';
import { handleWsYoutubeSearch } from './ws_youtube_search.js';
import { handleWsTvCatalog, handleWsTvResolve } from './ws_tv_catalog.js';
import { handleWsGpsOperation } from './wsGpsOperations.js';

export async function handleWsExternalResourceOperation(data, connection, address) {
    return await handleWsPersonalImport(data, connection)
        || await handleWsYoutubeSearch(data, address)
        || await handleWsTvCatalog(data)
        || await handleWsTvResolve(data)
        || await handleWsGpsOperation(data, address);
}
