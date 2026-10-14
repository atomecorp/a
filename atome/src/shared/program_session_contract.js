/** Canonical immutable health session plans and ordered user transitions. */
const measurement = { type: 'object', additionalProperties: false, required: ['value', 'unit'], properties: {
    value: { type: 'number', minimum: 0 }, unit: { type: 'string', minLength: 1, maxLength: 32 }
} };
export const PROGRAM_SESSION_ACTIONS = Object.freeze(['start', 'pause', 'resume', 'confirm', 'skip', 'correct', 'undo', 'finish', 'stop']);
export const PROGRAM_SESSION_SCHEMA = { type: 'object', additionalProperties: false,
    required: ['version', 'activity_id', 'steps'], properties: {
        version: { type: 'number', enum: [1] }, activity_id: { type: 'string', minLength: 1 }, activity_version: { type: 'number', minimum: 1 },
        steps: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'object', additionalProperties: false,
            required: ['id', 'label'], properties: { id: { type: 'string', minLength: 1 },
                label: { type: 'string', minLength: 1, maxLength: 400 }, planned: measurement } } }
    } };
export const PROGRAM_SESSION_TRANSITION_SCHEMA = { type: 'object', additionalProperties: false,
    required: ['session_id', 'revision', 'request_id', 'action', 'recorded_at'], properties: {
        session_id: { type: 'string', minLength: 1 }, revision: { type: 'number', minimum: 1 },
        request_id: { type: 'string', minLength: 1 }, action: { type: 'string', enum: PROGRAM_SESSION_ACTIONS },
        recorded_at: { type: 'string', minLength: 1 }, step_id: { type: 'string' }, actual: measurement,
        note: { type: 'string', maxLength: 4000 }, use_in_followup: { type: 'boolean' }
    } };
export const PROGRAM_SESSION_OPERATIONS = Object.freeze(['session_read', 'session_prepare', 'session_transition']);
export const PROGRAM_SESSION_INPUT_PROPERTIES = Object.freeze({
    session_id: { type: 'string', minLength: 1 }, session_steps: PROGRAM_SESSION_SCHEMA.properties.steps,
    base_revision: { type: 'number', minimum: 0 },
    session_transition: { ...PROGRAM_SESSION_TRANSITION_SCHEMA,
        required: ['request_id', 'action', 'recorded_at'], properties: Object.fromEntries(
            Object.entries(PROGRAM_SESSION_TRANSITION_SCHEMA.properties).filter(([key]) => !['session_id', 'revision'].includes(key))) }
});
export const programSessionTransitionId = (sessionId, revision) => 'program_session_transition:' + encodeURIComponent(sessionId) + ':' + revision;
export const programSessionOccurrenceIds = sessionId => ({ occurrence_id: 'program_occurrence:session:' + encodeURIComponent(sessionId),
    execution_id: 'program_execution:session:' + encodeURIComponent(sessionId) });
