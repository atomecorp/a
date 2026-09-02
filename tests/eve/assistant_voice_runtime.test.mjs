import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

import { createVoiceInputMeterRuntime, normalizeNativeInputRms } from '../../atome/src/squirrel/voice/service_input_meter.js';
import { normalizeAiProviderError } from '../../atome/src/squirrel/ai/provider_client.js';
import { buildPlannerPrompt, createVoiceAiPlanner } from '../../atome/src/squirrel/voice/ai_planner.js';
import { resolveVoiceExecutionBridge } from '../../atome/src/squirrel/voice/orchestrator_bridge.js';
import { localizeExecutionError } from '../../atome/src/squirrel/voice/home_surface_i18n.js';
import {
    applyHintedSpeechCorrections,
    collectSpeechHints,
    normalizeSpeechConfidence,
    resolvePreferredSpeechVoice,
    selectBestSpeechCandidate
} from '../../atome/src/squirrel/voice/service_speech.js';
import { sanitizeVoiceDiagnostic, writeVoiceDiagnostic } from '../../atome/src/squirrel/voice/telemetry.js';
import { installUserProfileRuntimeBridge } from '../../eVe/domains/user/profile_api.js';

test('native microphone normalization reveals quiet speech and keeps the membrane bounded', () => {
    const silence = normalizeNativeInputRms(0.0016, 0);
    const quiet = normalizeNativeInputRms(0.0024, 0);
    const strong = normalizeNativeInputRms(0.12, quiet);
    const released = normalizeNativeInputRms(0, strong);
    assert.equal(silence, 0);
    assert.ok(quiet > 0.1);
    assert.ok(strong > quiet);
    assert.ok(strong <= 1);
    assert.ok(released < strong);
    assert.ok(released >= 0);
});

test('native microphone state becomes active only after the first real audio frame and closes cleanly', async () => {
    const events = [];
    const frames = [];
    let audioLevelHandler = null;
    let unlistened = false;
    const env = {
        __TAURI__: {
            stt: {
                start() { },
                onAudioLevel(handler) {
                    audioLevelHandler = handler;
                    return () => { unlistened = true; };
                }
            }
        },
        console: { info() { } }
    };
    const meter = createVoiceInputMeterRuntime({
        env,
        sttProvider: 'tauri_plugin_stt',
        sessionRuntime: { publishEvent: (sessionId, type, payload) => events.push({ sessionId, type, payload }) }
    });
    meter.subscribe((frame) => frames.push(frame));

    await meter.start('voice_meter_session', { purpose: 'user_turn' });
    assert.equal(events.at(-1).payload.state, 'armed');
    audioLevelHandler({ rms: 0.08 });
    assert.equal(events.at(-1).payload.state, 'active');
    assert.equal(frames.at(-1).active, true);

    await meter.stop('voice_meter_session');
    assert.equal(unlistened, true);
    assert.equal(frames.at(-1).active, false);
    assert.equal(events.at(-1).payload.state, 'stopped');
});

test('profile runtime bridge prepares the product-owned vault before returning the AI profile', async () => {
    const owner = {};
    let prepared = false;
    installUserProfileRuntimeBridge(owner, {
        loader: async () => ({ ok: true, userId: 'user_profile_ai', profile: {} }),
        prepare: ({ userId }) => {
            prepared = userId === 'user_profile_ai';
            return { ok: true };
        }
    });

    const result = await owner.__eveLoadUserProfile();
    assert.equal(prepared, true);
    assert.equal(result.ok, true);
    assert.equal(result.userId, 'user_profile_ai');
});

test('profile runtime bridge preserves a vault preparation failure', async () => {
    const owner = {};
    installUserProfileRuntimeBridge(owner, {
        loader: async () => ({ ok: true, userId: 'user_profile_ai', profile: {} }),
        prepare: () => ({ ok: false, error: 'home_vault_setup_failed' })
    });

    const result = await owner.__eveLoadUserProfile();
    assert.equal(result.ok, false);
    assert.equal(result.error, 'home_vault_setup_failed');
});

test('French speech never forces an incompatible system voice', () => {
    const englishVoice = { name: 'Samantha', voiceURI: 'Samantha', lang: 'en-US', default: true, localService: true };
    const frenchVoice = { name: 'Thomas', voiceURI: 'Thomas', lang: 'fr-FR', default: false, localService: true };

    assert.equal(resolvePreferredSpeechVoice({ getVoices: () => [englishVoice] }, { lang: 'fr-FR' }), null);
    assert.equal(resolvePreferredSpeechVoice({ getVoices: () => [englishVoice, frenchVoice] }, { lang: 'fr-FR' }), frenchVoice);
});

test('voice diagnostics preserve requests and redact every secret field', () => {
    const lines = [];
    const nativeLines = [];
    const nativeRecords = [];
    const env = {
        console: { info: (line) => lines.push(line) },
        webkit: { messageHandlers: { console: { postMessage: (line) => nativeLines.push(line) } } },
        __TAURI_INTERNALS__: { invoke: (command, payload) => nativeRecords.push({ command, payload }) }
    };
    const record = writeVoiceDiagnostic(env, 'voice.test', {
        utterance: 'mets le cercle en rouge',
        apiKey: 'forbidden',
        completion_tokens: 24,
        nested: { authorization: 'forbidden', result: 'done' }
    });
    assert.equal(record.utterance, 'mets le cercle en rouge');
    assert.equal(record.apiKey, '[redacted]');
    assert.equal(record.completion_tokens, 24);
    assert.equal(record.nested.authorization, '[redacted]');
    assert.equal(sanitizeVoiceDiagnostic({ password: 'forbidden' }).password, '[redacted]');
    assert.equal(lines.length, 1);
    assert.ok(lines[0].startsWith('[voice-trace] '));
    assert.equal(lines[0].includes('forbidden'), false);
    assert.deepEqual(nativeLines, lines);
    assert.equal(nativeRecords[0].command, 'log_from_webview');
    assert.equal(nativeRecords[0].payload.payload.component, 'voice');
    assert.equal(JSON.stringify(nativeRecords[0]).includes('forbidden'), false);
});

test('speech candidate selection uses real alternatives and product hints', () => {
    const selected = selectBestSpeechCandidate([
        { text: 'ouvre at home', confidence: 0.82 },
        { text: 'ouvre Atome', confidence: 0.74 }
    ], ['Atome']);
    assert.equal(selected.text, 'ouvre Atome');
    assert.equal(selected.confidence, 0.74);
});

test('Vosk score normalization lets a visible text hint resolve close alternatives', () => {
    const selected = selectBestSpeechCandidate([
        { text: "déplace l'atome texte allo de 300 pixels à droite", confidence: 72.86 },
        { text: "déplace l'atome texte hello de 300 pixels à droite", confidence: 71.04 }
    ], ['Atome', 'hello']);

    assert.ok(Math.abs(normalizeSpeechConfidence(72.86) - (72.86 / 102.86)) < 0.000001);
    assert.equal(selected.text, "déplace l'Atome texte hello de 300 pixels à droite");
    assert.equal(selected.confidence, 71.04);
    assert.equal(selected.selection_reason, 'semantic_hint');
    assert.ok(selected.alternatives.every((entry) => Number.isFinite(entry.normalized_confidence)));
});

test('speech hints use word boundaries and repair bounded visible-name movement confusions', () => {
    const falseMatch = selectBestSpeechCandidate([
        { text: 'le veiller', confidence: 80 },
        { text: 'eh oui', confidence: 79 }
    ], ['eVe']);
    const corrected = applyHintedSpeechCorrections(
        'déplace le texte yellow de trois piscines vers la droite',
        ['Atome', 'eVe', 'text', 'hello']
    );

    assert.equal(falseMatch.text, 'le veiller');
    assert.deepEqual(falseMatch.matched_hints, []);
    assert.equal(falseMatch.selection_reason, 'normalized_confidence');
    assert.equal(corrected, 'déplace le texte hello de trois cents pixels vers la droite');
});

test('speech hints include the bounded canonical inventory of visible user atomes', () => {
    const env = {
        __currentProject: { id: 'project_voice' },
        __selectedAtomeIds: ['text_hello'],
        eveToolBase: {
            getProjectSceneState: () => ({
                records: [
                    {
                        id: 'text_hello',
                        type: 'text',
                        properties: { text: 'hello', left: 120, top: 80 }
                    },
                    {
                        id: '__eve_internal_overlay',
                        type: 'text',
                        properties: { text: 'must-not-be-a-hint', ephemeral: true }
                    }
                ]
            })
        }
    };

    const hints = collectSpeechHints(env, null, null);
    assert.ok(hints.includes('hello'));
    assert.ok(hints.includes('text'));
    assert.equal(hints.includes('must-not-be-a-hint'), false);
});

test('scene hints filter overlays before the bound and retain a selected px-positioned text', () => {
    const overlays = Array.from({ length: 140 }, (_, index) => ({
        id: `__eve_overlay_${index}`,
        type: 'text',
        properties: { text: `overlay-${index}`, ephemeral: true }
    }));
    const env = {
        __currentProject: { id: 'project_voice' },
        __selectedAtomeIds: ['text_hello'],
        eveToolBase: {
            getProjectSceneState: () => ({
                records: [
                    ...overlays,
                    { id: 'text_other', type: 'text', properties: { text: 'other', left: '20px', top: '30px' } },
                    { id: 'text_hello', type: 'text', properties: { text: 'hello', left: '120px', top: '80px' } }
                ]
            })
        }
    };

    const hints = collectSpeechHints(env, null, null);
    assert.ok(hints.includes('hello'));
    assert.equal(hints.some((hint) => hint.startsWith('overlay-')), false);
});

test('the desktop STT manifest authorizes prepare_model before first listening', () => {
    const buildScript = fs.readFileSync('platforms/desktop-tauri/vendor/tauri-plugin-stt/build.rs', 'utf8');
    const permissions = fs.readFileSync('platforms/desktop-tauri/vendor/tauri-plugin-stt/permissions/default.toml', 'utf8');
    const pluginRuntime = fs.readFileSync('platforms/desktop-tauri/vendor/tauri-plugin-stt/src/lib.rs', 'utf8');
    const desktopRuntime = fs.readFileSync('platforms/desktop-tauri/vendor/tauri-plugin-stt/src/desktop.rs', 'utf8');
    const serviceRuntime = fs.readFileSync('atome/src/squirrel/voice/service.js', 'utf8');

    assert.match(buildScript, /"prepare_model"/);
    assert.match(permissions, /"allow-prepare-model"/);
    assert.doesNotMatch(pluginRuntime, /SQUIRREL_STT_PRELOAD_LANGUAGE|std::thread::spawn/);
    assert.doesNotMatch(serviceRuntime, /void stt\.prepare/);
    assert.match(desktopRuntime, /start_listening[\s\S]*ensure_model\(config\.language\.as_deref\(\)\)/);
});

test('planner context is single-copy, schema-only, and protected by a size ceiling', () => {
    const prompt = buildPlannerPrompt({
        utterance: 'déplace le texte hello de 300 px vers la droite',
        locale: 'fr-FR',
        context: {
            conversation_history: [{ user: 'bonjour', assistant: 'bonjour' }],
            project_scene: {
                project: { id: 'project_voice' },
                atomes: [{ id: 'text_hello', type: 'text', text: 'unique-scene-marker', position: { left: 120, top: 80 } }]
            }
        },
        runtimeTools: [{
            tool_id: 'ui.move',
            description: 'Move an Atome.',
            actions: ['move.relative'],
            parameters: {
                type: 'object',
                properties: { delta_x: { type: 'number' } },
                required: ['delta_x'],
                internal_runtime_dump: { forbidden: true }
            },
            runtime: { huge: 'must-not-be-forwarded' }
        }],
        atomeAiTools: [{ name: 'mail', description: 'Mail actions', parameters: { type: 'object', properties: {} }, implementation: 'forbidden' }]
    });

    assert.equal(prompt.split('unique-scene-marker').length - 1, 1);
    assert.equal(prompt.includes('\nCONTEXT:\n'), false);
    assert.equal(prompt.includes('must-not-be-forwarded'), false);
    assert.equal(prompt.includes('internal_runtime_dump'), false);
    assert.ok(prompt.length < 30000, `planner prompt too large: ${prompt.length}`);
});

test('planner catalog ranks the relevant late tool and stays bounded with 149 registered tools', () => {
    const tools = Array.from({ length: 149 }, (_, index) => ({
        tool_id: index === 148 ? 'mail.search' : `ui.unrelated.${index}`,
        name: index === 148 ? 'mail' : `unrelated.${index}`,
        description: index === 148 ? 'Search mail messages.' : 'Unrelated project operation.',
        actions: ['pointer.click'],
        parameters: {
            type: 'object',
            properties: Object.fromEntries(Array.from({ length: 12 }, (_entry, propertyIndex) => [
                `field_${propertyIndex}`,
                { type: 'string', description: 'A deliberately verbose parameter description.' }
            ]))
        }
    }));
    const prompt = buildPlannerPrompt({
        utterance: 'cherche un mail',
        locale: 'fr-FR',
        runtimeTools: tools,
        atomeAiTools: tools
    });

    assert.ok(prompt.includes('mail.search'));
    assert.ok(prompt.includes('"name":"mail"'));
    assert.ok(prompt.length < 30000, `ranked planner prompt too large: ${prompt.length}`);
});

test('MCP diagnostics keep traceable summaries instead of nested catalog dumps', async () => {
    const lines = [];
    const tools = Array.from({ length: 120 }, (_, index) => ({
        tool_id: `ui.tool.${index}`,
        actions: ['pointer.click'],
        parameters: { type: 'object', properties: { huge: { description: 'x'.repeat(500) } } }
    }));
    const env = {
        console: { info: (line) => lines.push(line) },
        handleAtomeMCPRequestAsync: async () => ({ jsonrpc: '2.0', id: 1, result: { tools } })
    };
    const bridge = resolveVoiceExecutionBridge(env);

    assert.equal((await bridge.listRuntimeTools()).length, 120);
    const responseLine = lines.find((line) => line.includes('voice.mcp.response'));
    const record = JSON.parse(responseLine.slice('[voice-trace] '.length));
    assert.equal(record.tools_count, 120);
    assert.equal('result' in record, false);
    assert.ok(responseLine.length < 4000);
});

test('the existing organic shader applies bounded B+C motion only to real listening input', () => {
    const shader = fs.readFileSync('atome/renderers/bevy-core/src/assets/shaders/procedural_sdf.wgsl', 'utf8');

    assert.match(shader, /let listening_response = smoothstep\(0\.015, 0\.42, listening_rms\);/);
    assert.match(shader, /let listening_contour = listening_response \*/);
    assert.match(shader, /listening_band \* core_mask \* listening_response \* core_reveal/);
    assert.match(shader, /listening_response \* 0\.028/);
    assert.equal(shader.includes('listening_contour = listening_rms *'), false);
});

test('the AI planner grounds a relative move to hello and blocks an ambiguous scene', async () => {
    const env = {
        console: { info() { } },
        Squirrel: {
            security: {
                vaultStatus: () => ({ configured: true }),
                readToken: async () => ({ ok: true, value: { apiKey: 'test-key' } })
            }
        }
    };
    let providerCalls = 0;
    const planner = createVoiceAiPlanner({
        env,
        loadProfile: async () => ({
            ok: true,
            userId: 'voice-user',
            profile: { passkeys: { keys: [{ provider: 'openai', model: 'gpt-4.1-mini', active: true }] } }
        }),
        fetchImpl: async () => { providerCalls += 1; throw new Error('provider_must_not_run_for_explicit_move'); }
    });
    const options = {
        locale: 'fr-FR',
        runtime_tools: [{
            tool_id: 'ui.move',
            actions: ['move.relative'],
            parameters: { type: 'object', properties: { atome_id: { type: 'string' } } }
        }]
    };
    const unique = await planner.planUtterance('déplace le texte hello de 300 px vers la droite', {
        ...options,
        context: { project_scene: { atomes: [{ id: 'text_hello', type: 'text', text: 'hello' }] } }
    });
    const noisy = await planner.planUtterance('déplace le texte yellow de trois piscines vers la droite', {
        ...options,
        context: { project_scene: { atomes: [{ id: 'text_hello', type: 'text', text: 'hello' }] } }
    });
    const ambiguous = await planner.planUtterance('déplace le texte hello de 300 px vers la droite', {
        ...options,
        context: {
            project_scene: {
                atomes: [
                    { id: 'text_hello', type: 'text', text: 'hello' },
                    { id: 'text_hello_2', type: 'text', text: 'hello' }
                ]
            }
        }
    });

    assert.equal(unique.execution.target, 'runtime_v2');
    assert.equal(unique.execution.toolchain[0].input.atome_id, 'text_hello');
    assert.equal(unique.execution.toolchain[0].input.delta_x, 300);
    assert.equal(noisy.execution.toolchain[0].input.atome_id, 'text_hello');
    assert.equal(noisy.execution.toolchain[0].input.delta_x, 300);
    assert.equal(noisy.execution.toolchain[0].input.delta_y, 0);
    assert.equal(ambiguous.execution.target, 'none');
    assert.equal(ambiguous.status, 'ambiguous');
    assert.equal(ambiguous.context.scene_grounding_error, 'scene_target_ambiguous');
    assert.equal(providerCalls, 0);
});

test('provider and MCP failures keep specific actionable codes and messages', () => {
    const timeout = normalizeAiProviderError(new Error('provider_timeout'));
    const authentication = normalizeAiProviderError(new Error('HTTP 401 unauthorized'));
    const invalid = normalizeAiProviderError(new Error('invalid_json_response'));

    assert.equal(timeout.code, 'provider_timeout');
    assert.match(timeout.user_message, /20 secondes/);
    assert.equal(authentication.code, 'provider_auth_failed');
    assert.match(authentication.user_message, /clé IA/);
    assert.equal(invalid.code, 'provider_invalid_response');
    assert.match(invalid.user_message, /réponse invalide/);
    assert.match(localizeExecutionError('voice_mcp_bridge_unavailable', 'fr-FR'), /pont sécurisé/);
});
