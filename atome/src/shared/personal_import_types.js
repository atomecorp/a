// Public domain schemas and private import bookkeeping share the normal Atome contract.
const fields = (names, type) => Object.fromEntries(names.split(' ').filter(Boolean).map(name => [name, { type }]));
const privateFields = { access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] } };
export const PERSONAL_IMPORT_TYPES = [
    { type: 'contact', kind: 'data_model', schema: {
        ...fields('name first_name last_name middle_name prefix suffix nickname phone email user_face organization title role note birthday anniversary gender photo photo_asset_id exchange_uid', 'string'),
        ...fields('phones emails addresses urls categories custom_fields extra_properties collections', 'array'), ...privateFields
    } },
    { type: 'contact_group', kind: 'data_model', schema: { name: { type: 'string' }, members: { type: 'array' },
        exchange_uid: { type: 'string' }, ...privateFields } },
    { type: 'calendar', kind: 'data_model', schema: {
        ...fields('name color timezone description created_iso updated_iso exchange_uid calendar_scope', 'string'), ...privateFields
    } },
    { type: 'import_origin', kind: 'data_model', schema: {
        ...fields('canonical_id domain_type source_key external_id recurrence_id source_collection external_href', 'string'),
        ...fields('pending removed suppressed', 'boolean'), baseline: { type: 'object' }, conflicts: { type: 'object' },
        external_version: {}, ...privateFields
    } },
    { type: 'import_source_state', kind: 'data_model', schema: {
        ...fields('domain_type source_key source_id device_id exchange_uid', 'string'), enabled: { type: 'boolean' },
        config: { type: 'object' }, coverage: { type: 'object' }, cursor: {}, ...privateFields
    } }
];
export const CALENDAR_IMPORT_FIELDS = {
    ...fields('calendar_scope exchange_uid recurrence_id ical_status native_series_id access visibility', 'string'),
    sequence: { type: 'number' }, icalendar: { type: 'object' }, exdates: { type: 'array' }, rdates: { type: 'array' }
};
