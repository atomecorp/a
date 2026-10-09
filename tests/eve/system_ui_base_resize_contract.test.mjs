// One base change must resize the whole framework UI: list rows, panel rows and
// accordions, Dashboard cells, Matrix tiles, and the glyphs, labels and chrome
// that sit on them. This contract measures the same owners twice, once at the
// authored base unit and once at an alternate one, in an isolated copy of eVe so
// the alternate base cannot leak into the running suite.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYSTEM_UI_METRICS } from '../../eVe/elements/system_ui_tokens.js';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;
const AUTHORED_BASE = SYSTEM_UI_METRICS.unitPx;
const ALTERNATE_BASE = 90;
const ALTERNATE_RATIO = ALTERNATE_BASE / AUTHORED_BASE;

// Lengths that are deliberately not on the base grid: a pill radius only has to
// be large enough to look round at any size.
const OFF_GRID_SENTINEL_PX = 999;
// Owners exempt from the ratio rule because they hold that sentinel; each is
// asserted on its own instead of being silently dropped from the measurement.
const OFF_GRID_OWNERS = new Set(['commonRadiusPill']);

const PROBE = `
import { SYSTEM_UI_METRICS, SYSTEM_UI_PANEL_CHROME_METRICS } from './eVe/elements/system_ui_tokens.js';
import { EVE_TOOL_SKIN_TOKENS } from './eVe/elements/skin/tool_skin.js';
import { EVE_BUTTON_SKIN_TOKENS } from './eVe/elements/skin/button_skin.js';
import { resolveBevyMainMenuItemSize } from './eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { RIBBON_TOKENS } from './eVe/intuition/ribbon/tokens.js';
import { BEVY_PANEL_TOKENS } from './eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { createDashboardLayout } from './eVe/domains/dashboard/dashboard_layout.js';
import { DASHBOARD_VISUAL_TOKENS, resolveDashboardBlockUnitSize } from './eVe/domains/dashboard/dashboard_tokens.js';
import { MATRIX_VISUAL_METRICS } from './eVe/intuition/matrix/visual/matrix_visual_tokens.js';
import { projectViewRowGeometry } from './eVe/domains/rendering/project_view_surface_layout.js';
import { EVE_COMMON_SKIN_TOKENS } from './eVe/elements/skin/tokens.js';
import { buildMainMenuNotificationNodes } from './eVe/intuition/ribbon/bevy_ui_main_menu_notification.js';

const layout = createDashboardLayout({
    width: 1200,
    height: 900,
    categories: [{ id: 'news', color: '#9f2f2f', order: 0, icon_id: 'news', label_key: 'news' }],
    itemsByCategory: new Map(),
    tokens: DASHBOARD_VISUAL_TOKENS
});
const row = projectViewRowGeometry(760);
// A notification badge is read off a ribbon item, so its fixture is expressed
// in base units: the probe measures the framework, never its own constants.
const notification = buildMainMenuNotificationNodes({
    itemSize: EVE_TOOL_SKIN_TOKENS.metrics.toolboxSquareSizePx,
    width: EVE_TOOL_SKIN_TOKENS.metrics.toolboxSquareSizePx * (200 / 60),
    iconOffsetX: 0,
    summary: 'unread',
    count: 3
});
console.log(JSON.stringify({
    lengths: {
        toolSquare: EVE_TOOL_SKIN_TOKENS.metrics.toolboxSquareSizePx,
        bevyMenuTool: EVE_TOOL_SKIN_TOKENS.bevyMenu.toolSizePx,
        ribbonTool: resolveBevyMainMenuItemSize(),
        ribbonToolSize: RIBBON_TOKENS.toolSizePx,
        footerChrome: SYSTEM_UI_PANEL_CHROME_METRICS.heightPx,
        listRow: row.rowHeight,
        listRowUnit: row.fixedColumns.unit,
        panelInput: BEVY_PANEL_TOKENS.inputHeightPx,
        panelActionButton: BEVY_PANEL_TOKENS.actionButton.heightPx,
        panelAccordionHeader: BEVY_PANEL_TOKENS.accordion.headerHeightPx,
        panelAccordionBody: BEVY_PANEL_TOKENS.accordion.bodyHeightPx,
        panelAccordionChevron: BEVY_PANEL_TOKENS.accordion.chevronSizePx,
        panelTableHeader: BEVY_PANEL_TOKENS.table.headerHeightPx,
        panelTableRow: BEVY_PANEL_TOKENS.table.rowHeightPx,
        panelSelectControl: BEVY_PANEL_TOKENS.select.controlHeightPx,
        panelSelectOption: BEVY_PANEL_TOKENS.select.optionHeightPx,
        panelSegmented: BEVY_PANEL_TOKENS.segmentedControl.heightPx,
        panelNumericField: BEVY_PANEL_TOKENS.numericField.heightPx,
        panelScopeChip: BEVY_PANEL_TOKENS.scopeChip.heightPx,
        panelCalendarAgendaRow: BEVY_PANEL_TOKENS.calendar.agendaRowHeightPx,
        panelControlText: BEVY_PANEL_TOKENS.controlTextSizePx,
        panelBodyText: BEVY_PANEL_TOKENS.bodyTextSizePx,
        panelInputWidth: BEVY_PANEL_TOKENS.inputWidthPx,
        buttonHeight: EVE_BUTTON_SKIN_TOKENS.bevyButton.sizePx,
        buttonRowHeight: EVE_BUTTON_SKIN_TOKENS.bevyButton.rowHeightPx,
        buttonLabelText: EVE_BUTTON_SKIN_TOKENS.bevyButton.labelFontSizePx,
        dashboardCell: layout.block_unit_size,
        dashboardUnitWidth: layout.unit_width,
        dashboardBlockUnit: resolveDashboardBlockUnitSize(DASHBOARD_VISUAL_TOKENS),
        dashboardLabelText: DASHBOARD_VISUAL_TOKENS.labelText.font_size,
        matrixCell: MATRIX_VISUAL_METRICS.cellSizePx,
        matrixGap: MATRIX_VISUAL_METRICS.cellGapPx,
        matrixContainerPadding: MATRIX_VISUAL_METRICS.containerPaddingPx,
        matrixTileFont: MATRIX_VISUAL_METRICS.tileFontSizePx,
        matrixTileLabel: MATRIX_VISUAL_METRICS.labelFontSizePx,
        matrixAddIcon: MATRIX_VISUAL_METRICS.addIconSizePx,
        matrixTileRadius: MATRIX_VISUAL_METRICS.tileRadiusPx,
        commonRadiusXs: EVE_COMMON_SKIN_TOKENS.radius.xs,
        commonRadiusSm: EVE_COMMON_SKIN_TOKENS.radius.sm,
        commonRadiusMd: EVE_COMMON_SKIN_TOKENS.radius.md,
        commonRadiusLg: EVE_COMMON_SKIN_TOKENS.radius.lg,
        commonRadiusPill: EVE_COMMON_SKIN_TOKENS.radius.pill,
        commonLabelShadowBlur: EVE_COMMON_SKIN_TOKENS.shadow.label.blur,
        commonLabelShadowOffsetY: EVE_COMMON_SKIN_TOKENS.shadow.label.offsetY,
        surfaceShadowBlur: EVE_COMMON_SKIN_TOKENS.bevy.systemSurface.shadow.blur,
        panelMaterialShadowBlur: BEVY_PANEL_TOKENS.material.shadow.blur,
        panelControlShadowBlur: BEVY_PANEL_TOKENS.controlMaterial.shadow.blur,
        panelActionShadowBlur: BEVY_PANEL_TOKENS.actionButton.shadow.blur,
        panelActionFocusSpread: BEVY_PANEL_TOKENS.actionButton.focusShadow.spread,
        panelInputFocusSpread: BEVY_PANEL_TOKENS.input.focusShadow.spread,
        panelSelectFocusSpread: BEVY_PANEL_TOKENS.select.focusShadow.spread,
        buttonFocusSpread: EVE_BUTTON_SKIN_TOKENS.bevyButton.focusShadow.spread,
        toolboxRowRadius: EVE_TOOL_SKIN_TOKENS.toolbox.rowRadiusPx,
        subtoolBorderRadius: EVE_TOOL_SKIN_TOKENS.metrics.subtoolBorderRadiusPx,
        dashboardContentRadius: DASHBOARD_VISUAL_TOKENS.metrics.contentRadius,
        dashboardLabelShadowBlur: DASHBOARD_VISUAL_TOKENS.labelText.shadow_blur,
        notificationBadge: notification[2].style.size[0],
        notificationBadgeFont: notification[2].style.font_size,
        notificationRadius: notification[2].style.radius
    }
}));
`;

let authoredLengths = null;

let alternate = null;
let sandbox = null;

beforeAll(() => {
    sandbox = mkdtempSync(join(REPO_ROOT, 'temp/eve-base-resize-'));
    cpSync(join(REPO_ROOT, 'eVe'), join(sandbox, 'eVe'), { recursive: true, filter: path => !/(?:^|\/)(?:\.git|node_modules|assets|documentations)(?:\/|$)/.test(path) });
    cpSync(join(REPO_ROOT, 'package.json'), join(sandbox, 'package.json'));
    symlinkSync(join(REPO_ROOT, 'atome'), join(sandbox, 'atome'), 'dir');
    writeFileSync(join(sandbox, 'probe.mjs'), PROBE);
    authoredLengths = JSON.parse(execFileSync(process.execPath, [join(sandbox, 'probe.mjs')], { encoding: 'utf8' })).lengths;
    const tokensPath = join(sandbox, 'eVe/elements/system_ui_tokens.js');
    const tokensSource = readFileSync(tokensPath, 'utf8');
    const declaration = /SYSTEM_UI_TOOL_UNIT_PX = \d+;/;
    expect(declaration.test(tokensSource), 'the base owner must declare the unit once').toBe(true);
    writeFileSync(tokensPath, tokensSource.replace(declaration, `SYSTEM_UI_TOOL_UNIT_PX = ${ALTERNATE_BASE};`));
    const stdout = execFileSync(process.execPath, [join(sandbox, 'probe.mjs')], { encoding: 'utf8' });
    alternate = JSON.parse(stdout);
}, 60000);

afterAll(() => {
    if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

const scale = (value) => (value * ALTERNATE_BASE) / AUTHORED_BASE;

describe('System UI base resize contract', () => {
    it('resizes every measured owner by exactly the base ratio', () => {
        for (const [name, authored] of Object.entries(authoredLengths)) {
            if (OFF_GRID_OWNERS.has(name)) continue;
            expect(alternate.lengths[name], `${name} must follow the base`).toBeCloseTo(scale(authored), 6);
        }
    });

    it('keeps the declared ratios at the alternate base', () => {
        expect(alternate.lengths.listRow).toBe(alternate.lengths.toolSquare);
        expect(alternate.lengths.panelAccordionHeader).toBe(alternate.lengths.toolSquare);
        expect(alternate.lengths.panelInput).toBe(alternate.lengths.toolSquare / 2);
        expect(alternate.lengths.dashboardCell).toBe(alternate.lengths.toolSquare * 2);
        expect(alternate.lengths.matrixCell).toBe(alternate.lengths.toolSquare * 2);
    });

    it('resizes the labels and glyphs with their own surface', () => {
        expect(alternate.lengths.panelControlText).toBeGreaterThan(authoredLengths.panelControlText);
        expect(alternate.lengths.panelBodyText).toBeGreaterThan(authoredLengths.panelBodyText);
        expect(alternate.lengths.dashboardLabelText).toBeGreaterThan(authoredLengths.dashboardLabelText);
        expect(alternate.lengths.matrixTileLabel).toBeGreaterThan(authoredLengths.matrixTileLabel);
        expect(alternate.lengths.buttonLabelText).toBeGreaterThan(authoredLengths.buttonLabelText);
    });

    it('resizes the shadows and radii a surface is drawn with, not only its box', () => {
        // A box that follows the base while its corner and drop shadow do not is
        // still a frozen surface: the whole paint must move together.
        for (const name of ['surfaceShadowBlur', 'panelMaterialShadowBlur', 'panelControlShadowBlur',
            'panelActionShadowBlur', 'buttonFocusSpread', 'panelActionFocusSpread', 'panelInputFocusSpread',
            'panelSelectFocusSpread', 'commonRadiusXs', 'commonRadiusSm', 'commonRadiusMd', 'commonRadiusLg',
            'commonLabelShadowBlur', 'commonLabelShadowOffsetY', 'toolboxRowRadius', 'subtoolBorderRadius',
            'dashboardContentRadius', 'dashboardLabelShadowBlur']) {
            expect(alternate.lengths[name], `${name} must follow the base`).toBeCloseTo(scale(authoredLengths[name]), 6);
        }
    });

    it('resizes the ribbon notification badge with its glyph and corner', () => {
        expect(alternate.lengths.notificationBadge).toBeCloseTo(scale(authoredLengths.notificationBadge), 6);
        expect(alternate.lengths.notificationBadgeFont).toBeCloseTo(scale(authoredLengths.notificationBadgeFont), 6);
        expect(alternate.lengths.notificationRadius).toBeCloseTo(scale(authoredLengths.notificationRadius), 6);
    });

    it('keeps the one declared off-grid sentinel off the base', () => {
        // `pill` is the single length of the framework that is allowed to be
        // arbitrary: it only has to be large enough to look round at any base.
        expect(alternate.lengths.commonRadiusPill).toBe(OFF_GRID_SENTINEL_PX);
    });
});
