import {test} from 'vitest';
import assert from 'node:assert/strict';
import {getProjectWorkMode,setProjectWorkMode} from '../../eVe/domains/rendering/project_work_mode_state.js';
import {resolveContextMenu} from '../../eVe/intuition/menu/context_menu_resolver.js';
test('project and surface actions remain distinct after migration',()=>{
 const keys=type=>resolveContextMenu({context:{type}}).slice(5).map(item=>item.key);
 assert.deepEqual(keys('project'),['paste','audio','video','photo','import','record_actions','info']);
 assert.deepEqual(keys('surface_item'),['rename','duplicate','copy','paste','delete','info']);
});
test('characterization: all three modes are project-scoped; legacy consume is rejected',async()=>{
 const windowRef={__eveWorkspaceMode:{mode:'project',projectId:'context_characterization'}};
 await assert.rejects(setProjectWorkMode('consume',{windowRef,prepare:async()=>({ok:true})}),/project_work_mode_invalid/);
 await setProjectWorkMode('consultation',{windowRef,prepare:async()=>({ok:true})});assert.equal(getProjectWorkMode('context_characterization'),'consultation');
 assert.equal(getProjectWorkMode('other'),'edit');
 await setProjectWorkMode('performance',{windowRef,prepare:async()=>({ok:true})});assert.equal(getProjectWorkMode('context_characterization'),'performance');
 assert.equal(getProjectWorkMode('other'),'edit');await setProjectWorkMode('edit',{windowRef,prepare:async()=>({ok:true})});
});

import { CONTEXT_MENUS, loadContextMenus, validateContextMenus } from '../../eVe/intuition/menu/context_menus_loader.js';
import { resolveToolOptionTable } from '../../eVe/intuition/menu/context_menu_resolver.js';
import { EVE_DEFAULT_MESSAGES } from '../../eVe/i18n/languages.js';

const PAGE_FORMAT_OPTIONS = ['page_format_free', 'page_format_sixteen_nine', 'page_format_four_three',
    'page_format_three_two', 'page_format_a4', 'page_format_square'];
const PLACEHOLDER_OPTIONS = ['placeholder_text', 'placeholder_video', 'placeholder_audio', 'placeholder_photo',
    'placeholder_image', 'placeholder_shape', 'placeholder_duration', 'placeholder_max_chars'];
const toolOptions = (tool, level) => resolveContextMenu({
    menu: 'sidebar', context: { type: 'tool', tool, level, mode: 'edit', permissions: {} }
}).map((entry) => entry.key);

test('characterization: the taxonomy declares the residence of every pinned creation tool', () => {
    for (const tool of ['text', 'draw']) {
        assert.equal(CONTEXT_MENUS.menus.sidebar.tools[tool].pinned, true, `${tool} was already pinned`);
    }
    // Code, Page, Placeholder, Generator and Template used to resolve no rail at
    // all: `readArmedTool` only looks at tools the taxonomy declares.
    for (const tool of ['code', 'page', 'placeholder', 'generator', 'template']) {
        assert.ok(CONTEXT_MENUS.vocabulary.tools.includes(tool), `${tool} is a declared tool`);
        assert.equal(CONTEXT_MENUS.menus.sidebar.tools[tool].pinned, true, `${tool} resides in the rail`);
        assert.ok(CONTEXT_MENUS.vocabulary.kinds.includes(CONTEXT_MENUS.menus.sidebar.tools[tool].inherits),
            `${tool} inherits an existing kind, never a new one`);
    }
    // Each tool re-declares its own options: the inherited kind is only an anchor,
    // and the inherited object options that are not the tool's are removed.
    for (const tool of ['code', 'page', 'placeholder', 'generator', 'template']) {
        for (const removed of ['size', 'couleur']) {
            assert.equal(CONTEXT_MENUS.menus.sidebar.tools[tool].options[removed], null, `${tool} removes ${removed}`);
        }
    }
    assert.equal(resolveToolOptionTable({ tool: 'page' }).inherits, 'shape');
    assert.equal(resolveToolOptionTable({ tool: 'generator' }).inherits, 'group');
});

test('characterization: Page and Placeholder expose their options to the rail, Code and Generator none', () => {
    assert.deepEqual(toolOptions('page', 'beginner'), PAGE_FORMAT_OPTIONS);
    assert.deepEqual(toolOptions('placeholder', 'beginner'), PLACEHOLDER_OPTIONS);
    assert.deepEqual(toolOptions('code', 'advanced'), [], 'the Code editor stays a panel: no rail option');
    assert.deepEqual(toolOptions('generator', 'advanced'), [],
        'the generator list is projected by its registry, never duplicated in the taxonomy');
    assert.deepEqual(toolOptions('template', 'advanced'), []);
    // Every option is a real `option` command of an existing kind — no new vocabulary.
    for (const key of [...PAGE_FORMAT_OPTIONS, ...PLACEHOLDER_OPTIONS]) {
        const command = CONTEXT_MENUS.commands[key];
        assert.equal(command.option, true, `${key} is declared as an option`);
        assert.ok(command.kinds.every((kind) => CONTEXT_MENUS.vocabulary.kinds.includes(kind)), `${key} kinds`);
        assert.ok(PAGE_FORMAT_OPTIONS.includes(key) || PLACEHOLDER_OPTIONS.includes(key));
    }
    for (const key of ['placeholder_duration', 'placeholder_max_chars']) {
        assert.equal(CONTEXT_MENUS.commands[key].permission, 'write', `${key} writes a limit`);
    }
    for (const key of PAGE_FORMAT_OPTIONS) assert.equal(CONTEXT_MENUS.commands[key].permission, 'create');
    // The rail orders its cases by the one canonical order (R4).
    const order = CONTEXT_MENUS.order;
    assert.deepEqual([...PAGE_FORMAT_OPTIONS].sort((a, b) => order.indexOf(a) - order.indexOf(b)), PAGE_FORMAT_OPTIONS);
    assert.deepEqual([...PLACEHOLDER_OPTIONS].sort((a, b) => order.indexOf(a) - order.indexOf(b)), PLACEHOLDER_OPTIONS);
});

test('characterization: the declared options already carry translated labels in both locales', () => {
    for (const locale of ['fr', 'en']) {
        for (const key of [...PAGE_FORMAT_OPTIONS, ...PLACEHOLDER_OPTIONS]) {
            const labelKey = CONTEXT_MENUS.commands[key].labelKey;
            assert.ok(labelKey.startsWith('eve.'), `${key} uses the canonical prefix`);
            assert.ok(Object.hasOwn(EVE_DEFAULT_MESSAGES[locale], labelKey), `${labelKey} exists in ${locale}`);
        }
    }
});

test('characterization: the loader validates the real catalogue and still refuses an undeclared tool', async () => {
    const loaded = await loadContextMenus({ data: CONTEXT_MENUS });
    assert.deepEqual(loaded.vocabulary.tools, CONTEXT_MENUS.vocabulary.tools);
    const undeclared = structuredClone(CONTEXT_MENUS);
    undeclared.vocabulary.tools = undeclared.vocabulary.tools.filter((tool) => tool !== 'page');
    assert.throws(() => validateContextMenus(undeclared), /context_menus_tool_unknown:page/);
    const unpinned = structuredClone(CONTEXT_MENUS);
    unpinned.menus.sidebar.tools.page.options.page_format_a4 = null;
    assert.deepEqual(validateContextMenus(unpinned).menus.sidebar.tools.page.options.page_format_a4, null,
        'a level or null stays a valid option entry');
});
