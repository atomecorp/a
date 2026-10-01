import {test} from 'vitest';
import assert from 'node:assert/strict';
import {getProjectWorkMode,setProjectWorkMode} from '../../eVe/domains/rendering/project_work_mode_state.js';
import {resolveContextMenu} from '../../eVe/intuition/menu/context_menu_resolver.js';
test('the Mystic is one constant list in edit, and the project background reads like the rest',()=>{
 const keys=context=>resolveContextMenu({context}).map(item=>item.key);
 const FIXED=['ai','find','capture','import','communicate','dashboard','new_project','copy','paste','delete','play','utilities','info','activity'];
 // Le fond de projet est lisible (2026-09-29) : sa tuile Play pilote le
 // transport du projet entier, la liste y gagne `play` au meme rang.
 assert.deepEqual(keys({type:'project'}),FIXED);
 assert.deepEqual(keys({type:'surface_item'}),FIXED);
 assert.deepEqual(keys({type:'text_field'}),FIXED);
 assert.deepEqual(keys({type:'dashboard'}),FIXED);
 assert.deepEqual(keys({type:'lasso',selected:true}),FIXED);
 assert.deepEqual(keys({type:'tool',tool:'shape'}),FIXED);
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

// L'outil Shape (2026-09-29) : une residence epinglee comme celle de Page et de
// Placeholder, mais son propre catalogue — quatre variantes puis trois
// parametres. Aucun format de page et aucune sorte de placeholder n'y remonte.
const SHAPE_VARIANTS = ['shape_square', 'shape_circle', 'shape_star', 'shape_polygon'];
const SHAPE_PARAMETERS = ['shape_star_branches', 'shape_star_inner_radius', 'shape_polygon_sides'];
const SHAPE_OPTIONS = [...SHAPE_VARIANTS, ...SHAPE_PARAMETERS];

test('characterization: Shape is a pinned rail tool that exposes its own options, and no other', () => {
    assert.ok(CONTEXT_MENUS.vocabulary.tools.includes('shape'), 'shape is a declared tool');
    assert.equal(CONTEXT_MENUS.menus.sidebar.tools.shape.pinned, true, 'Shape resides in the armed-tool rail');
    assert.equal(CONTEXT_MENUS.menus.sidebar.tools.shape.inherits, 'shape');
    assert.equal(resolveToolOptionTable({ tool: 'shape' }).inherits, 'shape');
    // La sorte qu'il herite porte `size` et `couleur` : les deux sont neutralisees,
    // comme pour Page, Placeholder, Code, Generator et Template. La taille d'une
    // forme est celle du geste, sa couleur viendra de sa propre palette.
    for (const removed of ['size', 'couleur']) {
        assert.equal(CONTEXT_MENUS.menus.sidebar.tools.shape.options[removed], null, `Shape removes ${removed}`);
    }
    assert.deepEqual(toolOptions('shape', 'advanced'), SHAPE_OPTIONS,
        'the rail exposes the four variants, then the three parameters');
    for (const key of toolOptions('shape', 'advanced')) {
        assert.ok(!key.startsWith('page_format_'), `${key} is not a page format`);
        assert.ok(!key.startsWith('placeholder_'), `${key} is not a placeholder kind`);
        assert.ok(!['size', 'couleur'].includes(key), `${key} is not an inherited object option`);
    }
    // Les niveaux viennent de la taxonomie, jamais du rail : le carre, le cercle
    // et l'etoile sont accessibles d'emblee, le polygone demande un niveau.
    assert.deepEqual(toolOptions('shape', 'beginner'), ['shape_square', 'shape_circle', 'shape_star']);
    assert.deepEqual(toolOptions('shape', 'intermediate'),
        ['shape_square', 'shape_circle', 'shape_star', 'shape_polygon', 'shape_star_branches', 'shape_polygon_sides']);
});

test('characterization: every Shape option holds the one canonical order, variants before parameters', () => {
    const order = CONTEXT_MENUS.order;
    for (const key of SHAPE_OPTIONS) {
        assert.ok(order.indexOf(key) >= 0, `${key} is declared in the canonical order (indexOf -1 would sort it first)`);
    }
    assert.deepEqual([...SHAPE_OPTIONS].sort((a, b) => order.indexOf(a) - order.indexOf(b)), SHAPE_OPTIONS,
        'the canonical order lists the four variants first, then the parameters');
    for (const key of SHAPE_OPTIONS) {
        const command = CONTEXT_MENUS.commands[key];
        assert.equal(command.option, true, `${key} is declared as an option`);
        assert.deepEqual(command.kinds, ['shape'], `${key} only ever writes a shape`);
        assert.ok(command.kinds.every((kind) => CONTEXT_MENUS.vocabulary.kinds.includes(kind)), `${key} kinds`);
    }
    for (const key of SHAPE_VARIANTS) assert.equal(CONTEXT_MENUS.commands[key].permission, 'create');
    for (const key of SHAPE_PARAMETERS) assert.equal(CONTEXT_MENUS.commands[key].permission, 'create');
});

test('characterization: every Shape and effect label exists in BOTH locales', () => {
    const labelKeys = ['eve.menu.shape_create',
        ...SHAPE_OPTIONS.map((key) => CONTEXT_MENUS.commands[key].labelKey),
        CONTEXT_MENUS.commands.rounding.labelKey,
        CONTEXT_MENUS.commands.shadow.labelKey,
        CONTEXT_MENUS.commands.mask.labelKey];
    for (const labelKey of labelKeys) assert.ok(labelKey.startsWith('eve.'), `${labelKey} uses the canonical prefix`);
    for (const locale of ['fr', 'en']) {
        for (const labelKey of labelKeys) {
            assert.ok(Object.hasOwn(EVE_DEFAULT_MESSAGES[locale], labelKey), `${labelKey} exists in ${locale}`);
            assert.ok(String(EVE_DEFAULT_MESSAGES[locale][labelKey] || '').trim(), `${labelKey} is not empty in ${locale}`);
        }
    }
    // Les quatre variantes portent leur mot, dans chaque langue.
    assert.deepEqual(['square', 'circle', 'star', 'polygon'].map((variant) => [
        EVE_DEFAULT_MESSAGES.fr[`eve.menu.shape_${variant}`], EVE_DEFAULT_MESSAGES.en[`eve.menu.shape_${variant}`]
    ]), [['Carré', 'Square'], ['Cercle', 'Circle'], ['Étoile', 'Star'], ['Polygone', 'Polygon']]);
    assert.deepEqual([[EVE_DEFAULT_MESSAGES.fr['eve.menu.rounding'], EVE_DEFAULT_MESSAGES.en['eve.menu.rounding']],
        [EVE_DEFAULT_MESSAGES.fr['eve.menu.shadow'], EVE_DEFAULT_MESSAGES.en['eve.menu.shadow']],
        [EVE_DEFAULT_MESSAGES.fr['eve.menu.mask'], EVE_DEFAULT_MESSAGES.en['eve.menu.mask']]],
        [['Arrondi', 'Rounding'], ['Ombre', 'Shadow'], ['Masque', 'Mask']]);
});

// La palette d'EDITION d'une forme (2026-09-29) : quand une forme est SELECTIONNEE,
// le rail deplie ses quatre types puis les seuls reglages de la variante qu'elle
// porte. Les cles vivent dans le meme catalogue, donc dans le meme ordre, et
// elles edivent un atome existant (`permission: write`), jamais un outil arme.
const SHAPE_EDIT_KEYS = ['shape_edit', 'shape_edit_square', 'shape_edit_circle', 'shape_edit_star',
    'shape_edit_polygon', 'shape_edit_star_branches', 'shape_edit_star_inner_radius', 'shape_edit_polygon_sides'];
const SHAPE_EDIT_LEVELS = { shape_edit_polygon: 'intermediate', shape_edit_star_branches: 'intermediate',
    shape_edit_star_inner_radius: 'advanced', shape_edit_polygon_sides: 'intermediate' };

test('characterization: a selected shape offers the editing palette, and no other object does', () => {
    const sidebarKeys = (kind) => resolveContextMenu({ menu: 'sidebar',
        context: { type: 'atome', kind, selected: true, mode: 'edit', level: 'advanced',
            permissions: { edit: true, write: true }, records: [{ id: `${kind}_1`, capabilities: { write: true } }] } })
        .map((entry) => entry.key);
    assert.equal(CONTEXT_MENUS.menus.sidebar.objects.shape.shape_edit, 'beginner',
        'the palette is offered by the rail of a shape, at every level');
    assert.ok(sidebarKeys('shape').includes('shape_edit'), 'a selected shape can change its type');
    for (const kind of ['image', 'video', 'audio', 'text', 'svg']) {
        assert.ok(!sidebarKeys(kind).includes('shape_edit'), `${kind} carries no variant to change`);
    }
});

test('characterization: the editing palette is ordered, levelled and translated like its creation tool', () => {
    const variantKeys = SHAPE_EDIT_KEYS.filter((key) => key !== 'shape_edit'
        && !Object.hasOwn(SHAPE_EDIT_LEVELS, key));
    for (const key of SHAPE_EDIT_KEYS) {
        assert.ok(CONTEXT_MENUS.order.indexOf(key) >= 0,
            `${key} is declared in the canonical order (an indexOf of -1 would sort it first)`);
        const command = CONTEXT_MENUS.commands[key];
        assert.equal(command.permission, 'write', `${key} edits an atome that already exists`);
        assert.equal(command.editorial, true, `${key} is an editorial gesture`);
        assert.deepEqual(command.kinds, ['shape'], `${key} only ever writes a shape`);
        assert.ok(!command.option, `${key} is not an option of the armed create tool`);
    }
    // Le genre du carre/cercle/etoile est accessible d'emblee ; le polygone, ses
    // sommets et les branches demandent un niveau, comme a la creation.
    for (const key of variantKeys) assert.equal(CONTEXT_MENUS.menus.sidebar.minLevels[key], undefined, `${key} asks no level`);
    for (const key of Object.keys(SHAPE_EDIT_LEVELS)) {
        assert.equal(CONTEXT_MENUS.menus.sidebar.minLevels[key], SHAPE_EDIT_LEVELS[key], `${key} level`);
        assert.equal(CONTEXT_MENUS.menus.sidebar.minLevels[key],
            CONTEXT_MENUS.menus.sidebar.tools.shape.options[key.replace('shape_edit_', 'shape_')],
            `${key} follows the level the creation tool already declares`);
    }
    // Quatre types d'abord, trois reglages ensuite : l'ordre canonique le dit.
    const positions = SHAPE_EDIT_KEYS.map((key) => CONTEXT_MENUS.order.indexOf(key));
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
    assert.ok(CONTEXT_MENUS.order.indexOf('shape_edit') > CONTEXT_MENUS.order.indexOf('shape_polygon_sides'),
        'the palette comes after the creation options it completes');
    // Parite FR/EN : les huit libelles existent dans les deux langues.
    for (const locale of ['fr', 'en']) {
        for (const key of SHAPE_EDIT_KEYS) {
            const labelKey = CONTEXT_MENUS.commands[key].labelKey;
            assert.ok(Object.hasOwn(EVE_DEFAULT_MESSAGES[locale], labelKey), `${labelKey} exists in ${locale}`);
            assert.ok(String(EVE_DEFAULT_MESSAGES[locale][labelKey] || '').trim(), `${labelKey} is not empty in ${locale}`);
        }
    }
    assert.deepEqual([EVE_DEFAULT_MESSAGES.fr['eve.menu.shape_edit'], EVE_DEFAULT_MESSAGES.en['eve.menu.shape_edit']],
        ['Éditer la forme', 'Edit shape']);
    assert.deepEqual([EVE_DEFAULT_MESSAGES.fr['eve.menu.shape_edit_star_inner_radius'],
        EVE_DEFAULT_MESSAGES.en['eve.menu.shape_edit_star_inner_radius']], ['Rayon interne', 'Inner radius']);
});
