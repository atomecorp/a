// Canonical public EPG projection; raw supplier payloads remain private.
export function projectTvPrograms(items, { channel_id, from, to, now = Date.now() }) {
    if (!Array.isArray(items)) return [];
    return items.filter(item => typeof item.id === 'string' && typeof item.title === 'string'
        && item.channel_id === channel_id && typeof item.provenance === 'string'
        && Number.isFinite(Date.parse(item.fetched_at)) && Number.isFinite(Date.parse(item.expires_at))
        && Date.parse(item.fetched_at) <= now && Date.parse(item.expires_at) > now
        && Date.parse(item.end) > Date.parse(item.start)
        && Date.parse(item.end) > from && Date.parse(item.start) < to)
        .map(item => ({ id: item.id, channel_id, title: item.title, description: String(item.description || ''),
            start: new Date(item.start).toISOString(), end: new Date(item.end).toISOString(),
            provenance: item.provenance, fetched_at: new Date(item.fetched_at).toISOString(), expires_at: new Date(item.expires_at).toISOString() }))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
