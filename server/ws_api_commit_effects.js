// What follows every commit received on /ws/api, whatever its path (commit, commit-batch, offline
// sync, history): one owner, so no path forgets one of them.
// - the committed events reach the devices that follow their stream (/ws/sync);
// - the author's public card is projected again when their own user Atome changed (directory);
// - a calendar event made public, or already public, is projected again (server/public_events.js).
export async function afterCommitted(connection, userId, events = []) {
    const inserted = (events || []).filter(Boolean);
    if (!inserted.length) return;
    for (const event of inserted) await connection?._wsApiSyncRuntime?.publish(event);
    if (inserted.some(event => String(event?.atome_id || '') === String(userId))) {
        await connection?._wsApiDirectoryService?.refreshPrincipal(userId);
    }
    await connection?._wsApiPublicEvents?.afterCommit(inserted);
}
