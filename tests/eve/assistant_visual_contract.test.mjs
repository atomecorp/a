import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { buildAssistantConversationNodes } from '../../eVe/voice/assistant/assistant_conversation_view.js';
import { createAssistantDock, resolveAssistantDockGeometry } from '../../eVe/voice/assistant/assistant_dock.js';
import { installDom, findNode, createRuntimeHarness } from './bevy_ui_main_menu_test_helpers.mjs';
import { createEveAssistantRuntime } from '../../eVe/voice/assistant/assistant_runtime.js';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
    assistantMorphForVowel,
    assistantRevealAt,
    assistantTransitionAt,
    assistantUniforms,
    buildAssistantVisualRecord
} from '../../eVe/voice/assistant/assistant_visual_contract.js';
import { isEphemeralProjectSceneRecord } from '../../eVe/domains/rendering/project_scene_record_projection.js';
import { normalizeWorkspaceSceneRecord } from '../../eVe/domains/rendering/workspace_scene_layers.js';
import { BEVY_MENU_TOKENS } from '../../eVe/intuition/ribbon/bevy_ui_menu_surface.js';
import { inlineAccessorySlotX } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_inline_search.js';
import { eveT } from '../../eVe/i18n/i18n.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('assistant visual contract defines deterministic vowel morphs', () => {
    const morphs = ['A', 'E', 'I', 'O', 'U'].map(assistantMorphForVowel);
    assert.equal(new Set(morphs.map((morph) => morph.join(','))).size, 5);
    const speaking = assistantUniforms({ phase: 'speaking', vowel: 'A', rms: 1, elapsedMs: 800 });
    assert.equal(speaking.phase, 4);
    assert.equal(speaking.intensity, 1);
    assert.ok(speaking.pulse <= 0.1);
    assert.equal(speaking.listening_rms, 0);
    const listening = assistantUniforms({ phase: 'listening', listeningRms: 0.6, listeningActive: true, elapsedMs: 800 });
    assert.equal(listening.listening_rms, 0.6);
    const bargeIn = assistantUniforms({ phase: 'speaking', listeningRms: 0.4, listeningActive: true, elapsedMs: 800 });
    assert.equal(bargeIn.listening_rms, 0.4);
    const idleStart = assistantUniforms({ morph: [1, 1, 0, 0], elapsedMs: 0 });
    const idleLater = assistantUniforms({ morph: [1, 1, 0, 0], elapsedMs: 800 });
    assert.notStrictEqual(idleStart.morph, idleLater.morph);
    assert.notDeepEqual(idleStart.morph, idleLater.morph);
});

test('assistant visibility transitions are continuous at every timing boundary', () => {
    assert.equal(assistantTransitionAt({ transition: 'appearing', elapsedMs: 0 }), 0);
    assert.ok(assistantTransitionAt({ transition: 'appearing', elapsedMs: 419 }) < 1);
    assert.equal(assistantTransitionAt({ transition: 'appearing', elapsedMs: 420 }), 1);
    assert.ok(assistantTransitionAt({ transition: 'settling', elapsedMs: 90 }) <= 1.015);
    assert.equal(assistantTransitionAt({ transition: 'settling', elapsedMs: 180 }), 1);
    assert.ok(assistantTransitionAt({ transition: 'disappearing', elapsedMs: 319 }) > 0);
    assert.equal(assistantTransitionAt({ transition: 'disappearing', elapsedMs: 320 }), 0);
});

test('assistant reveal choreography orders glow, core and shell at exact boundaries', () => {
    assert.deepEqual(assistantRevealAt({ transition: 'appearing', elapsedMs: 0 }), { glow: 0, core: 0, shell: 0 });
    assert.ok(assistantRevealAt({ transition: 'appearing', elapsedMs: 70 }).glow > 0);
    assert.equal(assistantRevealAt({ transition: 'appearing', elapsedMs: 70 }).core, 0);
    assert.equal(assistantRevealAt({ transition: 'appearing', elapsedMs: 140 }).glow, 1);
    assert.equal(assistantRevealAt({ transition: 'appearing', elapsedMs: 140 }).shell, 0);
    assert.ok(assistantRevealAt({ transition: 'appearing', elapsedMs: 150 }).core > 0);
    assert.equal(assistantRevealAt({ transition: 'appearing', elapsedMs: 150 }).shell, 0);
    assert.equal(assistantRevealAt({ transition: 'appearing', elapsedMs: 330 }).core, 1);
    assert.ok(assistantRevealAt({ transition: 'appearing', elapsedMs: 419 }).shell < 1);
    assert.deepEqual(assistantRevealAt({ transition: 'appearing', elapsedMs: 420 }), { glow: 1, core: 1, shell: 1 });
});

test('assistant global transition boundaries map 0, 419, 420, 599, 600 and 920 ms deterministically', () => {
    const at = (elapsedMs) => {
        if (elapsedMs < 420) return assistantTransitionAt({ transition: 'appearing', elapsedMs });
        if (elapsedMs < 600) return assistantTransitionAt({ transition: 'settling', elapsedMs: elapsedMs - 420 });
        if (elapsedMs < 920) return assistantTransitionAt({ transition: 'disappearing', elapsedMs: elapsedMs - 600 });
        return 0;
    };
    assert.equal(at(0), 0);
    assert.ok(at(419) < 1);
    assert.equal(at(420), 1);
    assert.ok(at(599) > 1);
    assert.equal(at(600), 1);
    assert.equal(at(920), 0);
});

test('assistant requires the Atome icon anchor and uses the shared menu projection', () => {
    const record = buildAssistantVisualRecord({ surfaceSize: { width: 1280, height: 720 }, anchorRect: { left: 1200, top: 650, width: 50, height: 50 }, phase: 'listening' });
    const normalized = normalizeWorkspaceSceneRecord(record);
    assert.equal(normalized.properties.layer, 'mainMenu');
    assert.throws(() => buildAssistantVisualRecord({ surfaceSize: { width: 1280, height: 720 } }), /assistant_atome_anchor_required/);
    assert.equal(isEphemeralProjectSceneRecord(record), true);
    assert.equal(record.properties.left, 0);
    assert.equal(record.properties.top, 0);
    assert.equal(record.properties.width, 1280);
    assert.equal(record.properties.height, 720);
    assert.deepEqual(record.properties.material.procedural.surface_size, [1280, 720]);
    assert.equal(record.properties.material.procedural.assistant_size, 45);
    assert.deepEqual(record.properties.material.procedural.assistant_center, [1225, 45]);
});

test('each level emits exactly N equal-cadence idle pulses in the six-slot cycle', () => {
    for (let level = 1; level <= 5; level++) {
        const pulses = Array.from({ length: 6 }, (_, slot) => assistantUniforms({ level, elapsedMs: slot * 700 + 350 }).pulse);
        assert.equal(pulses.filter(value => value > 0).length, level);
        for (const pulse of pulses.filter(value => value > 0)) assert.equal(pulse, 0.06);
        assert.equal(assistantUniforms({ level, elapsedMs: 350, reducedMotion: true }).pulse, 0);
    }
});

test('reduced motion stops idle animation and redraws an explicit level change', async () => {
    const frames = new Map(), renders = [], subscriptions = new Map();
    const events = { addEventListener: (type, handler) => subscriptions.set(type, handler),
        removeEventListener: (type, handler) => { assert.equal(subscriptions.get(type), handler); subscriptions.delete(type); } };
    let time = 0, sequence = 0;
    const runtime = createEveAssistantRuntime({
        dockFactory: () => ({ open: async()=>{}, close: async()=>{}, refresh:()=>{}, blur:()=>{} }),
        env: { ...events, matchMedia: () => ({ matches: true, ...events }) },
        providerResolver: async () => ({ ok: true, providerId: 'local' }),
        voiceApiResolver: () => ({ orchestrator: { bridge: { kind: 'mcp' } }, ensureReady: async()=>true,
            createSession: async()=>({session_id:'visual'}), subscribe:()=>()=>{}, subscribeTtsFrames:()=>()=>{}, subscribeInputFrames:()=>()=>{},
            speak: async()=>({promise:Promise.resolve()}), startListening:async()=>({promise:new Promise(()=>{})}),
            stopListening:async()=>{}, cancelListening:async()=>{}, executeUtterance:async()=>{}, interrupt:async()=>{}, stopSpeaking:async()=>{} }),
        now: () => time, requestFrame: callback => { frames.set(++sequence, callback); return sequence; },
        cancelFrame: id => frames.delete(id), renderScene: async value => renders.push(value),
        clearScene: async () => {}, commandBus: { append() {} }, translate: key => key
    });
    const advance = async () => {
        time += 1000;
        const pending = [...frames.values()]; frames.clear();
        pending.forEach(callback => callback());
        await new Promise(resolve => setTimeout(resolve, 0));
    };
    await runtime.open();
    await advance(); await advance();
    assert.equal(runtime.getState().transition, 'visible');
    runtime.focusText();
    await runtime.listen();
    assert.equal(runtime.getState().microphoneActive, false);
    assert.equal(runtime.getState().error, '');
    await advance();
    assert.equal(frames.size, 0);
    const previous = renders.length;
    runtime.selectLevel(3);
    assert.equal(frames.size, 1);
    await advance(); await advance();
    assert.equal(frames.size, 0);
    assert.ok(renders.length >= previous + 1 && renders.length <= previous + 2);
    assert.equal(renders.at(-1).reducedMotion, true);
    assert.equal(renders.at(-1).level, 3);
    const closing = runtime.close();
    const reopening = runtime.toggle();
    await advance(); await closing; await reopening;
    assert.equal(runtime.getState().active, true);
    assert.ok(['connecting', 'appearing'].includes(runtime.getState().transition));
    const finalClose = runtime.close(); await advance(); await finalClose;
    await runtime.listen();
    assert.equal(runtime.getState().active, false);
    await runtime.dispose();
    assert.equal(subscriptions.size, 0);
});


test('dock shares the footer corner and opens text only on long-press intent', async () => {
    const dom = installDom();
    dom.dom.reconfigure({ url: 'http://localhost:3001/' });
    const trees = [], calls = [];
    let inputMode = 'voice';
    const api = {
        getState: () => ({ active: true, inputMode, microphoneActive: inputMode === 'voice' }),
        focusText: () => { if (inputMode !== 'text') calls.push('pause'); inputMode = 'text'; },
        listen: async () => { inputMode = 'voice'; calls.push('listen'); },
        close: () => calls.push('close'),
        sendText: async text => { calls.push('send:' + text); return { ok: true }; },
        toggleInput: () => dock.toggleInput()
    };
    dom.window.eveBevyUiRuntime = {
        mountTree: async ({ tree }) => trees.push(tree),
        updateTree: async ({ tree }) => trees.push(tree),
        unmountTree: async () => calls.push('unmount')
    };
    const dock = createAssistantDock({ env: dom.window, api: () => api });
    try {
        // The assistant always opens in the bottom-right corner of the project
        // surface, whichever gesture opened it: the button it grows from is there.
        const g = resolveAssistantDockGeometry({ width: 960, height: 720 });
        assert.equal(g.anchorRect.left, 960 - g.size);
        assert.equal(g.anchorRect.top, 720 - g.size - BEVY_MENU_TOKENS.toolGapPx);
        // The history sits on the inner side of the input row and bottom-aligns
        // with it, so the dock reads as one surface.
        assert.equal(g.historyPosition[0], -g.historyWidth);
        assert.equal(g.historyPosition[1], -(g.historyHeight - g.size));
        await dock.open();
        // Opening hands over the dock's own surface: the input box and its four
        // accessory squares — send, the conversations, the reasoning level and
        // the microphone — are there from the first frame, so the corner button
        // never opens a mute conversation.
        assert.ok(findNode(trees.at(-1).root, 'assistant_prompt_field'), 'the input box opens with the assistant');
        assert.ok(findNode(trees.at(-1).root, 'assistant_prompt_accessory_submit'));
        assert.ok(findNode(trees.at(-1).root, 'assistant_prompt_accessory_history'));
        assert.ok(findNode(trees.at(-1).root, 'assistant_prompt_accessory_level'));
        assert.ok(findNode(trees.at(-1).root, 'assistant_prompt_accessory_microphone'));
        const mic = () => findNode(trees.at(-1).root, 'assistant_prompt_accessory_microphone');
        const micGlyph = () => findNode(trees.at(-1).root, 'assistant_prompt_accessory_microphone_icon');
        assert.ok(mic());
        // The live voice session lights the microphone and shows its glyph.
        assert.equal(micGlyph().image.source, './assets/images/icons/microphone.svg');
        assert.equal(findNode(trees.at(-1).root, 'assistant_listening_slash'), null);

        // The hold on the handle is the writing intent: the row that is already
        // there takes the caret and the session leaves the voice lane.
        await dock.toggleInput();
        assert.equal(inputMode, 'text');
        await new Promise(resolve => setTimeout(resolve, 250));
        assert.equal(findNode(trees.at(-1).root, 'assistant_listening_indicator'), null);
        // Typing pauses the microphone, so its square reads muted.
        assert.equal(micGlyph().image.source, './assets/images/icons/mute.svg');
        const input = findNode(trees.at(-1).root, 'assistant_prompt_field');
        assert.ok(input);
        assert.ok(input.style.size[0] > 250);
        input.on.activate();
        await dock.refresh();
        assert.equal(inputMode, 'text');
        assert.ok(findNode(trees.at(-1).root, 'assistant_prompt_caret'));
        const editor = dom.document.activeElement;
        assert.ok(editor.isContentEditable || editor.getAttribute('contenteditable') === 'true' || editor.tagName === 'TEXTAREA');

        // The microphone square is the way back: activating it turns the live
        // input on and the row stays in place.
        await mic().on.activate();
        assert.equal(inputMode, 'voice');
        assert.equal(micGlyph().image.source, './assets/images/icons/microphone.svg');
        assert.deepEqual(calls, ['pause', 'listen']);
        const icon = findNode(trees.at(-1).root, 'assistant_close');
        icon.on.press({ x: 930, y: 690 });
        await new Promise(resolve => setTimeout(resolve, 560));
        icon.on.release();
        icon.on.activate();
        assert.equal(inputMode, 'text');
        assert.deepEqual(calls, ['pause', 'listen', 'pause']);
        await new Promise(resolve => setTimeout(resolve, 250));
        findNode(trees.at(-1).root, 'assistant_prompt_field').on.activate();
        icon.on.press({ x: 930, y: 690 });
        icon.on.release();
        icon.on.activate();
        assert.equal(calls.at(-1), 'close');
        const activeEditor = dom.document.activeElement;
        activeEditor.value = 'Bonjour';
        activeEditor.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        await dock.refresh();
        assert.equal(findNode(trees.at(-1).root, 'assistant_prompt_text').text, 'Bonjour');
        activeEditor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(calls.filter(call => call === 'send:Bonjour').length, 1);
        const listensBeforeClose = calls.filter(call => call === 'listen').length;
        await dock.close();
        assert.equal(calls.filter(call => call === 'listen').length, listensBeforeClose);
        assert.notEqual(dom.document.activeElement, activeEditor);
    } finally { await dock.close(); dom.restore(); }
});

test('assistant history reveals the last message on open and survives a close', async () => {
    const dom = installDom();
    dom.dom.reconfigure({ url: 'http://localhost:3001/' });
    const trees = [], reveals = [], unmounts = [];
    let microphoneActive = false;
    const turns = [
        { role: 'user', text: 'Bonjour' },
        { role: 'assistant', text: 'Salut' },
        { role: 'user', text: 'Une question' },
        { role: 'assistant', text: 'Une reponse' }
    ];
    const api = {
        getState: () => ({ active: true, microphoneActive, conversation: { turns } }),
        focusText: () => { microphoneActive = false; },
        listen: async () => { microphoneActive = true; },
        sendText: async () => ({ ok: true }),
        toggle: () => null,
        toggleInput: () => dock.toggleInput()
    };
    dom.window.eveBevyUiRuntime = {
        mountTree: async ({ tree }) => trees.push(tree),
        updateTree: async ({ tree }) => trees.push(tree),
        revealTreeNode: async payload => reveals.push(payload),
        unmountTree: async id => unmounts.push(id)
    };
    const dock = createAssistantDock({ env: dom.window, api: () => api });
    try {
        await dock.open();
        // One row per message inside one shared scroll area: the column is what
        // lets the dock land on the last message instead of a blind block.
        const history = findNode(trees.at(-1).root, 'assistant_history');
        assert.ok(history);
        assert.equal(history.style.overflow, 'scroll_y');
        assert.ok(findNode(trees.at(-1).root, 'assistant_history_turn_0'));
        assert.ok(findNode(trees.at(-1).root, 'assistant_history_turn_3'));
        assert.equal(findNode(trees.at(-1).root, 'assistant_history_turn_4'), null);
        assert.deepEqual(reveals.at(-1), { id: 'eve_bevy_ui_assistant', nodeId: 'assistant_history_turn_3',
            marginPx: BEVY_MENU_TOKENS.unitScalePx(8) });
        // Reading back through older messages is never yanked by an unrelated
        // refresh: the reveal only follows a NEW turn.
        const revealed = reveals.length;
        await dock.refresh();
        assert.equal(reveals.length, revealed);
        // Folding the assistant keeps the conversation: the history is state,
        // not the painted tree, so reopening shows the same messages.
        const painted = trees.length;
        await dock.close();
        assert.deepEqual(unmounts, ['eve_bevy_ui_assistant']);
        assert.equal(trees.length, painted);
        await dock.open();
        assert.equal(findNode(trees.at(-1).root, 'assistant_history_turn_3').text, 'Assistant: Une reponse');
        assert.equal(reveals.length, revealed + 1);
    } finally { await dock.close(); dom.restore(); }
});

test('assistant microphone square turns the live input on, lights it, then cuts it', async () => {
    const dom = installDom();
    dom.dom.reconfigure({ url: 'http://localhost:3001/' });
    const trees = [];
    let microphoneActive = false;
    const api = {
        getState: () => ({ active: true, microphoneActive }),
        focusText: () => { microphoneActive = false; },
        listen: async () => { microphoneActive = true; },
        sendText: async () => ({ ok: true }),
        toggle: () => null,
        toggleInput: () => dock.toggleInput()
    };
    dom.window.eveBevyUiRuntime = {
        mountTree: async ({ tree }) => trees.push(tree),
        updateTree: async ({ tree }) => trees.push(tree),
        unmountTree: async () => {}
    };
    const dock = createAssistantDock({ env: dom.window, api: () => api });
    try {
        await dock.open();
        await dock.toggleInput();
        assert.equal(microphoneActive, false);
        const square = () => findNode(trees.at(-1).root, 'assistant_prompt_accessory_microphone');
        const glyph = () => findNode(trees.at(-1).root, 'assistant_prompt_accessory_microphone_icon');
        const send = () => findNode(trees.at(-1).root, 'assistant_prompt_accessory_submit');
        assert.equal(glyph().image.source, './assets/images/icons/mute.svg');
        const mutedFill = [...square().style.background];
        // The square is the shared accessory, so its own activation is the
        // ordinary one: it turns the live input on without a second gesture.
        await square().on.activate();
        assert.equal(microphoneActive, true);
        assert.equal(glyph().image.source, './assets/images/icons/microphone.svg');
        // Live reads differently BOTH ways — glyph and lit fill — so a muted
        // microphone can never be mistaken for a live one.
        assert.notDeepEqual(square().style.background, mutedFill);
        assert.notDeepEqual(square().style.background, send().style.background);
        // The very same square cuts the microphone: the session leaves the voice
        // lane, so glyph and fill both read muted again. A live square can never
        // survive the click that silenced it.
        await square().on.activate();
        assert.equal(microphoneActive, false);
        assert.equal(glyph().image.source, './assets/images/icons/mute.svg');
        assert.deepEqual(square().style.background, mutedFill);
    } finally { await dock.close(); dom.restore(); }
});

test('assistant level square unfolds the shared reasoning palette and applies the level', async () => {
    const dom = installDom();
    dom.dom.reconfigure({ url: 'http://localhost:3001/' });
    const trees = [], levels = [];
    let level = 1, refusal = '', microphoneActive = true;
    const api = {
        getState: () => ({ active: true, microphoneActive, conversation: { turns: [], level } }),
        focusText: () => { microphoneActive = false; }, listen: async () => {},
        // The shared command leaves the voice lane itself, exactly like the
        // runtime: the dock must repaint the microphone from the new state
        // instead of leaving a lit square behind.
        selectLevel: value => { if (refusal) throw new Error(refusal); api.focusText(); levels.push(value); level = value; },
        sendText: async () => ({ ok: true }), toggle: () => null,
        toggleInput: () => dock.toggleInput()
    };
    dom.window.eveBevyUiRuntime = {
        mountTree: async ({ tree }) => trees.push(tree),
        updateTree: async ({ tree }) => trees.push(tree),
        unmountTree: async () => {}
    };
    const dock = createAssistantDock({ env: dom.window, api: () => api });
    const node = id => findNode(trees.at(-1).root, id);
    try {
        await dock.open();
        assert.equal(node('assistant_level_menu'), null);
        await node('assistant_prompt_accessory_level').on.activate();
        // The palette unfolds from its own square, above the row, and it is the
        // shared choice control: five levels, never a second list written here.
        const menu = node('assistant_level_menu');
        assert.ok(menu);
        // The square and its glyph are real assets, not a key that paints nothing.
        assert.equal(node('assistant_prompt_accessory_level_icon').image.source, './assets/images/icons/equalizer.svg');
        assert.ok(existsSync(resolve(process.cwd(), 'atome/src/assets/images/icons/equalizer.svg')));
        assert.ok(menu.style.position[1] < 0, 'the palette unfolds above the input row');
        const g = resolveAssistantDockGeometry({ width: 960, height: 720 });
        assert.equal(menu.style.position[0], inlineAccessorySlotX({ itemSize: g.size, width: g.width,
            iconOffsetX: g.iconX, placement: 'far', index: 1 }));
        // The palette is glued to the square that opened it — the far group reads
        // the conversations, that palette and then the microphone.
        const levelX = node('assistant_prompt_accessory_level').style.position[0];
        assert.ok(levelX >= menu.style.position[0] && levelX - menu.style.position[0] < g.size);
        for (const value of ['1', '2', '3', '4', '5']) assert.ok(node('assistant_level_menu_options_' + value));
        // The level that is running is the row the shared radio already reads as
        // chosen, so the palette never opens on a wrong reading.
        assert.ok(node('assistant_level_menu_options_1_indicator_dot'));
        assert.equal(node('assistant_level_menu_options_3_indicator_dot'), null);
        assert.equal(node('assistant_prompt_accessory_microphone_icon').image.source, './assets/images/icons/microphone.svg');
        assert.deepEqual(levels, []);
        await node('assistant_level_menu_options_3').on.activate();
        assert.deepEqual(levels, [3]);
        assert.equal(level, 3);
        // Moving the level leaves the voice lane: the microphone square is
        // repainted muted, so it can never stay lit on a stopped input.
        assert.equal(node('assistant_prompt_accessory_microphone_icon').image.source, './assets/images/icons/mute.svg');
        // A valid choice applies at once and the palette folds back.
        assert.equal(node('assistant_level_menu'), null);
        await node('assistant_prompt_accessory_level').on.activate();
        assert.ok(node('assistant_level_menu_options_3_indicator_dot'));
        // A refusal travels as a notice instead of a thrown error: the palette
        // stays under the finger and says why.
        refusal = 'conversation_busy';
        await node('assistant_level_menu_options_5').on.activate();
        assert.deepEqual(levels, [3]);
        assert.ok(node('assistant_level_menu'));
        assert.equal(node('assistant_level_menu_notice').text, eveT('eve.voice.assistant.error.conversation_busy', ''));
        refusal = '';
    } finally { await dock.close(); dom.restore(); }
});

test('assistant history square hides and shows the conversations column', async () => {
    const dom = installDom();
    dom.dom.reconfigure({ url: 'http://localhost:3001/' });
    const trees = [], reveals = [];
    const turns = [{ role: 'user', text: 'Bonjour' }, { role: 'assistant', text: 'Salut' }];
    const api = {
        getState: () => ({ active: true, microphoneActive: false, conversation: { turns } }),
        focusText: () => {}, listen: async () => {}, sendText: async () => ({ ok: true }),
        toggle: () => null, toggleInput: () => dock.toggleInput()
    };
    dom.window.eveBevyUiRuntime = {
        mountTree: async ({ tree }) => trees.push(tree),
        updateTree: async ({ tree }) => trees.push(tree),
        revealTreeNode: async payload => reveals.push(payload),
        unmountTree: async () => {}
    };
    const dock = createAssistantDock({ env: dom.window, api: () => api });
    const node = id => findNode(trees.at(-1).root, id);
    try {
        await dock.open();
        assert.ok(node('assistant_history'));
        assert.equal(node('assistant_prompt_accessory_history_icon').image.source, './assets/images/icons/time.svg');
        assert.ok(existsSync(resolve(process.cwd(), 'atome/src/assets/images/icons/time.svg')));
        const onOpen = reveals.length;
        const square = () => findNode(trees.at(-1).root, 'assistant_prompt_accessory_history');
        const shownFill = [...square().style.background];
        await square().on.activate();
        // Hiding the column is a view change: the messages stay in the runtime,
        // which is why the dock can be folded and reopened on them.
        assert.equal(node('assistant_history'), null);
        assert.equal(node('assistant_history_turn_0'), null);
        assert.equal(reveals.length, onOpen);
        // The square carries its own state: hidden reads unlit, shown reads lit.
        assert.notDeepEqual(square().style.background, shownFill);
        await square().on.activate();
        assert.ok(node('assistant_history'));
        assert.deepEqual(square().style.background, shownFill);
        // Showing it again lands on the last message, exactly like opening it.
        assert.equal(reveals.length, onOpen + 1);
        assert.equal(reveals.at(-1).nodeId, 'assistant_history_turn_1');
        assert.equal(node('assistant_history_turn_1').text, 'Assistant: Salut');
    } finally { await dock.close(); dom.restore(); }
});

test('empty assistant text surface adds no model, status, budget or unused options', () => {
    const nodes = buildAssistantConversationNodes({ width: 400, itemSize: 60, iconOffsetX: 340, zIndex: 2,
        api: { getState: () => ({ active: true, phase: 'listening', inputMode: 'voice',
            conversation: { model: 'configured-model', turns: [], budget: { budget_state: 'available' } } }) } });
    assert.deepEqual(nodes, []);
});
