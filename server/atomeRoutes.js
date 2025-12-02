/**
 * Atome API Routes
 * 
 * Server-side routes for Atome CRUD operations.
 * Requires authentication for all operations.
 */

import { v4 as uuidv4 } from 'uuid';

// In-memory store for properties (in production, use a proper table)
const propertiesStore = new Map();
const propertyVersionsStore = new Map();

/**
 * Validate authentication token
 */
async function validateToken(request) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);

    // TODO: Validate JWT token properly
    // For now, decode and check basic structure
    try {
        const [, payload] = token.split('.');
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        return decoded;
    } catch (e) {
        return null;
    }
}

/**
 * Register Atome API routes
 */
export function registerAtomeRoutes(server, dataSource) {
    const atomeRepository = dataSource.getRepository('Atome');
    const projectRepository = dataSource.getRepository('Project');
    const userRepository = dataSource.getRepository('User');

    // =========================================================================
    // CREATE - POST /api/atome/create
    // =========================================================================
    server.post('/api/atome/create', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            const { id, kind, tag, parent, properties, project_id } = request.body;

            // Generate ID if not provided
            const atomeId = id || `atome_${Date.now()}_${uuidv4().substring(0, 8)}`;

            // Create atome record
            const atome = atomeRepository.create({
                id: atomeId,
                user_id: user.id || user.userId,
                project_id: project_id || null,
                name_project: kind || 'generic'
            });

            // Note: The current Atome entity uses int IDs, so we need to handle this
            // For now, store extended data in properties
            const extendedData = {
                atome_id: atomeId,
                kind,
                tag: tag || 'div',
                parent: parent || null,
                created_at: new Date().toISOString(),
                created_by: user.id || user.userId
            };

            // Store properties
            if (properties && typeof properties === 'object') {
                for (const [key, value] of Object.entries(properties)) {
                    const propId = `${atomeId}:${key}`;
                    const propData = {
                        id: propId,
                        object_id: atomeId,
                        key,
                        value_type: typeof value,
                        value_json: JSON.stringify(value),
                        updated_at: new Date().toISOString(),
                        updated_by: user.id || user.userId
                    };

                    propertiesStore.set(propId, propData);

                    // Create version entry
                    const versionId = `${propId}:v0`;
                    propertyVersionsStore.set(versionId, {
                        id: versionId,
                        property_id: propId,
                        object_id: atomeId,
                        key,
                        version_index: 0,
                        value_json: JSON.stringify(value),
                        valid_from: new Date().toISOString(),
                        valid_to: null,
                        created_at: new Date().toISOString(),
                        created_by: user.id || user.userId
                    });
                }
            }

            // Store extended data as a property
            propertiesStore.set(`${atomeId}:__meta__`, {
                id: `${atomeId}:__meta__`,
                object_id: atomeId,
                key: '__meta__',
                value_type: 'object',
                value_json: JSON.stringify(extendedData),
                updated_at: new Date().toISOString(),
                updated_by: user.id || user.userId
            });

            console.log(`✅ [Atome] Created: ${atomeId} (${kind})`);

            return {
                success: true,
                data: {
                    id: atomeId,
                    kind,
                    tag,
                    parent,
                    properties,
                    created_at: extendedData.created_at
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
            const { id } = request.params;
            const { properties } = request.body;
            const userId = user.id || user.userId;

            // Check if atome exists (via meta property)
            const metaProp = propertiesStore.get(`${id}:__meta__`);
            if (!metaProp) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            // Check ownership
            const meta = JSON.parse(metaProp.value_json);
            if (meta.created_by !== userId) {
                return reply.status(403).send({ success: false, error: 'Access denied' });
            }

            const updatedProps = {};
            const now = new Date().toISOString();

            // Update properties
            if (properties && typeof properties === 'object') {
                for (const [key, value] of Object.entries(properties)) {
                    const propId = `${id}:${key}`;
                    const existingProp = propertiesStore.get(propId);

                    // Get current version index
                    let versionIndex = 0;
                    if (existingProp) {
                        // Find latest version
                        for (const [vId, v] of propertyVersionsStore) {
                            if (v.property_id === propId && v.version_index >= versionIndex) {
                                versionIndex = v.version_index + 1;
                                // Close previous version
                                v.valid_to = now;
                            }
                        }
                    }

                    // Update property
                    const propData = {
                        id: propId,
                        object_id: id,
                        key,
                        value_type: typeof value,
                        value_json: JSON.stringify(value),
                        updated_at: now,
                        updated_by: user.id || user.userId
                    };
                    propertiesStore.set(propId, propData);
                    updatedProps[key] = value;

                    // Create new version
                    const versionId = `${propId}:v${versionIndex}`;
                    propertyVersionsStore.set(versionId, {
                        id: versionId,
                        property_id: propId,
                        object_id: id,
                        key,
                        version_index: versionIndex,
                        value_json: JSON.stringify(value),
                        valid_from: now,
                        valid_to: null,
                        created_at: now,
                        created_by: user.id || user.userId
                    });
                }
            }

            console.log(`✅ [Atome] Updated: ${id} (${Object.keys(updatedProps).length} properties)`);

            return {
                success: true,
                data: {
                    id,
                    properties: updatedProps,
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
            const { id } = request.params;
            const userId = user.id || user.userId;

            // Check if atome exists
            const metaProp = propertiesStore.get(`${id}:__meta__`);
            if (!metaProp) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            // Check ownership
            const meta = JSON.parse(metaProp.value_json);
            if (meta.created_by !== userId) {
                return reply.status(403).send({ success: false, error: 'Access denied' });
            }

            // Soft delete - mark as deleted
            meta.deleted_at = new Date().toISOString();
            meta.deleted_by = userId;
            metaProp.value_json = JSON.stringify(meta);

            console.log(`✅ [Atome] Deleted: ${id}`);

            return {
                success: true,
                data: { id, deleted_at: meta.deleted_at }
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
            const { id } = request.params;
            const userId = user.id || user.userId;

            // Get meta property
            const metaProp = propertiesStore.get(`${id}:__meta__`);
            if (!metaProp) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            const meta = JSON.parse(metaProp.value_json);

            // Check if deleted
            if (meta.deleted_at) {
                return reply.status(404).send({ success: false, error: 'Atome has been deleted' });
            }

            // Check ownership - user can only access their own atomes
            if (meta.created_by !== userId) {
                return reply.status(403).send({ success: false, error: 'Access denied' });
            }

            // Collect all properties
            const properties = {};
            for (const [propId, prop] of propertiesStore) {
                if (prop.object_id === id && prop.key !== '__meta__') {
                    properties[prop.key] = JSON.parse(prop.value_json);
                }
            }

            return {
                success: true,
                data: {
                    id,
                    kind: meta.kind,
                    tag: meta.tag,
                    parent: meta.parent,
                    properties,
                    created_at: meta.created_at,
                    created_by: meta.created_by
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
            const { project_id, kind, parent } = request.query;
            const userId = user.id || user.userId;
            const results = [];

            // Collect atomes that belong to this user
            for (const [propId, prop] of propertiesStore) {
                if (prop.key === '__meta__') {
                    const meta = JSON.parse(prop.value_json);

                    // Skip deleted
                    if (meta.deleted_at) continue;

                    // IMPORTANT: Filter by user - only return atomes created by this user
                    if (meta.created_by !== userId) continue;

                    // Apply additional filters
                    if (project_id && meta.project_id !== project_id) continue;
                    if (kind && meta.kind !== kind) continue;
                    if (parent && meta.parent !== parent) continue;

                    // Collect properties
                    const properties = {};
                    for (const [pId, p] of propertiesStore) {
                        if (p.object_id === prop.object_id && p.key !== '__meta__') {
                            properties[p.key] = JSON.parse(p.value_json);
                        }
                    }

                    results.push({
                        id: prop.object_id,
                        kind: meta.kind,
                        tag: meta.tag,
                        parent: meta.parent,
                        properties,
                        created_at: meta.created_at,
                        created_by: meta.created_by
                    });
                }
            }

            console.log(`📋 [Atome] List for user ${userId}: ${results.length} atomes`);

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
            const { id } = request.params;
            const { key } = request.query;

            const versions = [];

            for (const [vId, version] of propertyVersionsStore) {
                if (version.object_id === id) {
                    if (key && version.key !== key) continue;

                    versions.push({
                        key: version.key,
                        version: version.version_index,
                        value: JSON.parse(version.value_json),
                        valid_from: version.valid_from,
                        valid_to: version.valid_to,
                        created_by: version.created_by
                    });
                }
            }

            // Sort by version
            versions.sort((a, b) => a.version - b.version);

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

    console.log('🔧 Atome API routes registered');
}

export default registerAtomeRoutes;
