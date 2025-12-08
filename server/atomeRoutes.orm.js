/**
 * Atome API Routes (ORM Version)
 * 
 * Server-side routes for Atome CRUD operations.
 * Uses the unified ORM layer for database operations.
 * Requires authentication for all operations.
 * Broadcasts changes via WebSocket for real-time sync.
 */

import { v4 as uuidv4 } from 'uuid';
import { broadcastMessage } from './githubSync.js';
import orm from '../database/orm.js';

/**
 * Safely parse a JSON value, returning raw value if parsing fails
 * This handles cases where values are stored as raw strings vs JSON
 */
function safeParseJSON(value) {
    if (value === null || value === undefined) {
        return null;
    }
    try {
        return JSON.parse(value);
    } catch {
        // If it's not valid JSON, return as-is (it's a raw string value)
        return value;
    }
}

/**
 * Validate authentication token
 */
async function validateToken(request) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);

    // Decode JWT token
    try {
        const [, payload] = token.split('.');
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        console.log('[Atome] Token decoded:', JSON.stringify(decoded));

        // Normalize the user object - JWT uses 'sub' for user id
        return {
            id: decoded.sub || decoded.id || decoded.userId,
            userId: decoded.sub || decoded.id || decoded.userId,
            username: decoded.username,
            phone: decoded.phone
        };
    } catch (e) {
        console.error('[Atome] Token decode error:', e.message);
        return null;
    }
}

/**
 * Ensure user has a tenant and principal in the ORM
 * Creates them if they don't exist
 */
async function ensureUserInORM(user) {
    const phone = user.phone || user.id || user.userId;
    const userId = user.id || user.userId;

    // Get or create tenant for this user
    const tenant = await orm.getOrCreateTenant(phone);

    // Check if principal exists by phone first
    let principal = await orm.findPrincipalByPhone(phone);

    if (!principal) {
        // Also check by principal_id (in case phone wasn't set)
        principal = await orm.findPrincipalById(userId);
    }

    if (!principal) {
        // Create principal with try/catch for race conditions
        try {
            await orm.createPrincipal({
                principal_id: userId,
                tenant_id: tenant.tenant_id,
                kind: 'user',
                phone: phone,
                username: user.username
            });
            principal = await orm.findPrincipalById(userId);
        } catch (error) {
            // If duplicate key, try to find existing
            if (error.message.includes('duplicate key')) {
                principal = await orm.findPrincipalById(userId);
                if (!principal) {
                    principal = await orm.findPrincipalByPhone(phone);
                }
            }
            if (!principal) {
                throw error;
            }
        }
    }

    // Update phone if missing
    if (principal && !principal.phone && phone) {
        try {
            const db = orm.getDatabase();
            await db('principals')
                .where('principal_id', principal.principal_id)
                .update({ phone: phone });
        } catch (e) {
            console.warn('[Atome] Could not update phone:', e.message);
        }
    }

    return {
        tenant_id: tenant.tenant_id,
        principal_id: principal.principal_id
    };
}

/**
 * Register Atome API routes
 */
export function registerAtomeRoutes(server, dataSource) {
    // Initialize ORM (non-blocking, will complete before first request)
    orm.initDatabase().catch(err => {
        console.error('[Atome] ORM initialization error:', err.message);
    });

    // =========================================================================
    // CREATE - POST /api/atome/create
    // =========================================================================
    server.post('/api/atome/create', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            // Ensure ORM is initialized
            await orm.initDatabase();

            // Ensure user exists in ORM
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id, kind, tag, parent, properties, data, project_id } = request.body;

            // Also check for ID in data object (sent by UnifiedAtome)
            const providedId = id || data?.id;

            console.log(`[Atome] CREATE request - id: ${providedId}, kind: ${kind}, user: ${principal_id}`);

            // Support both 'properties' and 'data' field names (merge them)
            const mergedProperties = { ...(data || {}), ...(properties || {}) };

            // Generate UUID if not provided (must be valid UUID for PostgreSQL)
            // If client provides an ID, check if it's a valid UUID, otherwise generate one
            let atomeId;
            if (providedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providedId)) {
                atomeId = providedId;
                console.log(`[Atome] Using provided UUID: ${atomeId}`);
            } else {
                atomeId = uuidv4();
                console.log(`[Atome] Generated new UUID: ${atomeId} (original id was: ${id || 'none'})`);
            }

            // Build properties to store (include original id if provided for reference)
            const allProperties = {
                ...mergedProperties,
                kind: kind || 'generic',
                tag: tag || 'div',
                parent: parent || null,
                project_id: project_id || null,
                original_id: id || null,  // Keep original ID if provided
                created_source: 'fastify',  // Track where the atome was created
                created_server: process.env.SQUIRREL_SERVER_ID || 'fastify-dev'
            };

            // Create atome via ORM
            const { object_id } = await orm.createAtome({
                object_id: atomeId,
                tenant_id: tenant_id,
                created_by: principal_id,
                kind: kind || 'generic',
                parent_id: parent || null,
                properties: allProperties
            });

            console.log(`✅ [Atome] Created: ${object_id} (${kind})`);

            // Get client ID from header to exclude from broadcast (avoid echo back to sender)
            const senderClientId = request.headers['x-client-id'] || request.headers['x-ws-client-id'];

            // Broadcast to all connected clients EXCEPT the sender for real-time sync
            broadcastMessage('atome:created', {
                atome: {
                    id: object_id,
                    original_id: id || null,  // Client's original ID for dedup
                    kind,
                    tag,
                    parent,
                    properties: mergedProperties,
                    created_at: new Date().toISOString(),
                    created_by: principal_id
                }
            }, senderClientId);  // Exclude sender from broadcast

            return {
                success: true,
                data: {
                    id: object_id,
                    kind,
                    tag,
                    parent,
                    properties,
                    created_at: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error('❌ [Atome] Create error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // UPDATE - PUT /api/atome/:id
    // =========================================================================
    server.put('/api/atome/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id } = request.params;
            const { properties } = request.body;

            // Check if atome exists
            const atome = await orm.getAtome(id);
            if (!atome) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            // Check ownership
            if (atome.created_by !== principal_id) {
                // Check ACL
                const hasAccess = await orm.hasPermission(principal_id, id, 'write');
                if (!hasAccess) {
                    return reply.status(403).send({ success: false, error: 'Access denied' });
                }
            }

            // Update properties
            if (properties && typeof properties === 'object') {
                await orm.updateAtome(id, properties, principal_id);
            }

            const now = new Date().toISOString();
            console.log(`✅ [Atome] Updated: ${id} (${Object.keys(properties || {}).length} properties)`);

            // Get client ID from header to exclude from broadcast
            const senderClientId = request.headers['x-client-id'] || request.headers['x-ws-client-id'];

            // Broadcast to all connected clients EXCEPT sender for real-time sync
            broadcastMessage('atome:updated', {
                atome: {
                    id,
                    properties,
                    updated_at: now,
                    updated_by: principal_id
                }
            }, senderClientId);

            return {
                success: true,
                data: {
                    id,
                    properties,
                    updated_at: now
                }
            };

        } catch (error) {
            console.error('❌ [Atome] Update error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // DELETE - DELETE /api/atome/:id
    // =========================================================================
    server.delete('/api/atome/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id } = request.params;

            // Check if atome exists
            const atome = await orm.getAtome(id);
            if (!atome) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            // Check ownership
            console.log(`[Atome] DELETE check - principal_id: ${principal_id}, atome.created_by: ${atome.created_by}`);

            if (atome.created_by && atome.created_by !== principal_id) {
                // Check ACL
                const hasAccess = await orm.hasPermission(principal_id, id, 'delete');
                if (!hasAccess) {
                    return reply.status(403).send({ success: false, error: 'Access denied' });
                }
            }

            // Soft delete
            await orm.deleteAtome(id);
            const deletedAt = new Date().toISOString();

            console.log(`✅ [Atome] Deleted: ${id}`);

            // Get client ID from header to exclude from broadcast
            const senderClientId = request.headers['x-client-id'] || request.headers['x-ws-client-id'];

            // Broadcast to all connected clients EXCEPT sender for real-time sync
            broadcastMessage('atome:deleted', {
                atome: {
                    id,
                    deleted_at: deletedAt,
                    deleted_by: principal_id
                }
            }, senderClientId);

            return {
                success: true,
                data: { id, deleted_at: deletedAt }
            };

        } catch (error) {
            console.error('❌ [Atome] Delete error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // GET - GET /api/atome/:id
    // =========================================================================
    server.get('/api/atome/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id } = request.params;

            // Get atome
            const atome = await orm.getAtome(id);
            if (!atome) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            // Check ownership or ACL
            if (atome.created_by !== principal_id) {
                const hasAccess = await orm.hasPermission(principal_id, id, 'read');
                if (!hasAccess) {
                    return reply.status(403).send({ success: false, error: 'Access denied' });
                }
            }

            return {
                success: true,
                data: {
                    id: atome.object_id,
                    kind: atome.properties.kind,
                    tag: atome.properties.tag,
                    parent: atome.properties.parent,
                    properties: atome.properties,
                    created_at: atome.created_at,
                    created_by: atome.created_by
                }
            };

        } catch (error) {
            console.error('❌ [Atome] Get error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // LIST - GET /api/atome/list
    // =========================================================================
    server.get('/api/atome/list', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { project_id, kind, parent } = request.query;

            console.log(`[Atome] LIST - Looking for atomes for user: ${principal_id}`);

            // Get all atomes for this user
            const atomes = await orm.getAtomesByUser(principal_id);

            // Apply filters
            let results = atomes.map(atome => ({
                id: atome.object_id,
                kind: atome.properties.kind || atome.kind,
                tag: atome.properties.tag,
                parent: atome.properties.parent,
                properties: atome.properties,
                created_at: atome.created_at,
                created_by: atome.created_by
            }));

            // Filter by project_id
            if (project_id) {
                results = results.filter(a => a.properties.project_id === project_id);
            }

            // Filter by kind
            if (kind) {
                results = results.filter(a => a.kind === kind);
            }

            // Filter by parent
            if (parent) {
                results = results.filter(a => a.parent === parent);
            }

            console.log(`📋 [Atome] List for user ${principal_id}: ${results.length} atomes`);

            return {
                success: true,
                data: results,
                count: results.length
            };

        } catch (error) {
            console.error('❌ [Atome] List error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // HISTORY - GET /api/atome/:id/history
    // =========================================================================
    server.get('/api/atome/:id/history', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id } = request.params;
            const { key } = request.query;

            // Check atome exists and user has access
            const atome = await orm.getAtome(id);
            if (!atome) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            if (atome.created_by !== principal_id) {
                const hasAccess = await orm.hasPermission(principal_id, id, 'read');
                if (!hasAccess) {
                    return reply.status(403).send({ success: false, error: 'Access denied' });
                }
            }

            // Get property history
            let versions = [];

            if (key) {
                // History for specific property
                const history = await orm.getPropertyHistory(id, key);
                versions = history.map(h => ({
                    key: h.key,
                    value: safeParseJSON(h.value),
                    previous_value: h.previous_value ? safeParseJSON(h.previous_value) : null,
                    changed_at: h.changed_at,
                    changed_by: h.changed_by,
                    change_type: h.change_type
                }));
            } else {
                // Get all properties and their histories
                const allProperties = await orm.getAllProperties(id);
                for (const propKey of Object.keys(allProperties)) {
                    const history = await orm.getPropertyHistory(id, propKey, 10);
                    for (const h of history) {
                        versions.push({
                            key: h.key,
                            value: safeParseJSON(h.value),
                            previous_value: h.previous_value ? safeParseJSON(h.previous_value) : null,
                            changed_at: h.changed_at,
                            changed_by: h.changed_by,
                            change_type: h.change_type
                        });
                    }
                }
            }

            // Sort by changed_at descending
            versions.sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));

            return {
                success: true,
                data: versions,
                count: versions.length
            };

        } catch (error) {
            console.error('❌ [Atome] History error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // ALTER - POST /api/atome/:id/alter (ADOLE: append-only alterations)
    // =========================================================================
    server.post('/api/atome/:id/alter', async (request, reply) => {
        console.log(`📝 [Atome] ALTER request for ${request.params.id}`);

        const user = await validateToken(request);
        if (!user) {
            console.log(`❌ [Atome] ALTER unauthorized`);
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id } = request.params;
            let { alterations, operation, changes, reason } = request.body;
            console.log(`📝 [Atome] ALTER body:`, { operation, changes: changes ? Object.keys(changes) : null, alterations: alterations?.length });

            // Support unified API format: { operation, changes, reason }
            // Convert to alterations array format
            if (!alterations && changes && typeof changes === 'object') {
                alterations = Object.entries(changes).map(([key, value]) => ({
                    key,
                    value,
                    operation: operation || 'set'
                }));
            }

            if (!alterations || !Array.isArray(alterations) || alterations.length === 0) {
                return reply.status(400).send({
                    success: false,
                    error: 'Alterations array or changes object is required'
                });
            }

            // Check atome exists and user has write access
            const atome = await orm.getAtome(id);
            if (!atome) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            if (atome.created_by !== principal_id) {
                const hasAccess = await orm.hasPermission(principal_id, id, 'write');
                if (!hasAccess) {
                    return reply.status(403).send({ success: false, error: 'Access denied' });
                }
            }

            // Apply alterations (each creates a new version in history)
            const appliedAlterations = [];
            for (const alteration of alterations) {
                const { key, value, operation = 'set' } = alteration;

                if (!key) {
                    continue;
                }

                // Get current value for history
                const currentValue = await orm.getProperty(id, key);

                // Apply the alteration
                await orm.setProperty(id, key, value, principal_id);

                appliedAlterations.push({
                    key,
                    previous_value: currentValue,
                    new_value: value,
                    operation,
                    applied_at: new Date().toISOString()
                });
            }

            // Get client ID from header to exclude from broadcast
            const senderClientId = request.headers['x-client-id'] || request.headers['x-ws-client-id'];

            // Broadcast change EXCEPT to sender
            broadcastMessage('atome:altered', {
                atomeId: id,
                userId: principal_id,
                alterations: appliedAlterations
            }, senderClientId);

            console.log(`✅ [Atome] Altered ${id}: ${appliedAlterations.length} changes`);

            return {
                success: true,
                data: {
                    atome_id: id,
                    alterations_applied: appliedAlterations.length,
                    alterations: appliedAlterations
                }
            };

        } catch (error) {
            console.error('❌ [Atome] Alter error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // RENAME - POST /api/atome/:id/rename
    // =========================================================================
    server.post('/api/atome/:id/rename', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id } = request.params;
            // Support both camelCase (unified API) and snake_case formats
            const new_name = request.body.new_name || request.body.newName;

            if (!new_name || typeof new_name !== 'string' || new_name.trim().length === 0) {
                return reply.status(400).send({
                    success: false,
                    error: 'new_name or newName is required and must be a non-empty string'
                });
            }

            // Check atome exists and user has write access
            const atome = await orm.getAtome(id);
            if (!atome) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            if (atome.created_by !== principal_id) {
                const hasAccess = await orm.hasPermission(principal_id, id, 'write');
                if (!hasAccess) {
                    return reply.status(403).send({ success: false, error: 'Access denied' });
                }
            }

            // Get current name for history
            const oldName = await orm.getProperty(id, 'name');

            // Update the name
            await orm.setProperty(id, 'name', new_name.trim(), principal_id);

            // Get client ID from header to exclude from broadcast
            const senderClientId = request.headers['x-client-id'] || request.headers['x-ws-client-id'];

            // Broadcast change EXCEPT to sender
            broadcastMessage('atome:renamed', {
                atomeId: id,
                userId: principal_id,
                oldName,
                newName: new_name.trim()
            }, senderClientId);

            console.log(`✅ [Atome] Renamed ${id}: "${oldName}" -> "${new_name.trim()}"`);

            return {
                success: true,
                data: {
                    atome_id: id,
                    old_name: oldName,
                    new_name: new_name.trim()
                }
            };

        } catch (error) {
            console.error('❌ [Atome] Rename error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // RESTORE - POST /api/atome/:id/restore (restore to a specific version)
    // =========================================================================
    server.post('/api/atome/:id/restore', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id } = request.params;
            const { key, version_index } = request.body;

            if (!key || typeof key !== 'string') {
                return reply.status(400).send({
                    success: false,
                    error: 'key is required to restore a specific property'
                });
            }

            if (typeof version_index !== 'number' || version_index < 0) {
                return reply.status(400).send({
                    success: false,
                    error: 'version_index must be a non-negative integer (0 = most recent)'
                });
            }

            // Check atome exists and user has write access
            const atome = await orm.getAtome(id);
            if (!atome) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            if (atome.created_by !== principal_id) {
                const hasAccess = await orm.hasPermission(principal_id, id, 'write');
                if (!hasAccess) {
                    return reply.status(403).send({ success: false, error: 'Access denied' });
                }
            }

            // Get property history
            const history = await orm.getPropertyHistory(id, key);

            if (!history || history.length === 0) {
                return reply.status(404).send({
                    success: false,
                    error: `No history found for property "${key}"`
                });
            }

            if (version_index >= history.length) {
                return reply.status(400).send({
                    success: false,
                    error: `Version index ${version_index} out of range. Available: 0-${history.length - 1}`
                });
            }

            // Get the version to restore
            const versionToRestore = history[version_index];
            const valueToRestore = JSON.parse(versionToRestore.value || 'null');
            const currentValue = await orm.getProperty(id, key);

            // Apply the restoration (this creates a new history entry)
            await orm.setProperty(id, key, valueToRestore, principal_id);

            // Get client ID from header to exclude from broadcast
            const senderClientId = request.headers['x-client-id'] || request.headers['x-ws-client-id'];

            // Broadcast change EXCEPT to sender
            broadcastMessage('atome:restored', {
                atomeId: id,
                userId: principal_id,
                key,
                restoredFromVersion: version_index
            }, senderClientId);

            console.log(`✅ [Atome] Restored ${id}.${key} to version ${version_index}`);

            return {
                success: true,
                data: {
                    atome_id: id,
                    key,
                    previous_value: currentValue,
                    restored_value: valueToRestore,
                    restored_from_version: version_index,
                    restored_from_date: versionToRestore.changed_at
                }
            };

        } catch (error) {
            console.error('❌ [Atome] Restore error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // USER DATA - DELETE /api/user-data/delete-all
    // =========================================================================
    server.delete('/api/user-data/delete-all', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { confirm } = request.body || {};

            if (confirm !== true && confirm !== 'DELETE_ALL_MY_DATA') {
                return reply.status(400).send({
                    success: false,
                    error: 'Confirmation required. Set confirm to true or "DELETE_ALL_MY_DATA"'
                });
            }

            const db = orm.getDatabase();

            // Count atomes before deletion
            const atomes = await db('atomes')
                .where('created_by', principal_id)
                .select('atome_id');

            const atomeIds = atomes.map(a => a.atome_id);
            let deletedCount = 0;

            if (atomeIds.length > 0) {
                // Delete properties and history for user's atomes
                await db('properties')
                    .whereIn('atome_id', atomeIds)
                    .del();

                await db('property_history')
                    .whereIn('atome_id', atomeIds)
                    .del();

                // Delete permissions
                await db('permissions')
                    .whereIn('atome_id', atomeIds)
                    .del();

                // Delete atomes
                deletedCount = await db('atomes')
                    .where('created_by', principal_id)
                    .del();
            }

            console.log(`🗑️ [UserData] Deleted ${deletedCount} atomes for user ${principal_id}`);

            return {
                success: true,
                data: {
                    deleted_atomes: deletedCount,
                    user_id: principal_id
                }
            };

        } catch (error) {
            console.error('❌ [UserData] Delete error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // USER DATA - GET /api/user-data/export
    // =========================================================================
    server.get('/api/user-data/export', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const db = orm.getDatabase();

            // Get all user's atomes
            const atomes = await db('atomes')
                .where('created_by', principal_id)
                .select('*');

            const exportData = {
                exported_at: new Date().toISOString(),
                user_id: principal_id,
                atomes: []
            };

            for (const atome of atomes) {
                // Get all properties for this atome
                const properties = await orm.getAllProperties(atome.atome_id);

                // Get history for each property
                const history = {};
                for (const key of Object.keys(properties)) {
                    const propHistory = await orm.getPropertyHistory(atome.atome_id, key);
                    history[key] = propHistory.map(h => ({
                        value: safeParseJSON(h.value),
                        previous_value: h.previous_value ? safeParseJSON(h.previous_value) : null,
                        changed_at: h.changed_at,
                        change_type: h.change_type
                    }));
                }

                exportData.atomes.push({
                    atome_id: atome.atome_id,
                    atome_type: atome.atome_type,
                    created_at: atome.created_at,
                    updated_at: atome.updated_at,
                    properties,
                    history
                });
            }

            console.log(`📦 [UserData] Exported ${exportData.atomes.length} atomes for user ${principal_id}`);

            return {
                success: true,
                data: exportData
            };

        } catch (error) {
            console.error('❌ [UserData] Export error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    console.log('🔧 Atome API routes registered (ORM version with ADOLE support)');
}

export default registerAtomeRoutes;
