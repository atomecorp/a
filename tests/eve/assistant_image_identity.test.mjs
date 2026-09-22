import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createAssistantMediaSession } from '../../eVe/voice/assistant/assistant_media_session.js';

const PNG_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
const LEGACY_MEDIA_NAME = 'openai-image.png';
const LEGACY_SPEECH_NAME = 'openai-speech.wav';

const createHarness = () => {
    const requests = [];
    const imports = [];
    const env = {
        atob: (value) => Buffer.from(String(value), 'base64').toString('binary'),
        File,
        URL: {
            createObjectURL: () => `blob:assistant_image_identity_${requests.length}`,
            revokeObjectURL: () => {}
        },
        crypto: { randomUUID: () => `reference_${requests.length}_${Math.random().toString(16).slice(2)}` },
        fetch: async () => { throw new Error('assistant_image_identity_fetch_unexpected'); }
    };
    const session = createAssistantMediaSession({
        env,
        actor: () => ({ id: 'assistant_image_identity_suite' }),
        request: async (action, payload) => {
            requests.push({ action, payload });
            return { data: [{ b64_json: PNG_BASE64 }] };
        },
        importFiles: async (options) => {
            imports.push(options);
            return { ok: true, created: 1, results: [{ ok: true, atomeId: 'atome_generated_image' }] };
        }
    });
    return { session, requests, imports, env };
};

const createSpeechHarness = () => {
    const requests = [];
    const env = {
        atob: (value) => Buffer.from(String(value), 'base64').toString('binary'),
        File,
        URL: {
            createObjectURL: () => `blob:assistant_speech_identity_${requests.length}`,
            revokeObjectURL: () => {}
        },
        crypto: { randomUUID: () => `speech_reference_${requests.length}` },
        fetch: async () => { throw new Error('assistant_image_identity_fetch_unexpected'); }
    };
    const session = createAssistantMediaSession({
        env,
        actor: () => ({ id: 'assistant_speech_identity_suite' }),
        request: async (action, payload) => {
            requests.push({ action, payload });
            return action === 'speech' ? { base64: PNG_BASE64, mime: 'audio/wav' } : {};
        }
    });
    return { session, requests };
};

test('a generated image carries a prompt-derived media name, never one shared constant', async () => {
    const chat = createHarness();
    await chat.session.generate({ prompt: 'Un chat sur un toit', previewOnly: true, projectId: 'project_generated' });
    const beach = createHarness();
    await beach.session.generate({ prompt: 'Une plage au coucher du soleil', previewOnly: true, projectId: 'project_generated' });

    assert.equal(chat.requests[0].action, 'image-generate');
    assert.equal(chat.session.snapshot().previewName, 'un_chat_sur_un_toit.png');
    assert.equal(beach.session.snapshot().previewName, 'une_plage_au_coucher_du_soleil.png');
    assert.notEqual(chat.session.snapshot().previewName, LEGACY_MEDIA_NAME);
    assert.notEqual(chat.session.snapshot().previewName, beach.session.snapshot().previewName);
});

test('the applied image keeps the preview identity and the canonical import contract', async () => {
    const harness = createHarness();
    await harness.session.generate({ prompt: 'Un chat sur un toit', previewOnly: true, projectId: 'project_generated' });
    const applied = await harness.session.apply();

    assert.equal(applied?.ok, true);
    assert.equal(harness.imports.length, 1);
    const [entry] = harness.imports[0].entries;
    assert.equal(entry.name, 'un_chat_sur_un_toit.png');
    assert.equal(entry.type, 'image/png');
    assert.equal(harness.imports[0].projectId, 'project_generated');
    assert.equal(harness.imports[0].origin, 'assistant_image');
    assert.equal(harness.imports[0].sourceLayer, 'assistant_image_apply');
    assert.equal(harness.session.snapshot().phase, 'idle');
});

test('an accented prompt still yields one filesystem-safe generated name', async () => {
    const harness = createHarness();
    await harness.session.generate({ prompt: '  Éléphant… à l’aube !! ', previewOnly: true, projectId: 'project_generated' });

    const name = harness.session.snapshot().previewName;
    assert.equal(name, 'elephant_a_l_aube.png');
    assert.match(name, /^[a-z0-9_]+\.png$/);
});

test('a synthesized speech preview derives its name from the spoken text, never one shared constant', async () => {
    const morning = createSpeechHarness();
    await morning.session.processAttachment({ operation: 'speech', project_id: 'project_generated', text: 'Bonjour le monde' });
    const evening = createSpeechHarness();
    await evening.session.processAttachment({ operation: 'speech', project_id: 'project_generated', text: 'Bonne nuit les amis' });

    assert.equal(morning.requests[0].action, 'speech');
    assert.equal(morning.requests[0].payload.input, 'Bonjour le monde');
    assert.equal(morning.session.snapshot().previewName, 'bonjour_le_monde.wav');
    assert.equal(evening.session.snapshot().previewName, 'bonne_nuit_les_amis.wav');
    assert.notEqual(morning.session.snapshot().previewName, LEGACY_SPEECH_NAME);
    assert.notEqual(morning.session.snapshot().previewName, evening.session.snapshot().previewName);
});
