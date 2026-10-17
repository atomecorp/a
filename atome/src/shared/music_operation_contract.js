import { APPLE_MUSIC_OPERATION_TYPE } from './apple_music_operation_contract.js';

// Shared receipt shape; provider libraries remain the authority for their contents.
export const MUSIC_OPERATION_TYPE = Object.freeze({ ...APPLE_MUSIC_OPERATION_TYPE, type: 'music_operation', schema: {
    ...APPLE_MUSIC_OPERATION_TYPE.schema,
    request: { ...APPLE_MUSIC_OPERATION_TYPE.schema.request, required: ['action', 'input', 'provider', 'provider_account_id'], properties: {
        ...APPLE_MUSIC_OPERATION_TYPE.schema.request.properties, provider: { type: 'string', enum: ['spotify', 'deezer'] },
        provider_account_id: { type: 'string', minLength: 1, maxLength: 200 }
    } }
} });
