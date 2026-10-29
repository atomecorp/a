import { validateParams } from '../ai/agent_gateway_normalize.js';

// The QR code tool: any address or text made into a QR code (atome/src/shared/qr_code.js), shown in its panel (the
// QR code tool, the site panel's « QR code » level) and kept in the person's media as a PNG. One contract for runtime
// V2, AI discovery, voice and direct MCP calls, run by eVe/domains/qr/qr_runtime.js.
export const QR_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'TEXT_TOO_LONG', 'PRESENTATION_UNAVAILABLE', 'AUTH_REQUIRED', 'WRITE_FAILED']);

const text = { type: 'string', minLength: 1, maxLength: 2953, description: 'The address (https://…) or text to encode.' };
const ecc = { type: 'string', enum: ['L', 'M', 'Q', 'H'], description: 'Error correction: L 7 %, M 15 % (default), Q 25 %, H 30 % (raised for free while the size holds).' };
const definitions = {
    make: [{ text, ecc }, ['text'], 'Make the QR code of an address or a text: its version, its size in modules and its picture (an SVG data URL).', false, 'read'],
    open: [{ text: { ...text, minLength: 0 } }, [], 'Open the QR code tool, with an address or a text already typed when given.', false, 'control'],
    keep: [{ text, ecc, name: { type: 'string', maxLength: 120, description: 'The media\'s name; absent: « QR code ».' } }, ['text'],
        'Keep the QR code of an address or a text in the person\'s media, as a PNG image.', true, 'write']
};
export const QR_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `qr.${action}`, action, description, persistent, capability: `qr.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: QR_ERRORS },
        text: { type: 'string' }, version: { type: 'integer' }, size: { type: 'integer' }, ecc: { type: 'string' }, svg: { type: 'string' },
        atome_id: { type: 'string' }, media_url: { type: 'string' } } }
})));
export const validateQrInput = (action, input) => {
    const contract = QR_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const QR_ASSISTANT_INSTRUCTIONS = 'QR code: « fais-moi un QR code de <adresse> » calls qr.open with the text (the QR code tool shows it); « garde ce QR code » calls qr.keep (a PNG in the person\'s media); qr.make gives it without showing anything. The QR code of a published site: site.state gives its address, then qr.open.';
