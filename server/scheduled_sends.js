// Scheduled sends (user decisions of 28 Oct. 2026, todo: publication programmée): what an owner asked to
// leave at a time — a publication to the eVe feed, messages to people, a share to the social networks,
// or the update of one already sent. The server holds it and its clock sends it through the very paths a
// live send takes (News broadcast, direct messages, social publish), so a sleeping device never holds it
// back. Until its time the owner replaces it at will (Q2: what leaves is the content at its time).
// Late (the owner's device reached the server after the time) it leaves at once and the owner is told
// (Q3); a channel refusing (a network's session expired) is told too, the touch reopening it in the Agenda.
import { createScheduledSendStore } from './scheduled_sends_store.js';

const TICK_MS = Number(process.env.SCHEDULED_SENDS_TICK_MS) || 30_000;
const LATE_MS = 2 * 60_000;
const MAX_PAYLOAD_CHARS = 1_000_000;
const KINDS = new Set(['send', 'update']);
const text = value => String(value ?? '').trim();
const parse = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const iso = value => { const date = new Date(text(value)); return Number.isNaN(date.getTime()) ? '' : date.toISOString(); };

const publicRow = row => row && ({
    send_id: row.send_id, kind: row.kind, parent_id: row.parent_id || null, title: row.title, due_at: row.due_at, state: row.state,
    payload: parse(row.payload_json, {}), result: parse(row.result_json, null), done_at: row.done_at || null, updated_at: row.updated_at
});

// What a send carries: at least one channel, each in the shape its live path takes.
const validPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return 'scheduled_payload_required';
    const { news, forums, messages, social } = payload;
    if (!news && !(Array.isArray(forums) && forums.length) && !(Array.isArray(messages) && messages.length) && !social) return 'scheduled_channel_required';
    if (news && (typeof news.publication !== 'object' || !news.publication)) return 'scheduled_news_publication_required';
    // A forum's post: a News whose audience is the forum, named for the owner (`name`).
    if (forums && (!Array.isArray(forums) || forums.some(entry => !entry || typeof entry.publication !== 'object' || !entry.publication
        || typeof entry.audience?.forum !== 'string'))) return 'scheduled_forum_invalid';
    if (messages && (!Array.isArray(messages) || messages.some(entry => !entry || typeof entry.message !== 'string' || !(entry.toUserId || entry.toPhone)))) return 'scheduled_message_invalid';
    // The networks: what to prepare at the time (a send), or the new text of the posts its parent published (an update).
    if (social && (!Array.isArray(social.destinations) || !social.destinations.length || social.destinations.length > 8
        || !(social.content && typeof social.content === 'object') && typeof social.text !== 'string')) return 'scheduled_social_invalid';
    if (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) return 'scheduled_payload_too_large';
    return '';
};

// `newsPublish(ownerId, {publication, tags, audience})`, `sendMessage(ownerId, entry)`, `socialPublish(ownerId, social)`,
// `socialUpdate(ownerId, social, parentDeliveries)`:
// the live paths. `notify(ownerId, notification)`: the owner's Communication stack and push. `tell(ownerId, frame)`:
// the owner's open devices (the Agenda follows the send's state).
export function createScheduledSends({ query, newsPublish, sendMessage, socialPublish, socialUpdate, notify, tell, now = () => Date.now(), tickMs = TICK_MS }) {
    const store = createScheduledSendStore({ query });
    let timer = null;

    const save = async (ownerId, message = {}) => {
        const sendId = text(message.send_id), kind = text(message.kind) || 'send', due = iso(message.due_at);
        if (!sendId || sendId.length > 200) throw new Error('scheduled_send_id_required');
        if (!KINDS.has(kind)) throw new Error('scheduled_kind_invalid');
        if (!due) throw new Error('scheduled_due_invalid');
        const error = validPayload(message.payload);
        if (error) throw new Error(error);
        const existing = await store.get(sendId);
        if (existing && existing.owner_id !== ownerId) throw new Error('scheduled_send_not_owned');
        if (existing && existing.state !== 'pending') throw new Error('scheduled_send_already_done');
        const parentId = text(message.parent_id) || null;
        if (kind === 'update') {
            const parent = parentId ? await store.get(parentId) : null;
            if (!parent || parent.owner_id !== ownerId) throw new Error('scheduled_update_parent_required');
        }
        await store.put({ sendId, ownerId, kind, parentId, title: text(message.title).slice(0, 200), dueAt: due, payload: message.payload });
        arm();
        return { ok: true, send: publicRow(await store.get(sendId)) };
    };

    const owned = async (ownerId, sendId) => {
        const row = await store.get(text(sendId));
        if (!row || row.owner_id !== ownerId) throw new Error('scheduled_send_not_found');
        return row;
    };

    const cancel = async (ownerId, message = {}) => {
        const row = await owned(ownerId, message.send_id);
        if (row.state !== 'pending') throw new Error('scheduled_send_already_done');
        await store.finish(row.send_id, 'pending', 'cancelled', null);
        // Its planned updates go with it.
        for (const child of await store.children(row.send_id)) if (child.state === 'pending') await store.finish(child.send_id, 'pending', 'cancelled', null);
        return { ok: true, send: publicRow(await store.get(row.send_id)) };
    };

    // Each channel through its live path; one failing never stops the others.
    const run = async (row) => {
        const payload = parse(row.payload_json, {});
        const result = { news: null, forums: [], messages: [], social: null };
        if (payload.news) {
            try { const published = await newsPublish(row.owner_id, payload.news); result.news = { ok: true, news_id: published?.news_id || null }; }
            catch (error) { result.news = { ok: false, error: error.message }; }
        }
        for (const { name, ...entry } of payload.forums || []) {
            try { const published = await newsPublish(row.owner_id, entry); result.forums.push({ to: text(name), ok: true, news_id: published?.news_id || null }); }
            catch (error) { result.forums.push({ to: text(name), ok: false, error: error.message }); }
        }
        for (const entry of payload.messages || []) {
            const to = text(entry.toUserId || entry.toPhone);
            try { result.messages.push({ to, ok: true, ...(await sendMessage(row.owner_id, entry)) }); }
            catch (error) { result.messages.push({ to, ok: false, error: error.message }); }
        }
        if (payload.social) {
            // An update reaches the posts its parent published, in place (Q4).
            const parentDeliveries = async () => parse((await store.get(row.parent_id))?.result_json, null)?.social?.deliveries || [];
            try { result.social = { ok: true, deliveries: row.kind === 'update' ? await socialUpdate(row.owner_id, payload.social, await parentDeliveries())
                : await socialPublish(row.owner_id, payload.social) }; }
            catch (error) { result.social = { ok: false, error: error.message, deliveries: [] }; }
        }
        return result;
    };
    // The networks count one by one (their channel itself only when it failed as a whole).
    const outcomes = result => [result.news, ...(result.forums || []), ...result.messages, ...(result.social?.ok === false ? [result.social] : []), ...(result.social?.deliveries || [])
        .map(delivery => ({ ok: !delivery.error && delivery.status !== 'failed', error: delivery.error, network: delivery.network }))].filter(Boolean);
    // The networks or people a send could not reach, named for the owner.
    const refused = result => [
        ...(result.news?.ok === false ? ['eVe'] : []),
        ...(result.forums || []).filter(entry => !entry.ok).map(entry => entry.to),
        ...result.messages.filter(entry => !entry.ok).map(entry => entry.to),
        ...(result.social?.ok === false ? ['social'] : []),
        ...(result.social?.deliveries || []).filter(delivery => delivery.error || delivery.status === 'failed').map(delivery => delivery.network || delivery.destination)
    ];

    const fire = async (row) => {
        // Taken once, whatever the number of clocks or a send-now racing the clock.
        if (!await store.take(row.send_id)) return null;
        const result = await run(row);
        const all = outcomes(result), failed = all.filter(entry => entry.ok === false).length;
        const state = !failed ? 'sent' : failed === all.length ? 'failed' : 'partial';
        const lateMs = Math.max(0, now() - new Date(row.due_at).getTime());
        await store.finish(row.send_id, 'sending', state, { ...result, late_ms: lateMs, refused: refused(result) });
        const send = publicRow(await store.get(row.send_id));
        tell(row.owner_id, { type: 'scheduled-send-changed', send });
        if (state !== 'sent' || lateMs > LATE_MS) {
            await notify(row.owner_id, { kind: 'system', id: `scheduled_${row.send_id}_${state}`, subject: row.title || null,
                message: '', extra: { scheduled_send: { send_id: row.send_id, kind: row.kind, state, late_ms: lateMs, refused: send.result.refused,
                    event_id: text(send.payload.event_id) || null },
                    // Touched, the send's event opens in the Agenda (to reconnect a network, send again).
                    ...(text(send.payload.event_id) ? { action: { kind: 'command', toolId: 'ui.panel.open',
                        input: { surface: 'calendar', mode: 'open', eventId: text(send.payload.event_id), project_id: '' } } } : {}) } }).catch(error => console.warn('[scheduled-sends] notify failed', error?.message || error));
        }
        return send;
    };

    const tick = async () => {
        for (const row of await store.due(new Date(now()).toISOString())) {
            await fire(row).catch(error => console.error('[scheduled-sends] send failed', row.send_id, error));
        }
        arm();
    };
    // The next due time wakes the clock, bounded by the tick so a restart, a moved clock or a table not yet
    // migrated at boot is caught on the next round.
    function arm() {
        clearTimeout(timer);
        const wake = (wait) => {
            clearTimeout(timer);
            timer = setTimeout(() => { tick().catch((error) => { console.error('[scheduled-sends] clock failed', error); wake(tickMs); }); }, wait);
            timer.unref?.();
        };
        store.next().then(row => wake(row ? Math.max(0, Math.min(tickMs, new Date(row.due_at).getTime() - now())) : tickMs), () => wake(tickMs));
    }

    const sendNow = async (ownerId, message = {}) => {
        const row = await owned(ownerId, message.send_id);
        if (row.state !== 'pending') throw new Error('scheduled_send_already_done');
        return { ok: true, send: await fire(row) };
    };

    const handle = async (message = {}, ownerId) => {
        const action = text(message.action);
        if (action === 'save') return save(ownerId, message);
        if (action === 'cancel') return cancel(ownerId, message);
        if (action === 'send-now') return sendNow(ownerId, message);
        if (action === 'read') return { ok: true, send: publicRow(await owned(ownerId, message.send_id)) };
        if (action === 'list') return { ok: true, sends: (await store.ofOwner(ownerId, iso(message.since) || null)).map(publicRow) };
        throw new Error(`scheduled_action_unsupported:${action || 'missing'}`);
    };

    arm();
    return { handle, tick, stop: () => clearTimeout(timer) };
}
