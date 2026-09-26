import assert from 'node:assert/strict';
import { test, vi } from 'vitest';

const gatewayCalls = [];
vi.mock('../../eVe/intuition/runtime/tool_gateway.js', () => ({
    invokeToolGateway: async (payload) => { gatewayCalls.push(payload); return { ok: true, tool_id: payload?.tool_id }; },
    readExplicitLatched: () => null,
    resolveStranglerFlags: () => ({}),
    warmupToolGatewayRuntime: async () => null
}));

import { buildArmedToolRailDefinitions, invokeArmedToolOption } from '../../eVe/intuition/runtime/eve_intuition/armed_tool_rail_runtime.js';
import { createMainMenuCreateContent } from '../../eVe/intuition/runtime/eve_intuition/main_menu_create_content_runtime.js';
import { buildGeneratorMenuPatch } from '../../eVe/intuition/tools/generator/runtime.js';
import { mergeContentPatch } from '../../eVe/intuition/ribbon/menu_model.js';
import '../../eVe/intuition/tools/generator/index.js';

// The real catalogue the rail reads its look from: the Create content, then the
// generator projection the registry pulses into it — exactly what the app does.
const translate = (key, fallback) => fallback;
const createContent = createMainMenuCreateContent({
    translate,
    createToolId: 'tool.main.create',
    drawToolId: 'tool.main.draw'
});
const { patch: generatorPatch } = buildGeneratorMenuPatch({ translate });
const content = mergeContentPatch(createContent, generatorPatch);

const railOf = (tool, win, catalog = content) => buildArmedToolRailDefinitions({
    tool, projectId: 'rail_project', win, content: catalog
});

test('Page exposes its six formats in canonical order, with only the current one lit', () => {
    const seen = [];
    const win = { eveProjectViewCreationApi: { readPageFormat: () => 'a4' } };
    const definitions = railOf('page', win);
    assert.deepEqual(definitions.map((definition) => definition.key), [
        'page_format_free', 'page_format_sixteen_nine', 'page_format_four_three',
        'page_format_three_two', 'page_format_a4', 'page_format_square'
    ]);
    assert.deepEqual(definitions.filter((definition) => definition.active).map((definition) => definition.key),
        ['page_format_a4'], 'the current format, read from its owner, is the only lit case');
    assert.ok(definitions.every((definition) => definition.toolType === 'standard'));
    assert.ok(definitions.every((definition) => definition.toolId === 'ui.page.create'),
        'every case keeps the page tool as its action owner');

    seen.push('free');
    const beginner = railOf('page', { eveProjectViewCreationApi: { readPageFormat: () => 'free' } });
    assert.deepEqual(beginner.filter((definition) => definition.active).map((definition) => definition.key),
        ['page_format_free'], 'changing the format changes the lit case, nothing here remembers it');
    assert.deepEqual(seen, ['free']);
});

test('Placeholder exposes its six kinds and its two limits, each read from its owner', () => {
    const win = {
        evePlaceholderCreationApi: {
            readChoice: () => 'video',
            readLimits: () => ({ duration_seconds: 12, max_chars: 40 })
        }
    };
    const definitions = railOf('placeholder', win);
    assert.deepEqual(definitions.map((definition) => definition.key), [
        'placeholder_text', 'placeholder_video', 'placeholder_audio', 'placeholder_photo',
        'placeholder_image', 'placeholder_shape', 'placeholder_duration', 'placeholder_max_chars'
    ]);
    assert.deepEqual(definitions.filter((definition) => definition.active).map((definition) => definition.key),
        ['placeholder_video'], 'the current kind is the lit case');
    const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
    assert.deepEqual(definitions.filter((definition) => definition.toolType === 'slider').map((definition) => definition.key),
        ['placeholder_duration', 'placeholder_max_chars']);
    assert.equal(byKey.get('placeholder_duration').sliderValue, 12, 'the limit comes from the placeholder runtime');
    assert.equal(byKey.get('placeholder_max_chars').sliderValue, 40);
    assert.equal(byKey.get('placeholder_duration').sliderUnit, 's');
    assert.equal(byKey.get('placeholder_duration').toolId, 'ui.placeholder.duration.apply',
        'the rail drives the very action the palette slider used');
    assert.equal(byKey.get('placeholder_max_chars').toolId, 'ui.placeholder.max_chars.apply');
});

test('the Generator rail is the registry projection, in its order, with the current run lit', () => {
    const win = { eveGeneratorApi: { readChoice: () => 'audio.ai' } };
    const definitions = railOf('generator', win);
    assert.deepEqual(definitions.map((definition) => definition.key), [
        'generator_run_audio_ai', 'generator_run_video_ai', 'generator_run_image_ai', 'generator_run_vector_ai',
        'generator_run_texture_color_field', 'generator_run_texture_ramp',
        'generator_run_text_title', 'generator_run_text_paragraph'
    ], 'one flat case per registered generator, families replaced by their own generators, in registry order');
    assert.deepEqual(definitions.filter((definition) => definition.active).map((definition) => definition.key),
        ['generator_run_audio_ai']);
    assert.deepEqual(definitions.map((definition) => definition.generatorId), [
        'audio.ai', 'video.ai', 'image.ai', 'vector.ai',
        'texture.color_field', 'texture.ramp', 'text.title', 'text.paragraph'
    ]);
    assert.ok(definitions.every((definition) => definition.toolId === 'ui.generator.run'));
    const other = railOf('generator', { eveGeneratorApi: { readChoice: () => 'text.ramp' } });
    assert.deepEqual(other.filter((definition) => definition.active).map((definition) => definition.key), [],
        'a choice that no longer exists lights nothing');
});

test('Code declares no option, and only a tool whose content declares a list exposes one', () => {
    const win = {};
    assert.deepEqual(railOf('code', win).map((definition) => definition.key), [],
        'the Code editor stays a panel: its rail carries no option case');
    assert.deepEqual(railOf('template', win).map((definition) => definition.key), [],
        'Template has no ribbon entry today: the rail invents nothing');
});

test('a rail case arms its tool through that tool owner, never through a state of its own', async () => {
    const calls = [];
    const win = {
        eveProjectViewCreationApi: {
            setActive: (active, format) => { calls.push(['page', active, format]); return active; }
        },
        evePlaceholderCreationApi: {
            setActive: (active, kind) => { calls.push(['placeholder', active, kind]); return active; }
        },
        eveGeneratorApi: {
            runCase: async (generatorId) => { calls.push(['generator', generatorId]); return { ok: true, generator_id: generatorId }; }
        }
    };
    const [formatCase] = railOf('page', win).filter((definition) => definition.key === 'page_format_square');
    assert.deepEqual(await invokeArmedToolOption('page', formatCase, { payload: {} }, win),
        { ok: true, format: 'square', active: true });
    const [kindCase] = railOf('placeholder', win).filter((definition) => definition.key === 'placeholder_audio');
    assert.deepEqual(await invokeArmedToolOption('placeholder', kindCase, { payload: {} }, win),
        { ok: true, kind: 'audio', active: true });
    const [runCase] = railOf('generator', win).filter((definition) => definition.key === 'generator_run_text_title');
    assert.deepEqual(await invokeArmedToolOption('generator', runCase, { payload: {} }, win),
        { ok: true, generator_id: 'text.title' });
    assert.deepEqual(calls, [['page', true, 'square'], ['placeholder', true, 'audio'], ['generator', 'text.title']]);

    gatewayCalls.length = 0;
    const [limitCase] = railOf('placeholder', win).filter((definition) => definition.key === 'placeholder_duration');
    await invokeArmedToolOption('placeholder', limitCase, { payload: { value: 30 } }, win);
    assert.deepEqual(gatewayCalls.at(-1), {
        tool_id: 'ui.placeholder.duration.apply', event: 'on_change', action: 'apply',
        input: { value: 30 }, presentation: 'ui', source: { type: 'ui', layer: 'armed_tool_rail' }
    }, 'the limit goes to the registered action, exactly like the palette slider');
});
