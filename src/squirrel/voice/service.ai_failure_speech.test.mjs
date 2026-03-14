import assert from 'node:assert/strict';

import { createVoiceService } from './service.js';

class FakeSpeechSynthesisUtterance {
    constructor(text) {
        this.text = text;
        this.lang = '';
        this.onend = null;
        this.onerror = null;
    }
}

class FakeSpeechSynthesis {
    constructor() {
        this.spoken = [];
        this.cancelled = false;
    }

    getVoices() {
        return [{ name: 'system-en', voiceURI: 'system-en' }];
    }

    cancel() {
        this.cancelled = true;
    }

    speak(utterance) {
        this.spoken.push({
            text: utterance.text,
            lang: utterance.lang
        });
        queueMicrotask(() => {
            utterance.onend?.();
        });
    }
}

const synth = new FakeSpeechSynthesis();
const env = {
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    speechSynthesis: synth,
    eveI18n: {
        getLocale() {
            return 'en-US';
        }
    }
};

const service = createVoiceService({
    env,
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_fail_speech',
                utterance: { raw: utterance },
                locale: options.locale || 'en-US',
                type: 'ambiguous',
                domain: 'unknown',
                action: 'unknown',
                status: 'failed',
                assistant_reply: 'The AI is not responding.',
                context: { ai_error: 'provider_timeout' },
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            };
        }
    }
});

const session = service.runtime.createSession({
    session_id: 'voice_ai_failure_session'
});

const result = await service.executeUtterance('Open my project', {
    session_id: session.session_id,
    locale: 'en-US'
});

assert.equal(result.ok, false, 'voice service should preserve ai failures');
assert.equal(result.spoken_reply, 'The AI is not responding.', 'voice service should expose the spoken error reply');
assert.equal(synth.spoken.at(-1)?.text, 'The AI is not responding.', 'voice service should speak provider failures instead of leaving them silent');
assert.equal(synth.spoken.at(-1)?.lang, 'en-US', 'voice service should speak failures in the active locale');

console.log('voice_service_ai_failure_speech: ok');
