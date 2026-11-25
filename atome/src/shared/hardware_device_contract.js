// Outside devices (R-380, Prises › Matériel): a synth or an effect driven by MIDI, kept as a `hardware_device` atome of
// the person's library (« Les miens »), synced and offline like an instrument (rule 21: the server holds it). Its
// description is the eVe kernel's (hardware_device_schema.js): its ports by name, its channel, its audio send and
// return, its switch and programmes, its controls (CC, 14-bit CC, NRPN, SysEx).
export const HARDWARE_DEVICE_ATOME_TYPE = 'hardware_device';
export const HARDWARE_DEVICE_NAME_MAX = 40;

export const HARDWARE_DEVICE_TYPE = Object.freeze({ type: HARDWARE_DEVICE_ATOME_TYPE, kind: 'data_model', traits: ['data', 'editable'], schema: {
    name: { type: 'string', minLength: 1, maxLength: HARDWARE_DEVICE_NAME_MAX },
    device: { type: 'object', required: ['device_id', 'name', 'midi_out', 'midi_in', 'engage', 'controls'], properties: {
        controls: { type: 'array', items: { type: 'object' } }
    } },
    revision: { type: 'number', minimum: 0 },
    created_at: { type: 'string' },
    access: { type: 'string', enum: ['private'] },
    visibility: { type: 'string', enum: ['private'] }
} });
