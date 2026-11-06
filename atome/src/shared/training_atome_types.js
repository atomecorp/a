// The Sport records of R-104 D6, private to their owner (never public, never sent to an AI without the person):
// - `training_equipment`: a personal machine (#training_equipment.js; eVe/domains/training/training_equipment_runtime.js);
// - `training_discipline`: the person's own activity, plain data (#training_disciplines.js validateTrainingOwnDiscipline);
// - `training_discipline_log`: one practice of a discipline recorded by hand or from an allowed source, its segments
//   under one parent session (eVe/domains/training/training_discipline_runtime.js);
// - `training_discipline_choice`: the options the person last chose for a discipline (its card opens on them again);
// - `training_series`: a kept series (L6 b), its own Atome so a delete stays one (eVe/domains/training/training_series_records.js).
const PRIVATE = Object.freeze({ access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] },
    source_domain: { type: 'string', maxLength: 80 } });
const ISO = { type: 'string', maxLength: 40 };
const training = (type, writer, schema) => Object.freeze({ type, kind: 'data_model', traits: ['data'], writer, default_policy: { visibility: 'private' },
    schema: { ...PRIVATE, ...schema } });

export const TRAINING_EQUIPMENT_TYPE = 'training_equipment';
export const TRAINING_DISCIPLINE_TYPE = 'training_discipline';
export const TRAINING_DISCIPLINE_LOG_TYPE = 'training_discipline_log';
export const TRAINING_DISCIPLINE_CHOICE_TYPE = 'training_discipline_choice';
export const TRAINING_SERIES_TYPE = 'training_series';

export const TRAINING_ATOME_TYPES = Object.freeze([
    training(TRAINING_EQUIPMENT_TYPE, 'eVe/domains/training/training_equipment_runtime.js', { equipment_id: { type: 'string', maxLength: 80 },
        training_equipment: { type: 'object' }, updated_iso: ISO }),
    training(TRAINING_DISCIPLINE_TYPE, 'eVe/domains/training/training_discipline_runtime.js', { discipline_id: { type: 'string', maxLength: 80 },
        training_discipline: { type: 'object' }, updated_iso: ISO }),
    training(TRAINING_DISCIPLINE_LOG_TYPE, 'eVe/domains/training/training_discipline_runtime.js', { log_id: { type: 'string', maxLength: 80 },
        training_discipline_log: { type: 'object' }, updated_iso: ISO }),
    training(TRAINING_DISCIPLINE_CHOICE_TYPE, 'eVe/domains/training/training_discipline_runtime.js', { discipline_id: { type: 'string', maxLength: 80 },
        training_discipline_choice: { type: 'object' }, updated_iso: ISO }),
    training(TRAINING_SERIES_TYPE, 'eVe/domains/training/training_series_records.js', { series_id: { type: 'string', maxLength: 40 },
        training_series: { type: 'object' }, updated_iso: ISO })
]);
