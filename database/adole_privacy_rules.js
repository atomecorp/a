// Property privacy rules — the output side of Conditions (§12.5).
//
// "Partager ma photo uniquement avec mes contacts" is a rule about *my* data that
// applies to whoever reads it. `permissions` cannot say that: every row names one
// reader. So a rule lives in its own table and is consulted as an **additional
// constraint** on top of the permission that already exists.
//
// The one invariant that makes this safe: a rule is RESTRICTIVE ONLY. It is evaluated
// after a permission has already said yes, and it can only turn that into a no. It can
// never grant. A privacy feature that could widen access would be a privilege
// escalation wearing a friendly name.

import crypto from 'crypto';
import {
    evaluatePermissionConditions,
    normalizePermissionConditions
} from '../atome/src/squirrel/conditions/permission_adapter.js';

export function createAdolePrivacyRuleApi({ query, getAtome, getEffectiveOwnerId }) {
    /** Create or replace the rule guarding one property. Only the owner may do this:
     *  a privacy rule on someone else's data would be a way to hide their own data
     *  from them. */
    async function setPropertyPrivacyRule(atomeId, particleKey, conditions, actorId) {
        const atome = String(atomeId || '').trim();
        const key = String(particleKey || '').trim();
        const actor = String(actorId || '').trim();
        if (!atome || !key || !actor) return { ok: false, error: 'privacy_rule_target_invalid' };

        const ownerId = await getEffectiveOwnerId(atome);
        if (!ownerId || String(ownerId) !== actor) return { ok: false, error: 'privacy_rule_not_owner' };

        // Clearing is the absence of a rule, never a denial: removing a rule must
        // restore the ordinary permission, not lock the property.
        if (conditions === null || conditions === undefined) {
            await query(
                'run',
                'DELETE FROM property_privacy_rules WHERE atome_id = ? AND particle_key = ?',
                [atome, key]
            );
            return { ok: true, cleared: true };
        }

        let normalized;
        try {
            normalized = normalizePermissionConditions(conditions);
        } catch (error) {
            return { ok: false, error: 'privacy_rule_conditions_invalid' };
        }
        if (!normalized) return { ok: false, error: 'privacy_rule_conditions_invalid' };

        const existing = await query(
            'get',
            'SELECT rule_id FROM property_privacy_rules WHERE atome_id = ? AND particle_key = ?',
            [atome, key]
        );
        const serialized = JSON.stringify(normalized);

        if (existing?.rule_id) {
            await query(
                'run',
                "UPDATE property_privacy_rules SET conditions = ?, updated_at = datetime('now') WHERE rule_id = ?",
                [serialized, existing.rule_id]
            );
            return { ok: true, rule_id: existing.rule_id, updated: true };
        }

        const ruleId = crypto.randomUUID();
        await query(
            'run',
            `INSERT INTO property_privacy_rules (rule_id, atome_id, particle_key, owner_id, conditions)
             VALUES (?, ?, ?, ?, ?)`,
            [ruleId, atome, key, String(ownerId), serialized]
        );
        return { ok: true, rule_id: ruleId, created: true };
    }

    async function listPropertyPrivacyRules(atomeId, actorId) {
        const atome = String(atomeId || '').trim();
        const ownerId = await getEffectiveOwnerId(atome);
        // The rules themselves are private: knowing what someone protects is already
        // information about them.
        if (!ownerId || String(ownerId) !== String(actorId || '')) {
            return { ok: false, error: 'privacy_rule_not_owner', rules: [] };
        }
        const rows = await query(
            'all',
            'SELECT rule_id, particle_key, conditions, updated_at FROM property_privacy_rules WHERE atome_id = ?',
            [atome]
        ) || [];
        return {
            ok: true,
            rules: rows.map((row) => {
                let conditions = null;
                try { conditions = JSON.parse(row.conditions); } catch { conditions = null; }
                return {
                    rule_id: row.rule_id,
                    particle_key: row.particle_key,
                    conditions,
                    updated_at: row.updated_at
                };
            })
        };
    }

    /** The gate. Returns true when the read may proceed.
     *
     *  Called only after a permission already allowed it, so returning true means
     *  "no rule objects", not "access granted". */
    async function allowsPropertyRead(atomeId, particleKey, principalId, operationName = 'read') {
        const atome = String(atomeId || '').trim();
        const key = String(particleKey || '').trim();
        if (!atome || !key) return true;

        const row = await query(
            'get',
            'SELECT conditions FROM property_privacy_rules WHERE atome_id = ? AND particle_key = ?',
            [atome, key]
        );
        // No rule means no opinion. This is what keeps the feature additive: every
        // property without a rule behaves exactly as before.
        if (!row?.conditions) return true;

        const ownerId = await getEffectiveOwnerId(atome);
        // A rule never hides data from its own owner.
        if (ownerId && String(ownerId) === String(principalId || '')) return true;

        let conditions;
        try {
            conditions = JSON.parse(row.conditions);
        } catch {
            // An unreadable rule fails closed: a corrupted privacy rule must not
            // silently expose the property it was written to protect.
            return false;
        }

        const [readerAtome, targetAtome] = await Promise.all([
            principalId ? getAtome(principalId) : null,
            atome ? getAtome(atome) : null
        ]);

        const decision = await evaluatePermissionConditions(conditions, {
            time: { now: new Date().toISOString() },
            user: readerAtome ? (readerAtome.properties || {}) : {},
            atome: targetAtome ? (targetAtome.properties || {}) : {},
            actor: { id: principalId },
            operation: { name: operationName, property: key },
            property: { key }
        });
        // `unknown` is not `true`: §21 asks that missing data never be read as a match
        // when it decides who sees private data.
        return decision.matched === true;
    }

    return { setPropertyPrivacyRule, listPropertyPrivacyRules, allowsPropertyRead };
}
