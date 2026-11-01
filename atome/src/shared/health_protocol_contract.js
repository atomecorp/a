// The Atome types of the Health protocols and declared products (register R-104 D4; Health cahier annex B):
// - `health_product`, `health_intake`: a product the person takes or applies and one intake of it
//   (eVe/domains/programs/program_declared_products.js);
// - `health_protocol_import`: one imported protocol and its proposal, never active without the person
//   (eVe/domains/health_protocol/health_protocol_runtime.js);
// - `protocol_template`: a private template shared by a linked, read-only share (protocol_template_share.js);
// - `food_product_seen`: an Open Food Facts product seen once, kept on the device (eVe/domains/shopping/food_product_store.js).
// All are private health or consumption data: never public, never sent to an AI (closed families in
// atome/src/squirrel/health/protocol_contracts.js).
const PRIVATE = Object.freeze({ access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] },
    source_domain: { type: 'string', maxLength: 80 } });
const ISO = { type: 'string', maxLength: 40 };
const health = (type, writer, schema) => Object.freeze({ type, kind: 'data_model', traits: ['data'], writer, default_policy: { visibility: 'private' },
    schema: { ...PRIVATE, ...schema } });

export const HEALTH_PROTOCOL_ATOME_TYPES = Object.freeze([
    health('health_product', 'eVe/domains/programs/program_declared_products.js', { product_id: { type: 'string', maxLength: 200 }, health_product: { type: 'object' } }),
    health('health_intake', 'eVe/domains/programs/program_declared_products.js', { health_intake: { type: 'object' } }),
    health('health_protocol_import', 'eVe/domains/health_protocol/health_protocol_runtime.js', { title: { type: 'string', maxLength: 400 },
        review_state: { type: 'string', enum: ['proposed', 'reviewed', 'active', 'refused'] }, origin: { type: 'object' }, health_protocol: { type: 'object' }, updated_iso: ISO }),
    health('protocol_template', 'eVe/domains/health_protocol/protocol_template_share.js', { title: { type: 'string', maxLength: 200 }, version: { type: 'number', minimum: 1 },
        author_id: { type: 'string', maxLength: 300 }, include_doses: { type: 'boolean' }, lines: { type: 'array', maxItems: 2000 }, updated_iso: ISO, created_iso: ISO }),
    health('food_product_seen', 'eVe/domains/shopping/food_product_store.js', { food_product: { type: 'object' }, seen_at: ISO }),
    // The Health record (Carnet de santé, R-104 D10): one entry of a rubric, an imported result report and each value the
    // person verified in it (eVe/domains/health_record/health_record_runtime.js). `person_id`: whose record ('' the account's own).
    health('health_record_entry', 'eVe/domains/health_record/health_record_runtime.js', { person_id: { type: 'string', maxLength: 300 },
        entry_kind: { type: 'string', enum: ['identity', 'history', 'allergy', 'vaccination', 'consultation', 'exam', 'prescription', 'follow_up', 'document'] },
        health_record_entry: { type: 'object' }, updated_iso: ISO }),
    health('health_lab_report', 'eVe/domains/health_record/health_record_runtime.js', { person_id: { type: 'string', maxLength: 300 },
        title: { type: 'string', maxLength: 400 }, health_lab_report: { type: 'object' }, updated_iso: ISO }),
    health('health_observation', 'eVe/domains/health_record/health_record_runtime.js', { person_id: { type: 'string', maxLength: 300 },
        parameter_key: { type: 'string', maxLength: 200 }, health_observation: { type: 'object' }, updated_iso: ISO })
]);
