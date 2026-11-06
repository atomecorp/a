// The Atome types of the Health protocols and declared products (register R-104 D4; Health cahier annex B):
// - `health_product`, `health_intake`: a product the person takes or applies and one intake of it
//   (eVe/domains/programs/program_declared_products.js);
// - `health_protocol_import`: one imported protocol and its proposal, never active without the person
//   (eVe/domains/health_protocol/health_protocol_runtime.js);
// - `protocol_template`: a private template shared by a linked, read-only share (protocol_template_share.js);
// - `food_product_seen`: an Open Food Facts product seen once, kept on the device (eVe/domains/shopping/food_product_store.js);
// - `food_advice_tip`: a doctor's food tip for his patient (eVe/domains/health_protocol/food_advice_commands.js);
// - `prescription_aid`: symptoms, pre-diagnosis and checked pre-ordonnance (eVe/domains/prescription/prescription_aid_runtime.js);
// - `health_profile`: the health profile's declaration and its allergies and intolerances, sealed for their owner alone
//   (eVe/domains/programs/health_profile_store.js; AGENTS.md rule 21).
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
    // A doctor's food tip (R-115 D28): in a list he keeps for his patient (an `item_list` of kind `atome_list`, its parent), applied
    // to the patient once validated (eVe/domains/health_protocol/food_advice_commands.js).
    health('food_advice_tip', 'eVe/domains/health_protocol/food_advice_commands.js', { name: { type: 'string', maxLength: 400 }, food_advice_tip: { type: 'object' } }),
    // The Health record (Carnet de santé, R-104 D10): one entry of a rubric, an imported result report and each value the
    // person verified in it (eVe/domains/health_record/health_record_runtime.js). `person_id`: whose record ('' the account's own).
    health('health_record_entry', 'eVe/domains/health_record/health_record_runtime.js', { person_id: { type: 'string', maxLength: 300 },
        entry_kind: { type: 'string', enum: ['identity', 'history', 'allergy', 'vaccination', 'consultation', 'exam', 'prescription', 'follow_up', 'document'] },
        health_record_entry: { type: 'object' }, updated_iso: ISO }),
    health('health_lab_report', 'eVe/domains/health_record/health_record_runtime.js', { person_id: { type: 'string', maxLength: 300 },
        title: { type: 'string', maxLength: 400 }, health_lab_report: { type: 'object' }, updated_iso: ISO }),
    // A prescription aid (R-115 D27): symptoms, the assistant's pre-diagnosis and pre-ordonnance, the Carnet's facts its checks need,
    // every decision, all sealed whole for the patient and her doctor (`sealed`, never in clear); shared live with the doctor the
    // patient sends it to (eVe/domains/prescription/prescription_aid_runtime.js).
    health('prescription_aid', 'eVe/domains/prescription/prescription_aid_runtime.js', { sealed: { type: 'object' }, updated_iso: ISO }),
    // The health profile (Préférences › Santé: its rows, the glasses of alcohol, the allergies and intolerances answered): on the
    // server, sealed whole for its owner's own key (`sealed`, never in clear), opened on each of their devices (rule 21, replacing Q70).
    health('health_profile', 'eVe/domains/programs/health_profile_store.js', { sealed: { type: 'object' } }),
    health('health_observation', 'eVe/domains/health_record/health_record_runtime.js', { person_id: { type: 'string', maxLength: 300 },
        parameter_key: { type: 'string', maxLength: 200 }, health_observation: { type: 'object' }, updated_iso: ISO })
]);
