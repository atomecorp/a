import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    SYSTEM_UI_METRICS,
    SYSTEM_UI_PANEL_CHROME_METRICS
} from '../../eVe/elements/system_ui_tokens.js';
import { EVE_TOOL_SKIN_TOKENS } from '../../eVe/elements/skin/tool_skin.js';
import { EVE_BUTTON_SKIN_TOKENS } from '../../eVe/elements/skin/button_skin.js';
import { resolveBevyMainMenuItemSize } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_model.js';
import { BEVY_PANEL_TOKENS } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';
import { createDashboardLayout } from '../../eVe/domains/dashboard/dashboard_layout.js';
import {
    DASHBOARD_VISUAL_TOKENS,
    resolveDashboardBlockUnitSize
} from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { MATRIX_VISUAL_METRICS } from '../../eVe/intuition/matrix/visual/matrix_visual_tokens.js';
import { projectViewRowGeometry } from '../../eVe/domains/rendering/project_view_surface_layout.js';

const UNIT = SYSTEM_UI_METRICS.unitPx;
const HALF = SYSTEM_UI_METRICS.halfUnitPx;
const DOUBLE = SYSTEM_UI_METRICS.doubleUnitPx;
const scalePx = SYSTEM_UI_METRICS.scalePx;

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const dashboardCategories = [
    { id: 'news', color: '#9f2f2f', order: 0, icon_id: 'news', label_key: 'eve.dashboard.category.news' }
];

describe('System UI base unit contract', () => {
    it('publishes one base unit with its two declared ratios and one scaler', () => {
        expect(UNIT).toBe(60);
        expect(HALF).toBe(UNIT / 2);
        expect(DOUBLE).toBe(UNIT * 2);
        // The scaler is the resize seam: it returns the authored length at the
        // base unit and follows the base for any other value.
        expect(scalePx(358)).toBe(358);
        expect(scalePx(UNIT)).toBe(UNIT);
        expect(scalePx(11)).toBe((11 * UNIT) / 60);
        expect(scalePx(0.35)).toBe((0.35 * UNIT) / 60);
    });

    it('declares the base once, in the metrics owner, and nowhere else among the size owners', () => {
        const metricsSource = source('../../eVe/elements/system_ui_tokens.js');
        expect(metricsSource.match(/SYSTEM_UI_TOOL_UNIT_PX = 60/g)).toHaveLength(1);
        const toolSkin = source('../../eVe/elements/skin/tool_skin.js');
        expect(toolSkin).not.toMatch(/toolSizePx:\s*\d/);
        expect(toolSkin).toMatch(/toolSizePx:\s*UNIT_PX/);
        const panelSkin = source('../../eVe/elements/skin/panel_skin.js');
        expect(panelSkin).not.toMatch(/(?:inputHeightPx|rowHeightPx|headerHeightPx|controlHeightPx|optionHeightPx|agendaRowHeightPx|resultRowHeightPx|bodyHeightPx):\s*\d/);
        const bevyTokens = source('../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js');
        expect(bevyTokens).not.toMatch(/(?:size|height)\w*:\s*104\b/i);
        const matrixTokens = source('../../eVe/intuition/matrix/visual/matrix_visual_tokens.js');
        expect(matrixTokens).not.toMatch(/cellSizePx:\s*\d/);
        expect(matrixTokens).toMatch(/cellSizePx:\s*TOOL_UI_METRICS\.doubleUnitPx/);
    });

    it('makes one square tool the base unit everywhere a tool is drawn', () => {
        expect(EVE_TOOL_SKIN_TOKENS.bevyMenu.toolSizePx).toBe(UNIT);
        expect(EVE_TOOL_SKIN_TOKENS.metrics.toolboxSquareSizePx).toBe(UNIT);
        expect(resolveBevyMainMenuItemSize()).toBe(UNIT);
        // The footer is the one declared pixel exception: the ½ disc plus
        // 2 × 3 px of air, kept as a chrome contract rather than a row.
        expect(SYSTEM_UI_PANEL_CHROME_METRICS.heightPx).toBe(HALF + 2 * 3);
        expect(EVE_TOOL_SKIN_TOKENS.bevyMenu.footerHeightPx).toBe(SYSTEM_UI_PANEL_CHROME_METRICS.heightPx);
    });

    it('keeps a List row at one base unit', () => {
        const row = projectViewRowGeometry(760);
        expect(row.rowHeight).toBe(UNIT);
        expect(row.fixedColumns.unit).toBe(UNIT);
    });

    it('keeps panel rows at half a unit and disclosure headers at one unit', () => {
        const halfRows = {
            inputHeightPx: BEVY_PANEL_TOKENS.inputHeightPx,
            actionButton: BEVY_PANEL_TOKENS.actionButton.heightPx,
            tableHeader: BEVY_PANEL_TOKENS.table.headerHeightPx,
            tableRow: BEVY_PANEL_TOKENS.table.rowHeightPx,
            selectControl: BEVY_PANEL_TOKENS.select.controlHeightPx,
            selectOption: BEVY_PANEL_TOKENS.select.optionHeightPx,
            segmentedControl: BEVY_PANEL_TOKENS.segmentedControl.heightPx,
            numericField: BEVY_PANEL_TOKENS.numericField.heightPx,
            scopeChip: BEVY_PANEL_TOKENS.scopeChip.heightPx,
            mapResultRow: BEVY_PANEL_TOKENS.map.resultRowHeightPx,
            calendarAgendaRow: BEVY_PANEL_TOKENS.calendar.agendaRowHeightPx,
            listRowThumbnailColumn: BEVY_PANEL_TOKENS.listRow.thumbnailColumnPx,
            buttonSkin: EVE_BUTTON_SKIN_TOKENS.bevyButton.sizePx,
            buttonSkinRow: EVE_BUTTON_SKIN_TOKENS.bevyButton.rowHeightPx
        };
        for (const [name, value] of Object.entries(halfRows)) {
            expect(value, `${name} must be half of the base unit`).toBe(HALF);
        }
        expect(BEVY_PANEL_TOKENS.accordion.headerHeightPx).toBe(UNIT);
        const panelSkin = source('../../eVe/elements/skin/panel_skin.js');
        for (const declaration of ['inputHeightPx', 'headerHeightPx', 'rowHeightPx', 'controlHeightPx', 'optionHeightPx', 'resultRowHeightPx', 'agendaRowHeightPx']) {
            expect(panelSkin, `${declaration} must be declared as a ratio`).toMatch(new RegExp(`${declaration}:\\s*HALF_UNIT_PX`));
        }
    });

    it('keeps every panel body and text length tied to the base instead of a frozen pixel', () => {
        expect(BEVY_PANEL_TOKENS.accordion.bodyHeightPx).toBe(UNIT);
        expect(BEVY_PANEL_TOKENS.mediaCard.tile.sizePx).toBe(DOUBLE);
        const referencePx = value => UNIT * value / BEVY_PANEL_TOKENS.visualRatios.referenceRow;
        expect(BEVY_PANEL_TOKENS.accordion.chevronSizePx).toBe(referencePx(40));
        expect(BEVY_PANEL_TOKENS.controlTextSizePx).toBe(referencePx(BEVY_PANEL_TOKENS.typography.controlReference));
        expect(BEVY_PANEL_TOKENS.bodyTextSizePx).toBe(scalePx(16));
        expect(BEVY_PANEL_TOKENS.inputWidthPx).toBe(scalePx(358));
        // Declared non-row blocks keep their own proportion, but as a multiple
        // of the base: a taller base grows them too.
        expect(BEVY_PANEL_TOKENS.state.heightPx).toBe(scalePx(72));
        expect(BEVY_PANEL_TOKENS.mediaCard.heightPx).toBe(scalePx(128));
        expect(BEVY_PANEL_TOKENS.selectionSummary.heightPx).toBe(scalePx(64));
        expect(BEVY_PANEL_TOKENS.multilineEditor.heightPx).toBe(scalePx(80));
    });

    it('makes a Dashboard cell and a Matrix tile two base units at any width', () => {
        expect(resolveDashboardBlockUnitSize(DASHBOARD_VISUAL_TOKENS)).toBe(DOUBLE);
        const layout = createDashboardLayout({
            width: 760,
            height: 700,
            categories: dashboardCategories,
            itemsByCategory: new Map(),
            tokens: DASHBOARD_VISUAL_TOKENS
        });
        expect(layout.unit_width).toBe(DOUBLE);
        expect(layout.block_unit_size).toBe(DOUBLE);
        const narrow = createDashboardLayout({
            width: 240,
            height: 480,
            categories: dashboardCategories,
            itemsByCategory: new Map(),
            tokens: DASHBOARD_VISUAL_TOKENS
        });
        expect(narrow.unit_width).toBe(DOUBLE);
        expect(MATRIX_VISUAL_METRICS.cellSizePx).toBe(DOUBLE);
        expect(MATRIX_VISUAL_METRICS.gridColumns * DOUBLE).toBeGreaterThan(0);
    });

    it('ties the Matrix tile labels to the base so they grow with the cell', () => {
        expect(MATRIX_VISUAL_METRICS.tileFontSizePx).toBe(scalePx(11));
        expect(MATRIX_VISUAL_METRICS.labelFontSizePx).toBe(scalePx(11));
        expect(MATRIX_VISUAL_METRICS.addIconSizePx).toBe(scalePx(34));
        expect(MATRIX_VISUAL_METRICS.tileRadiusPx).toBe(scalePx(6));
        // The whole Matrix rhythm follows the base too, so a taller tool unit
        // does not leave the tile text or the gaps behind.
        expect(MATRIX_VISUAL_METRICS.cellGapPx).toBe(scalePx(10));
        expect(MATRIX_VISUAL_METRICS.containerPaddingPx).toBe(scalePx(12));
    });
});
