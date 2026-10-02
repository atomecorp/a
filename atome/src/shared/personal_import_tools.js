const content = { type: 'string', maxLength: 33554432 };
const source = { source_id: { type: 'string' }, source_key: { type: 'string' }, auth_ref: { type: 'string' },
    collections: { type: 'array', items: { type: 'string' } } };
const exportOptions = { ids: { type: 'array', items: { type: 'string' } }, save: { type: 'boolean' }, filename: { type: 'string' } };
export const PERSONAL_IMPORT_TOOLS = [
    { name: 'contacts.import_vcf', method: 'importVcf', param: 'content', write: true,
        description: 'Import vCard 3/4 into private canonical contacts.', properties: { content } },
    { name: 'contacts.export_vcf', method: 'exportVcf', description: 'Export current canonical contacts as vCard.',
        properties: { ...exportOptions, version: { type: 'string', enum: ['3.0', '4.0'] } } },
    { name: 'contacts.stop_import', method: 'stopSource', param: 'source_id', write: true,
        description: 'Stop automatic collection without deleting imported contacts.', properties: source },
    { name: 'contacts.import_status', method: 'importStatus', description: 'Read active contact collectors.', properties: {} },
    { name: 'calendar.import_native', method: 'importNative', write: true,
        description: 'Read selected native calendars into private canonical events. Requires full native read permission.',
        properties: { ...source, start_year: { type: 'number', minimum: 1900 }, future_years: { type: 'number', minimum: 1, maximum: 20 } } },
    { name: 'calendar.import_dav', method: 'importDav', write: true,
        description: 'Read CalDAV collections using an existing credential vault reference.', properties: { ...source, calendar_url: { type: 'string' } } },
    { name: 'calendar.import_ics', method: 'importIcs', param: 'content', write: true,
        description: 'Import an ICS calendar into private canonical events without sending invitations.', properties: { content, ...source } },
    { name: 'calendar.export_ics', method: 'exportIcs', description: 'Export current canonical events as ICS.',
        properties: { ...exportOptions, calendar_id: { type: 'string' } } },
    { name: 'calendar.stop_import', method: 'stopSource', param: 'source_id', write: true,
        description: 'Stop automatic collection without deleting imported events.', properties: source },
    { name: 'calendar.import_status', method: 'importStatus', description: 'Read active calendar collectors.', properties: {} }
];

export function personalImportToolResult(tool, result) {
    if (!tool.write) return result;
    const output = {};
    for (const key of ['ok', 'imported', 'changed', 'skipped', 'durability', 'local_persisted', 'remote_acknowledgement', 'replication', 'more'])
        if (result?.[key] !== undefined) output[key] = result[key];
    if (result?.error) output.error = /^[a-z][a-z0-9_]{1,100}$/.test(result.error) ? result.error : 'personal_import_failed';
    return output;
}

/** Audit metadata stays useful without storing an address book or ICS payload. */
export function personalImportAudit(entry) {
    const id = entry.tool_id || entry.envelope?.meta?.tool_id;
    if (!PERSONAL_IMPORT_TOOLS.some(tool => tool.name === id)) return entry;
    return { kind: entry.kind, tool_id: id, ok: entry.ok,
        ...(entry.error ? { error: /^[a-z][a-z0-9_]{1,100}$/.test(entry.error) ? entry.error : 'personal_import_failed' } : {}),
        redacted: true };
}
