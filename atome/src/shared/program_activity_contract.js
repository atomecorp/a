/** Account-global Programme activity records: the activity, its objective link, occurrences and executions. */
import { PROGRAM_NUTRITION_SCHEMA } from './program_nutrition_contract.js';

const programExecutionSchema = {
    active_minutes: { type: 'number', minimum: 0 },
    start: { type: 'string' }, end: { type: 'string' }, provenance: { type: 'string' },
    use_in_followup: { type: 'boolean' }, note: { type: 'string' }
};
const programExecutionRequired = ['start', 'end', 'provenance', 'use_in_followup'];

export const PROGRAM_ACTIVITY_RECORD_SCHEMAS = Object.freeze({
    program_activity: { type: 'object', required: ['version', 'brick_id', 'title', 'involvement'], properties: {
        version: { type: 'number', minimum: 1 }, brick_id: { type: 'string' }, title: { type: 'string' }, nutrition: PROGRAM_NUTRITION_SCHEMA,
        nutrition_declined: { type: 'boolean' },
        // A Sport activity: one catalogue exercise (#shared/training_catalog.js) at the user's level.
        training: { type: 'object', required: ['exercise_id', 'level'], properties: {
            exercise_id: { type: 'string' }, level: { type: 'number' }, load_kg: { type: 'number' }
        } },
        involvement: { type: 'object', required: ['minutes', 'basis', 'days', 'rhythm'], properties: {
            minutes: { type: 'number' }, basis: { type: 'string', enum: ['day', 'week'] },
            days: { type: 'array' }, rhythm: { type: 'number' }
        } }
    } },
    program_activity_link: { type: 'object', required: ['activity_id', 'objective_id'], properties: {
        activity_id: { type: 'string' }, objective_id: { type: 'string' }
    } },
    program_occurrence: { type: 'object', required: ['activity_id', 'execution_id'], properties: {
        activity_id: { type: 'string' }, calendar_event_id: { type: 'string' }, session_id: { type: 'string' }, execution_id: { type: 'string' }
    } },
    program_execution: { type: 'object', required: ['activity_id', 'occurrence_id', ...programExecutionRequired], properties: {
        activity_id: { type: 'string' }, occurrence_id: { type: 'string' }, ...programExecutionSchema
    } },
    program_execution_correction: { type: 'object', required: ['execution_id', 'supersedes_ids', 'reason', 'execution'], properties: {
        execution_id: { type: 'string' }, supersedes_ids: { type: 'array' }, reason: { type: 'string' },
        execution: { type: 'object', required: programExecutionRequired, properties: programExecutionSchema }
    } }
});
