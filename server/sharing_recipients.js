/**
 * Sharing recipients & request queries — ADOLE v3.0
 *
 * Read-side of sharing: list/load share requests, recipient visibility checks,
 * and command broadcast. Split out of sharing.js; imports findSharePolicy from
 * it one-way (no back-import → no cycle).
 */

import db from '../database/adole.js';
import { wsSendJsonToUser } from './wsApiState.js';
import { isPublicAccess } from '../atome/shared/recipient_access.js';
import { findSharePolicy } from './sharing.js';

export async function loadShareRequestById(requestAtomeId) {
    if (!requestAtomeId) return null;
    return await db.getAtome(String(requestAtomeId));
}

export async function loadShareRequestsByRequestId(requestId) {
    if (!requestId) return [];
    const raw = String(requestId);
    const jsonValue = JSON.stringify(raw);
    const rows = await db.query('all', `
        SELECT a.atome_id
        FROM atomes a
        JOIN particles p ON a.atome_id = p.atome_id
        WHERE a.atome_type = 'share_request'
          AND p.particle_key = 'request_id'
          AND (p.particle_value = ? OR p.particle_value = ?)
    `, [jsonValue, raw]);

    const out = [];
    for (const row of rows || []) {
        const item = await db.getAtome(row.atome_id);
        if (item) out.push(item);
    }
    return out;
}

export function normalizeParticles(source) {
    if (!source || typeof source !== 'object') return {};
    if (source.properties && typeof source.properties === 'object') return source.properties;
    return source;
}

export async function listShareRequestsForUser(userId, options = {}) {
    if (!userId) return [];
    const box = String(options.box || 'inbox');
    const statusesRaw = Array.isArray(options.statuses || options.status)
        ? (options.statuses || options.status)
        : (options.status ? [options.status] : []);
    const statuses = statusesRaw.length
        ? statusesRaw.map((value) => String(value).toLowerCase()).filter(Boolean)
        : ['pending', 'active'];

    const boxJson = JSON.stringify(box);
    const statusJson = statuses.map((s) => JSON.stringify(s));

    const rows = await db.query('all', `
        SELECT a.atome_id,
               MAX(CASE WHEN p.particle_key = 'timestamp' THEN p.particle_value END) as timestamp
        FROM atomes a
        LEFT JOIN particles p ON a.atome_id = p.atome_id
        WHERE a.atome_type = 'share_request'
          AND a.owner_id = ?
          AND EXISTS (
            SELECT 1 FROM particles pb
            WHERE pb.atome_id = a.atome_id
              AND pb.particle_key = 'box'
              AND (pb.particle_value = ? OR pb.particle_value = ?)
          )
          AND EXISTS (
            SELECT 1 FROM particles ps
            WHERE ps.atome_id = a.atome_id
              AND ps.particle_key = 'status'
              AND (
                ${statuses.map(() => 'ps.particle_value = ? OR ps.particle_value = ?').join(' OR ')}
              )
          )
        GROUP BY a.atome_id
        ORDER BY timestamp DESC
    `, [String(userId), boxJson, box, ...statuses.flatMap((s, idx) => [statusJson[idx], s])]);

    const results = [];
    for (const row of rows || []) {
        const atome = await db.getAtome(row.atome_id);
        if (atome) results.push(atome);
    }
    return results;
}

async function resolveUserAccessInfo(userId) {
    if (!userId) return { access: 'private', visibility: 'private' };
    let access = null;
    let visibility = null;
    try {
        access = await db.getParticle(String(userId), 'access');
    } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    try {
        visibility = await db.getParticle(String(userId), 'visibility');
    } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    return { access: access || '', visibility: visibility || '' };
}

async function hasAcceptedRelationship(targetUserId, sharerId) {
    if (!targetUserId || !sharerId) return false;
    const policyEntry = await findSharePolicy(targetUserId, sharerId);
    const policyValue = String(policyEntry?.particles?.policy || '').toLowerCase();
    if (policyValue === 'block' || policyValue === 'never') return false;
    if (policyValue === 'always') return true;

    const sharerRaw = String(sharerId);
    const sharerJson = JSON.stringify(sharerRaw);
    const statusAccepted = JSON.stringify('accepted');
    const statusActive = JSON.stringify('active');
    const rows = await db.query('all', `
        SELECT a.atome_id
        FROM atomes a
        JOIN particles ps ON a.atome_id = ps.atome_id
        JOIN particles pst ON a.atome_id = pst.atome_id
        WHERE a.atome_type = 'share_request'
          AND a.owner_id = ?
          AND ps.particle_key = 'sharer_id'
          AND (ps.particle_value = ? OR ps.particle_value = ?)
          AND pst.particle_key = 'status'
          AND (pst.particle_value = ? OR pst.particle_value = ? OR pst.particle_value = ? OR pst.particle_value = ?)
        LIMIT 1
    `, [String(targetUserId), sharerJson, sharerRaw, statusAccepted, 'accepted', statusActive, 'active']);
    return Array.isArray(rows) && rows.length > 0;
}

export async function enforceRecipientVisibility({ sharerId, targetUserId, context = 'share' }) {
    const accessInfo = await resolveUserAccessInfo(targetUserId);
    const isPublic = isPublicAccess(accessInfo);
    if (isPublic) {
        return { ok: true, accessInfo, accepted: true };
    }
    const accepted = await hasAcceptedRelationship(targetUserId, sharerId);
    if (!accepted) {
        console.warn('[Share] Recipient rejected (private, no accepted relationship):', {
            context,
            sharerId,
            targetUserId,
            access: accessInfo.access,
            visibility: accessInfo.visibility
        });
        return { ok: false, accessInfo, accepted: false, error: 'Recipient is private' };
    }
    return { ok: true, accessInfo, accepted: true };
}

export async function broadcastShareCommand({ recipients, senderUserId, command, params }) {
    if (!recipients || recipients.length === 0) return;
    const nowIso = new Date().toISOString();
    const payloadText = JSON.stringify({ command, params });

    for (const recipientId of recipients) {
        if (!recipientId) continue;
        const payload = {
            type: 'console-message',
            message: payloadText,
            from: { userId: String(senderUserId), phone: null, username: null },
            to: { userId: String(recipientId), phone: null },
            timestamp: nowIso
        };
        try {
            wsSendJsonToUser(String(recipientId), payload, { scope: 'ws/api', op: command, targetUserId: String(recipientId) });
        } catch (error) {
        console.warn("[cleanup] operation failed", error); }
    }
}

async function listShareRecipients(atomeId) {
    const recipients = new Set();
    const rows = await db.query(
        'all',
        "SELECT DISTINCT principal_id FROM permissions WHERE atome_id = ? AND can_read = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))",
        [atomeId]
    );

    for (const row of rows || []) {
        const principalId = row?.principal_id ? String(row.principal_id) : null;
        if (!principalId) continue;
        const allowed = await db.canRead(atomeId, principalId);
        if (!allowed) continue;
        recipients.add(principalId);
    }

    return Array.from(recipients);
}
