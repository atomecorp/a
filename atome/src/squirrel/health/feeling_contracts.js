import { validateParams } from '../ai/agent_gateway_normalize.js';
import { healthAccessAllowedNow } from './health_actor_gate.js';
import { HEALTH_FEELING_LEVELS, HEALTH_FEELING_MOMENTS, HEALTH_FEELING_MOODS, HEALTH_FEELING_NOTE_MAX } from '../../shared/health_feeling_contract.js';

// One contract for runtime V2, AI discovery and direct MCP calls: the person says how they feel (Forme, Force, Humeur,
// #health_feeling.js), from the end of a session, a rest, the morning or the voice. The assistant writes what the
// person says; it never reads a feeling back. `health_feeling.open` shows the feeling's rows on the Dashboard (the morning's
// question, the Résultats card) through the presentation the Dashboard registers.
export const HEALTH_FEELING_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'HEALTH_FEELING_WRITE_FAILED', 'HEALTH_FEELING_NOT_FOUND', 'PRESENTATION_UNAVAILABLE',
    'health_access_denied_for_actor']);
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
}), Object.freeze({
    name: 'health_feeling.clear', action: 'clear', persistent: true, capability: 'health_feeling.write',
    description: 'Delete the feeling the user said on a civil day (day YYYY-MM-DD): Forme, Force and Humeur of that day. The user\'s own, from their screen: an assistant or MCP caller is refused (health_access_denied_for_actor).',
    input_schema: { type: 'object', additionalProperties: false, required: ['day'], properties: { day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } } },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: HEALTH_FEELING_ERRORS },
        day: { type: 'string' } } }
}), Object.freeze({
    name: 'health_feeling.open', action: 'open', persistent: false, capability: 'health_feeling.open',
    description: 'Show the user\'s feeling rows (« Comment te sens-tu ? »: Forme, Force, Humeur) on the Dashboard so they fill them in themselves. Writes nothing and reads nothing back.',
    input_schema: { type: 'object', additionalProperties: false, properties: {} },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: HEALTH_FEELING_ERRORS } } }
})]);
export const validateHealthFeelingInput = (action, input) => {
    const contract = HEALTH_FEELING_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const HEALTH_FEELING_ASSISTANT_INSTRUCTIONS = 'Feeling: « je suis en pleine forme » calls health_feeling.set with form { level: 5 }; « je me sens fébrile » strength { level: 1 }; « je suis fatigué et un peu stressé » mood { moods: [fatigue, stress] }; words that fit no level or mood go to note. « je veux dire comment je me sens » calls health_feeling.open. Never say how the user felt: the assistant does not read feelings.';

// The Dashboard's stage registers what shows the feeling's rows (#eVe/domains/dashboard/dashboard_feeling_panel.js).
let presentation = null;
export const registerHealthFeelingPresentation = handler => { presentation = handler; return () => { if (presentation === handler) presentation = null; }; };

/** The service executor of the family (eVe/intuition/tools/core/tool_runtime_service_commands.js). The answer holds the
 *  day only: what was felt is never handed back to the caller. */
export const HEALTH_FEELING_CONFIRMED_COMMANDS = Object.freeze(['health_feeling.clear']);
// A health delete is the person's own, from their screen (as health_record.entry_remove): never an assistant's or MCP's.
const personOnScreen = payload => payload?.source?.type === 'ui' && payload?.presentation !== 'mcp' && healthAccessAllowedNow();
export const executeHealthFeelingCommand = async (action, input = {}, payload = {}) => {
    if (action === 'open') return presentation ? presentation(input) : { ok: false, error: 'PRESENTATION_UNAVAILABLE' };
    if (action === 'clear' && !personOnScreen(payload)) return { ok: false, error: 'health_access_denied_for_actor' };
    const { getHealthOwner } = await import('./index.js');
    try {
        if (action === 'clear') return await getHealthOwner().feeling.clear(input.day);
        const { day } = await getHealthOwner().feeling.set({ moment: 'day', ...input });
        return { ok: true, day };
    } catch (error) {
        const code = error?.code || error?.message;
        return { ok: false, error: HEALTH_FEELING_ERRORS.includes(code) ? code : 'HEALTH_FEELING_WRITE_FAILED' };
    }
};
