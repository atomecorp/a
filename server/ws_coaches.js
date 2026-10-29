// The coaches' /ws/api frames (user validation of 28 Oct. 2026). `coaches-public` is searching, open to everyone, visitor
// and guest included (`browse`, `one`, `slots`). `coaches` needs an account: asking for a session, a coach's answer, a
// cancellation, one's own bookings. The services are server/coach_directory.js and server/coach_bookings.js.
import { isWsApiPrincipalProvisioned } from './wsApiIdentity.js';
import { wsResponse } from './wsResponse.js';

const PUBLIC = Object.freeze({
    browse: (coaches, data, viewerId) => coaches.directory.browse({ query: data.query, offset: data.offset, viewerId }),
    one: (coaches, data, viewerId) => coaches.directory.one({ coachId: data.coachId, viewerId }),
    slots: (coaches, data, viewerId) => coaches.directory.slots({ coachId: data.coachId, viewerId })
});
const ACCOUNT = Object.freeze({
    request: (coaches, data, userId) => coaches.bookings.request(userId, data.booking || {}),
    answer: (coaches, data, userId) => coaches.bookings.answer(userId, { bookingId: data.bookingId, accept: data.accept === true, title: data.title }),
    cancel: (coaches, data, userId) => coaches.bookings.cancel(userId, { bookingId: data.bookingId }),
    bookings: (coaches, data, userId) => coaches.bookings.list(userId, { side: data.side })
});

export async function handleWsCoaches(data, connection) {
    if (data?.type !== 'coaches' && data?.type !== 'coaches-public') return null;
    const coaches = connection?._wsApiCoaches;
    if (!coaches) return wsResponse(data.type, data, false, { error: 'coaches_unavailable' });
    const action = String(data.action || ''), userId = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
    if (data.type === 'coaches-public') {
        if (!Object.hasOwn(PUBLIC, action)) return wsResponse('coaches-public', data, false, { error: 'coach_action_invalid' });
        const result = await PUBLIC[action](coaches, data, userId);
        return wsResponse('coaches-public', data, result.ok !== false, result);
    }
    if (!Object.hasOwn(ACCOUNT, action)) return wsResponse('coaches', data, false, { error: 'coach_action_invalid' });
    if (!userId || !await isWsApiPrincipalProvisioned(userId)) return wsResponse('coaches', data, false, { error: 'coach_auth_required' });
    const result = await ACCOUNT[action](coaches, data, userId);
    return wsResponse('coaches', data, result.ok !== false, result);
}
