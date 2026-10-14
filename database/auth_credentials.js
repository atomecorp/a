/** Read legacy verifiers only as migration input inside the protected auth boundary. */
export async function readPasswordCredential(query, principal) {
    const current = await query('get', 'SELECT * FROM auth_password_credentials WHERE principal_id = ?', [principal]);
    if (current) return current;
    const legacy = await query('get', `SELECT p.particle_value FROM particles p JOIN atomes a ON a.atome_id=p.atome_id
        WHERE p.atome_id=? AND p.particle_key='password_hash' AND a.atome_type='user' AND a.deleted_at IS NULL`, [principal]);
    if (!legacy) return null;
    const verifier = JSON.parse(legacy.particle_value);
    return typeof verifier === 'string' && /^\$2[aby]\$/.test(verifier) ? { principal_id: principal, verifier, legacy: true } : null;
}
