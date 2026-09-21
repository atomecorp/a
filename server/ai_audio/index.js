import { createAudioAiService } from './service.js';
import { createMusicGptProvider } from './providers/musicgpt.js';
import { createMockAudioProvider } from './providers/mock.js';

/**
 * Process-wide AI Audio Service. Registration order is the `auto` routing
 * preference: MusicGPT first, then the mock (probes only).
 */
let service = null;

export const getAudioAiService = ({ env = process.env } = {}) => {
    if (service) return service;
    service = createAudioAiService();
    service.register(createMusicGptProvider({ env }));
    if (env.ATOME_AI_AUDIO_MOCK === '1') service.register(createMockAudioProvider());
    return service;
};

/** Credential ids the server vault accepts, besides OpenAI. */
export const AUDIO_AI_CREDENTIAL_IDS = Object.freeze(['musicgpt']);
