// ============================================================================
// ADOLE EVENT CONTAINMENT — the project an event belongs to
// ============================================================================
// An event's project is a fact of the atome's containment, never of the project
// the writing client has open. The client stamps every commit with its current
// project; that stamp only places a NEW atome that has no known container.
// The resolved project drives the event's sync stream and `state_current.project_id`.

import { query } from './adole_db_core.js';
import { resolveEventType } from './adole_state_projection.js';

export async function isProjectAtome(atomeId) {
    const row = await query('get', 'SELECT atome_type FROM atomes WHERE atome_id = ?', [atomeId]);
    return String(row?.atome_type || '').toLowerCase() === 'project';
}

// Nearest project in the atome's parent chain (the atome itself included); an atome with
// no project ancestor keeps the project it was created in. `undefined`: unknown atome.
async function projectOfAtome(atomeId) {
    const visited = new Set();
    let id = atomeId;
    while (id && !visited.has(id)) {
        visited.add(id);
        const row = await query('get', 'SELECT atome_type, parent_id FROM atomes WHERE atome_id = ?', [id]);
        if (!row) break;
        if (String(row.atome_type || '').toLowerCase() === 'project') return id;
        id = row.parent_id;
    }
    const state = await query('get', 'SELECT project_id FROM state_current WHERE atome_id = ?', [atomeId]);
    return state ? (state.project_id || null) : undefined;
}

export async function resolveEventProjectId(event) {
    const atomeId = event.atome_id;
    if (!atomeId) return event.project_id;
    const props = event.payload?.props;
    const declaredType = String(resolveEventType(props) || '').toLowerCase();
    if (declaredType === 'project' || await isProjectAtome(atomeId)) return atomeId;
    if (event.payload?.scope === 'global') return null;
    // A declared parent places the atome (creation or reparent); otherwise it stays where it is.
    const parentId = event.parent_id || props?.parent_id || props?.parentId || null;
    for (const anchor of [parentId, atomeId]) {
        if (!anchor) continue;
        const project = await projectOfAtome(anchor);
        if (project !== undefined) return project;
    }
    return event.project_id;
}
