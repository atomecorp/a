// The Rust front's half of a /ws/api connection (atome/servers/atome-server/src/ws_api):
// the front answers the `events` and `state-current` families itself and asks this
// connection, through internal frames carrying the secret it handed Fastify
// (ATOME_FRONT_SECRET), for what still lives here: the device-session check and the
// principal of a message, the post-commit effects, and the connection's identity — its
// claims read, a device session the front issued installed here, a key it saw proven
// recorded, the account's devices told, the sessions it ended disconnected, a pairing's
// requester followed and told, the connection joined to its account,
// a phone link's requester followed and told, the account a file request acts for, and the account the connection
// is (with whether it is provisioned) for the families that act as the connection, a public event's dates read by
// the calendar engine and a coach's agenda read by the coach contract; each attach and detach of a front connection
// is told to the front (`front-live`), which delivers to live connections itself (`front-deliver`, `front-direct`,
// `front-tell` and `front-broadcast` stay answered here until the cutover; the front no longer asks them). A `front-` frame without
// that secret is dropped; a client never reaches this code through the front, which
// drops every `front-` frame it receives.
import crypto from 'node:crypto';
import { readDeviceSessionToken, validateConnectionDeviceSession } from './auth_session_validation.js';
import { isWsApiPrincipalProvisioned, requiredJwtSecret, resolveWsApiPrincipal, resolveWsApiProgramSeat } from './wsApiIdentity.js';
import { attachWsApiClientToUser, detachWsApiClient, enqueuePendingConsoleMessage, wsApiConnections, wsSendJsonToUser,
    wsSendJsonToUserExcept } from './wsApiState.js';
import { requirePrincipal } from './wsAtomeOperations.js';
import { fileRequester } from './wsFileOperations.js';
import { afterFrontCommitted } from './ws_api_commit_effects.js';
import { tellRequester } from './wsAccountAuth.js';
import { announceLinkReady, disconnectSession, installSessionIdentity, notifyAccount } from './wsPhoneLinkAuth.js';
import { wsBroadcastJson, wsSendJson } from './wsSend.js';
import { calendarRangeOccurrences } from './calendar_engine.js';
import { coachFreeSlots, coachingError, coachSessionFits, normalizeCoaching } from '../atome/src/shared/coach_contract.js';

const FRONT_SECRET = Buffer.from(String(process.env.ATOME_FRONT_SECRET || ''));

function fromFront(data) {
    const secret = Buffer.from(String(data.secret || ''));
    return FRONT_SECRET.length > 0 && secret.length === FRONT_SECRET.length && crypto.timingSafeEqual(secret, FRONT_SECRET);
}

// The answer to `front-principal`, in the order the message would meet it here:
// the device session first (its failure detaches the connection), then the principal.
async function principalOf(connection, message) {
    try {
        await validateConnectionDeviceSession(connection, message.token, requiredJwtSecret());
    } catch {
        detachWsApiClient(connection);
        return { session_error: { type: `${String(message.type || 'error')}-response`, requestId: message.requestId || message.request_id,
            success: false, ok: false, error: 'auth_session_invalid' } };
    }
    const auth = await requirePrincipal(connection, message, String(message.type || '').trim());
    return auth.error ? { reply: auth.error } : { principal: auth.userId };
}

// server_services.js's relation effects (communication_relations.js): `notify`, `onAccepted`.
let relationEffects = null;
export function setFrontRelationEffects(effects) {
    relationEffects = effects;
}
const effects = () => {
    if (!relationEffects) throw new Error('relation_effects_missing');
    return relationEffects;
};

// The answer to `front-connection`: the device session, then the account the connection is —
// `current` as `resolveWsApiPrincipal(connection)` reads it (an expired one detached), else as
// attached, or `signed` as its own token names it (`thrown`: why its token cannot be read) — and
// whether that account is provisioned; with `seat`, the program seat its key names
// (`resolveWsApiProgramSeat`, the surface family).
async function connectionOf(connection, message, current, signed, seat) {
    try {
        await validateConnectionDeviceSession(connection, message.token, requiredJwtSecret());
    } catch {
        detachWsApiClient(connection);
        return { session_error: { type: `${String(message.type || 'error')}-response`, requestId: message.requestId || message.request_id,
            success: false, ok: false, error: 'auth_session_invalid' } };
    }
    const attached = connection?._wsApiUserId ? String(connection._wsApiUserId) : null;
    const { principal, unreadable, thrown } = signed ? signedPrincipal(connection, message)
        : { principal: current ? resolveWsApiPrincipal(connection) : attached, unreadable: false };
    const answer = { principal, unreadable, provisioned: principal ? await isWsApiPrincipalProvisioned(principal) : false };
    if (thrown !== undefined) answer.thrown = thrown;
    if (seat) {
        try {
            answer.program = resolveWsApiProgramSeat(connection, message);
        } catch (error) {
            answer.program_error = error instanceof Error ? error.message : String(error);
        }
    }
    return answer;
}
// `signed`: the account the message's own token names, else the connection's (`wsSignedInPrincipal`), none and
// `unreadable` when its token cannot be read.
function signedPrincipal(connection, message) {
    try {
        return { principal: resolveWsApiPrincipal(connection, message), unreadable: false };
    } catch (error) {
        return { principal: null, unreadable: true, thrown: error instanceof Error ? error.message : String(error) };
    }
}

// The answer to `front-file-requester`: the device session, then the file family's requester.
async function fileRequesterOf(connection, message) {
    try {
        await validateConnectionDeviceSession(connection, message.token, requiredJwtSecret());
    } catch {
        detachWsApiClient(connection);
        return { session_error: { type: 'file-response', requestId: message.requestId || message.request_id,
            success: false, ok: false, error: 'auth_session_invalid' } };
    }
    return fileRequester(connection, message, requiredJwtSecret);
}

/** A connection the front opened (its `x-atome-front` header, the secret): its attaches and detaches are told to the
 * front (`front-live`, wsApiState.js). */
export function markFrontConnection(connection, request) {
    const header = String(request?.headers?.['x-atome-front'] || '');
    if (fromFront({ secret: header })) connection._wsApiFrontSecret = header;
}

/** true when `data` was a front frame (answered, or dropped without the secret). */
export async function handleWsApiFrontFrame(data, connection) {
    const type = String(data?.type || '');
    if (!type.startsWith('front-')) return false;
    if (!fromFront(data)) return true;
    const reply = (fields) => wsSendJson(connection, { type: `${type}-response`, front_id: data.front_id, ...fields },
        { scope: 'ws/api', op: 'front' });
    try {
        if (type === 'front-principal') reply(await principalOf(connection, data.message || {}));
        else if (type === 'front-file-requester') reply(await fileRequesterOf(connection, data.message || {}));
        else if (type === 'front-connection') {
            const answer = await connectionOf(connection, data.message || {}, data.current === true, data.signed === true, data.seat === true);
            // `expiry`: the attached account's expiry as the connection holds it (`_wsApiAuthExpMs`, the shell family).
            if (data.expiry === true && !answer.session_error) answer.exp_ms = connection._wsApiAuthExpMs ?? null;
            reply(answer);
        }
        else if (type === 'front-deliver') {
            await effects().notify(data.target, data.sender, data.notification);
            reply({ done: true });
        } else if (type === 'front-direct') {
            // A direct message the front stored: to the recipient's live connections, else their queue.
            const target = String(data.target || '');
            const delivery = wsSendJsonToUser(target, data.payload, { scope: 'ws/api', op: 'direct-message', targetUserId: target });
            reply({ ...delivery, queueSize: delivery.delivered ? 0 : enqueuePendingConsoleMessage(target, data.payload) });
        } else if (type === 'front-tell') {
            // A share's life told to the person's live connections only (syncSharingService `notifyPrincipal`);
            // `except`: to all of them but this one (a seat's presence, wsSurfaceOperations.js).
            const target = String(data.target || '');
            const payload = data.payload || {};
            const meta = { scope: 'ws/api', op: payload.type, targetUserId: target };
            reply(data.except === true ? wsSendJsonToUserExcept(target, payload, connection, meta) : wsSendJsonToUser(target, payload, meta));
        } else if (type === 'front-committed') {
            await afterFrontCommitted(connection, String(data.principal || ''), Array.isArray(data.events) ? data.events : []);
            reply({ done: true });
        } else if (type === 'front-calendar') {
            // A public event the front projects, read by the calendar engine shared with the browser: whether its start
            // is a date, and its occurrences in the range (atome-server src/social/public_events/).
            const event = data.event || {};
            const valid = !!event.start && Number.isFinite(new Date(event.start).getTime());
            try {
                const occurrences = calendarRangeOccurrences([event], { start: new Date(data.start), end: new Date(data.end) }, Number(data.limit))
                    .map(occurrence => ({ start: occurrence.start.toISOString(), end: (occurrence.end || occurrence.start).toISOString() }));
                reply({ valid, occurrences });
            } catch (error) {
                reply({ valid, thrown: error instanceof Error ? error.message : String(error) });
            }
        } else if (type === 'front-coach') {
            // A coach's agenda read by the coach contract shared with the browser (atome-server src/social/coaches/):
            // its coaching as it stands, what keeps it busy (its own events through the calendar engine), its free
            // slots, whether a requested session fits.
            const coaching = data.coaching;
            if (data.op === 'coaching') {
                const normalized = normalizeCoaching(coaching);
                reply({ coaching: normalized, refusal: coachingError(normalized) });
            } else if (data.op === 'busy') {
                const busy = calendarRangeOccurrences(data.events || [], { start: new Date(data.from), end: new Date(data.until) }, 2000)
                    .map(occurrence => ({ start: new Date(occurrence.start).getTime(), end: new Date(occurrence.end || occurrence.start).getTime() }));
                reply({ busy });
            } else if (data.op === 'slots') reply({ slots: coachFreeSlots({ coaching, busy: data.busy, now: data.now }) });
            else if (data.op === 'fits') reply({ fits: coachSessionFits({ coaching, busy: data.busy, start: data.start, minutes: data.minutes, now: data.now }) });
            else throw new Error('front_coach_op_invalid');
        } else if (type === 'front-broadcast') {
            // A change every open screen hears (`public-events-changed`).
            const payload = data.payload || {};
            wsBroadcastJson(wsApiConnections, payload, { scope: 'ws/api', op: payload.type });
            reply({ done: true });
        } else if (type === 'front-claims') {
            // `claimsOf` of server/wsAccountAuth.js.
            const claims = await validateConnectionDeviceSession(connection, data.token, requiredJwtSecret()) || connection._wsApiDeviceClaims;
            if (!claims || claims.auth_version !== 1) throw new Error('auth_session_invalid');
            reply({ claims });
        } else if (type === 'front-proof') {
            // `connection-proof` of server/wsAccountAuth.js, once the front consumed the proof.
            const claims = await readDeviceSessionToken(data.token, requiredJwtSecret());
            connection._wsApiProvenKeyId = claims.cnf.kid;
            await validateConnectionDeviceSession(connection, data.token, requiredJwtSecret());
            reply({ done: true });
        } else if (type === 'front-identity') {
            await installSessionIdentity(connection, String(data.token || ''), requiredJwtSecret());
            reply({ done: true });
        } else if (type === 'front-notify') {
            await notifyAccount(String(data.principal || ''), data.notice || {}, data.options || {});
            reply({ done: true });
        } else if (type === 'front-disconnect') {
            let own = false;
            for (const sessionId of Array.isArray(data.sessions) ? data.sessions : []) {
                if (await disconnectSession(String(sessionId), connection)) own = true;
            }
            reply({ done: true, own });
        } else if (type === 'front-pair') {
            // The pairing request this connection waits on (`_authPairRequestId` of server/wsAccountAuth.js).
            if (data.pairId) connection._authPairRequestId = String(data.pairId);
            else delete connection._authPairRequestId;
            reply({ done: true });
        } else if (type === 'front-pair-update') {
            tellRequester(String(data.pairId || ''), String(data.state || ''));
            reply({ done: true });
        } else if (type === 'front-attach') {
            // `me`: the connection joins its account's live set.
            attachWsApiClientToUser(connection, String(data.principal || ''));
            reply({ done: true });
        } else if (type === 'front-link-attempt') {
            // `phone-link-resume`: this connection waits on the attempt (`_authLinkAttemptId`).
            connection._authLinkAttemptId = data.attemptId;
            reply({ done: true });
        } else if (type === 'front-link-ready') {
            announceLinkReady(data.attemptId);
            reply({ done: true });
        } else reply({ error: `front_frame_unknown:${type}` });
    } catch (error) {
        reply({ error: error instanceof Error ? error.message : String(error) });
    }
    return true;
}
