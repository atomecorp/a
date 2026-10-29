import { validateParams } from '../ai/agent_gateway_normalize.js';
import { HEALTH_FEELING_LEVELS, HEALTH_FEELING_MOMENTS, HEALTH_FEELING_MOODS, HEALTH_FEELING_NOTE_MAX } from '../../shared/health_feeling_contract.js';

// One contract for runtime V2, AI discovery and direct MCP calls: the person says how they feel (Forme, Force, Humeur,
// #health_feeling.js), from the end of a session, a rest, the morning or the voice. The assistant writes what the
// person says; it never reads a feeling back.
export const HEALTH_FEELING_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'HEALTH_FEELING_WRITE_FAILED']);
const note = { type: 'string', minLength: 1, maxLength: HEALTH_FEELING_NOTE_MAX };
const level = { type: 'object', additionalProperties: false,
    properties: { level: { type: 'number', enum: HEALTH_FEELING_LEVELS }, note } };
export const HEALTH_FEELING_COMMANDS = Object.freeze([Object.freeze({
    name: 'health_feeling.set', action: 'set', persistent: true, capability: 'health_feeling.write',
    description: 'Record how the user feels now. form (Forme) and strength (Force): level 1 to 5 (1 lowest, 5 highest); mood (Humeur): one or more moods. Each may carry a short note in the user\'s words. An aspect not said keeps its value.',
    input_schema: { type: 'object', additionalProperties: false, properties: {
        form: level, strength: level,
        mood: { type: 'object', additionalProperties: false,
            properties: { moods: { type: 'array', minItems: 1, items: { type: 'string', enum: HEALTH_FEELING_MOODS } }, note } },
        moment: { type: 'string', enum: HEALTH_FEELING_MOMENTS }, session_id: { type: 'string', minLength: 1 }
    } },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: HEALTH_FEELING_ERRORS },
        day: { type: 'string' } } }
})]);
export const validateHealthFeelingInput = (action, input) => {
    const contract = HEALTH_FEELING_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const HEALTH_FEELING_ASSISTANT_INSTRUCTIONS = 'Feeling: « je suis en pleine forme » calls health_feeling.set with form { level: 5 }; « je me sens fébrile » strength { level: 1 }; « je suis fatigué et un peu stressé » mood { moods: [fatigue, stress] }; words that fit no level or mood go to note. Never say how the user felt: the assistant does not read feelings.';

/** The service executor of the family (eVe/intuition/tools/core/tool_runtime_service_commands.js). The answer holds the
 *  day only: what was felt is never handed back to the caller. */
export const executeHealthFeelingCommand = async (action, input = {}) => {
    const { getHealthOwner } = await import('./index.js');
    try {
        const { day } = await getHealthOwner().feeling.set({ moment: 'day', ...input });
        return { ok: true, day };
    } catch (error) {
        const code = error?.code || error?.message;
        return { ok: false, error: HEALTH_FEELING_ERRORS.includes(code) ? code : 'HEALTH_FEELING_WRITE_FAILED' };
    }
};
