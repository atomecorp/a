// /ws/api atome 'list': atomes owned by or shared with the requester (or, with
// no owner, every atome of one type), with conditional permissions and property
// projection enforced at read time.
import db from '../database/adole.js';
import {
  canReadAnyAtomeProperty,
  projectAtomePropertiesForRead
} from './atomePropertySecurity.js';

export async function handleWsApiAtomeList({ data, requestId, requesterId, hasAuthIdentity, safeSend }) {
  const { owner_id, user_id, atome_type, limit, offset, include_deleted } = data;
  const excludedParticleKeys = new Set(
    Array.isArray(data.exclude_particle_keys)
      ? data.exclude_particle_keys.map((key) => String(key || '').trim()).filter(Boolean)
      : []
  );
  const excludedParticleKeyList = Array.from(excludedParticleKeys);
  const excludedParticleJoinClause = excludedParticleKeyList.length
    ? `AND p.particle_key NOT IN (${excludedParticleKeyList.map(() => '?').join(', ')})`
    : '';
  const effectiveType = atome_type;
  const requestedOwner = (owner_id === '*' || owner_id === 'all') ? null : (owner_id || user_id);
  const effectiveOwner = requesterId || requestedOwner;

  const isAuthenticated = hasAuthIdentity && requesterId && requesterId !== 'anonymous';

  if (!isAuthenticated) {
    safeSend({
      type: 'atome-response',
      requestId,
      success: false,
      error: 'Unauthorized'
    });
    return;
  }

  if (process.env.ATOME_LIST_DEBUG === '1') {
    console.log(`[Atome List Debug] owner_id=${owner_id}, user_id=${user_id}, atome_type=${atome_type}, include_deleted=${include_deleted}`);
    console.log(`[Atome List Debug] effectiveOwner=${effectiveOwner || 'none'}, effectiveType=${effectiveType || 'none'}`);
  }

  // Build WHERE clause for deleted_at
  const deletedClause = include_deleted ? '' : 'AND a.deleted_at IS NULL';

  let atomes;
  if (effectiveOwner && effectiveOwner !== 'anonymous') {
    // List atomes accessible to this user (owned OR shared via permissions)
    const dataSource = db.getDataSourceAdapter();
    const pendingOwner = JSON.stringify(effectiveOwner);
    const rows = await dataSource.query(
      `SELECT a.*, 
                            GROUP_CONCAT(p.particle_key || ':' || p.particle_value, '||') as particles_raw
                     FROM atomes a
                     LEFT JOIN particles p ON a.atome_id = p.atome_id ${excludedParticleJoinClause}
                     LEFT JOIN permissions perm
                       ON perm.atome_id = a.atome_id
                      AND perm.principal_id = ?
                      AND perm.can_read = 1
                      AND (perm.expires_at IS NULL OR perm.expires_at > datetime('now'))
                     WHERE (a.owner_id = ? OR perm.permission_id IS NOT NULL
                       OR EXISTS (
                         SELECT 1 FROM particles p2
                         WHERE p2.atome_id = a.atome_id
                           AND p2.particle_key = '_pending_owner_id'
                           AND p2.particle_value = ?
                       ))
                       ${deletedClause}
                       ${effectiveType ? 'AND a.atome_type = ?' : ''}
                     GROUP BY a.atome_id
                     ORDER BY a.created_at DESC
                     LIMIT ? OFFSET ?`,
      effectiveType
        ? [...excludedParticleKeyList, effectiveOwner, effectiveOwner, pendingOwner, effectiveType, limit || 100, offset || 0]
        : [...excludedParticleKeyList, effectiveOwner, effectiveOwner, pendingOwner, limit || 100, offset || 0]
    );

    // Parse particles
    atomes = rows.map(row => {
      const atome = {
        atome_id: row.atome_id,
        atome_type: row.atome_type,
        parent_id: row.parent_id,
        owner_id: row.owner_id,
        creator_id: row.creator_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at // Include deleted_at for sync
      };

      if (row.particles_raw) {
        const pairs = row.particles_raw.split('||');
        for (const pair of pairs) {
          const colonIdx = pair.indexOf(':');
          if (colonIdx > 0) {
            const key = pair.substring(0, colonIdx);
            const value = pair.substring(colonIdx + 1);
            try {
              atome[key] = JSON.parse(value);
            } catch (error) {
              console.warn("[server] operation failed", error);
              atome[key] = value;
            }
          }
        }
      }
      return atome;
    });

    // Enforce conditional permissions (rules/expiry) at read time.
    if (requesterId) {
      const filtered = [];
      for (const atome of atomes) {
        const id = atome?.atome_id;
        if (!id) continue;
        const allowed = await canReadAnyAtomeProperty(id, requesterId);
        if (allowed) filtered.push(atome);
      }
      atomes = filtered;
    }
  } else if (effectiveType) {
    // List all atomes of a specific type (e.g., all users)
    const dataSource = db.getDataSourceAdapter();
    const rows = await dataSource.query(
      `SELECT a.*, 
                            GROUP_CONCAT(p.particle_key || ':' || p.particle_value, '||') as particles_raw
                     FROM atomes a
                     LEFT JOIN particles p ON a.atome_id = p.atome_id ${excludedParticleJoinClause}
                     WHERE a.atome_type = ? ${deletedClause}
                     GROUP BY a.atome_id
                     ORDER BY a.created_at DESC
                     LIMIT ? OFFSET ?`,
      [...excludedParticleKeyList, effectiveType, limit || 100, offset || 0]
    );

    // Parse particles
    atomes = rows.map(row => {
      const atome = {
        atome_id: row.atome_id,
        atome_type: row.atome_type,
        parent_id: row.parent_id,
        owner_id: row.owner_id,
        creator_id: row.creator_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at // Include deleted_at for sync
      };

      if (row.particles_raw) {
        const pairs = row.particles_raw.split('||');
        for (const pair of pairs) {
          const colonIdx = pair.indexOf(':');
          if (colonIdx > 0) {
            const key = pair.substring(0, colonIdx);
            const value = pair.substring(colonIdx + 1);
            try {
              atome[key] = JSON.parse(value);
            } catch (error) {
              console.warn("[server] operation failed", error);
              atome[key] = value;
            }
          }
        }
      }
      return atome;
    });
  } else {
    atomes = [];
  }

  if (requesterId) {
    const projectedAtomes = await Promise.all(atomes.map(async (atome) => {
      if (String(atome.owner_id || '') === String(requesterId)) return atome;
      const properties = await projectAtomePropertiesForRead(
        atome.atome_id,
        await db.getParticles(atome.atome_id),
        requesterId
      );
      if (!Object.keys(properties).length) return null;
      return {
        atome_id: atome.atome_id,
        atome_type: atome.atome_type,
        parent_id: atome.parent_id,
        owner_id: atome.owner_id,
        creator_id: atome.creator_id,
        created_at: atome.created_at,
        updated_at: atome.updated_at,
        deleted_at: atome.deleted_at,
        ...properties,
        properties
      };
    }));
    atomes = projectedAtomes.filter(Boolean);
  }

  if (excludedParticleKeys.size) {
    atomes.forEach((atome) => {
      excludedParticleKeys.forEach((key) => {
        delete atome[key];
        if (atome.data && typeof atome.data === 'object') delete atome.data[key];
        if (atome.properties && typeof atome.properties === 'object') delete atome.properties[key];
        if (atome.particles && typeof atome.particles === 'object') delete atome.particles[key];
      });
    });
  }
  safeSend({
    type: 'atome-response',
    requestId,
    success: true,
    atomes
  });
}
