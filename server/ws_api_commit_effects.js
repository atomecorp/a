// What follows every commit received on /ws/api, whatever its path (commit, commit-batch, offline
// sync, history): one owner, so no path forgets one of them.
// - the committed events reach the devices that follow their stream (/ws/sync);
// - the author's public card is projected again when their own user Atome changed (directory);
// - a calendar event made public, or already public, is projected again (server/public_events.js);
// - a lit « Visib. » of an objective, or the network switch, is projected again (server/objective_network.js);
// - a shop sale made public, or already public, is projected again (server/shop_listings.js);
// - a coaching agenda made public, or already listed, is projected again (server/coach_directory.js).
export async function afterCommitted(connection, userId, events = []) {
    const inserted = (events || []).filter(Boolean);
    if (!inserted.length) return;
    await streamAndDirectory(connection, userId, inserted);
    await connection?._wsApiPublicEvents?.afterCommit(inserted);
    await connection?._wsApiObjectiveNetwork?.afterCommit(inserted);
    await connection?._wsApiShop?.listings.afterCommit(inserted);
    await connection?._wsApiCoaches?.directory.afterCommit(inserted);
}

// The part still Fastify's after a commit the Rust front made (`front-committed`, server/ws_api_front.js);
// the front projects public events, the objectives network, the shop and the coaches itself (atome-server src/social/).
export async function afterFrontCommitted(connection, userId, events = []) {
    const inserted = (events || []).filter(Boolean);
    if (!inserted.length) return;
    await streamAndDirectory(connection, userId, inserted);
}

async function streamAndDirectory(connection, userId, inserted) {
    for (const event of inserted) await connection?._wsApiSyncRuntime?.publish(event);
    if (inserted.some(event => String(event?.atome_id || '') === String(userId))) {
        await connection?._wsApiDirectoryService?.refreshPrincipal(userId);
    }
}
