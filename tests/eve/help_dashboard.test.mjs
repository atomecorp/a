// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardHelpQuery, dashboardWantsHelp, createDashboardSearchSource } from '../../eVe/domains/dashboard/dashboard_search_source.js';
import { createDashboardCommunicationInput } from '../../eVe/domains/dashboard/dashboard_communication_input.js';
import { buildDashboardHelpContent, buildDashboardHelpField } from '../../eVe/intuition/tools/help_tool_view.js';
import { createDashboardMysticCells } from '../../eVe/domains/dashboard/dashboard_mystic_cells.js';

afterEach(() => vi.unstubAllGlobals());

describe('Dashboard Help', () => {
    it.each(['help', 'HELP', 'aide-moi à créer un projet'])('recognizes the explicit help request %s', query => {
        expect(dashboardWantsHelp(query)).toBe(true);
    });
    it('does not match a word containing help and extracts useful question words', () => {
        expect(dashboardWantsHelp('helpful')).toBe(false);
        expect(dashboardHelpQuery('Aide-moi à créer un projet')).toBe('creer projet');
    });
    it('places Help first without losing ordinary results', async () => {
        const item = { key: 'activity', label: 'aide sport', onSelect() {} };
        const source = createDashboardSearchSource({ labelItem: entry => entry, t: key => key,
            everyone: async () => [], eventItems: async () => [], projects: async () => [],
            activity: () => [item], gpsItems: async () => [], foundItem: entry => entry });
        const result = await source({ query: 'aide', scopes: ['activities'] });
        expect(result.map(entry => entry.key)).toEqual(['help', 'activity']);
    });
    it.each([['right', false, 0], ['right', true, 90], ['left', false, 270], ['left', true, 180]])
    ('places Help for %s hand, Back present=%s', (hand, hasBack, expected) => {
        const env = { __EVE_HANDEDNESS__: hand, __eveProfilePreferences: { visual: { dashboardStyle: 'eve_basic' } } };
        vi.stubGlobal('window', env);
        const nav = { spec: () => ({ home: false, back: hasBack ? { onActivate() {} } : null }), width: () => 90,
            node: ({ fieldId, x }) => ({ id: fieldId + '_back', style: { position: [x, 0] } }) };
        const projection = createDashboardCommunicationInput({ treeId: 'home', readDraft: () => '', openMessages() {}, refresh() {},
            navigation: nav, fieldShown: () => false, atomRect: () => ({ x: 330, y: 400, width: 60, height: 60 }),
            bandRect: () => ({ x: 0, y: 400, width: 330, height: 60 }), env });
        try {
            const tree = projection.build({ kind: 'text', value_key: 'search' }, { box: { width: 330, height: 60 },
                editing: { registerField() {}, fieldView: () => ({ focused: false }) }, emit() {} }, 'field');
            const help = tree.children.find(child => child.id === 'field_help');
            expect(help?.style.position).toEqual([expected, 0]);
            const underRubric = projection.touchAt(id => id === 'field_help');
            expect(typeof underRubric).toBe('function');
        } finally { projection.destroy(); }
    });
    it('composes the existing article list and the canonical fixed field', () => {
        const editing = { registerField: vi.fn(), fieldView: () => ({ focused: false }) };
        const snapshot = { mode: 'results', query: '', results: [{ id: 'open_project', title: 'Projet' }] };
        const context = { bodyWidth: 370, bodyHeight: 240, emit() {}, editing };
        expect(buildDashboardHelpContent(snapshot, context)[0].id).toBe('help_results');
        expect(buildDashboardHelpField(snapshot, context)[0].id).toBe('help_dashboard_search_frame');
        expect(editing.registerField).toHaveBeenCalledWith('query', expect.objectContaining({ height: 60, nodeId: 'help_dashboard_query' }));
    });
    it('lets the native band render in Basic even when its search field is hidden', () => {
        let isDocked = true;
        const cells = createDashboardMysticCells({ tokens: {}, layout: () => ({ tileRefs: [], cellRefs: [] }), t: x => x,
            stage: { snapshot: () => ({ active: false }) }, footer: () => ({ spec: () => ({ back: null }) }),
            atom: () => ({ decorate: (_ref, value) => value }), itemActions: () => ({ held: () => null }),
            choices: () => ({ at: () => '' }), communicationInput: () => ({ asking: () => false, notice: () => '' }),
            profileRow: () => ({}), basic: () => true, basicHides: () => true, cellShown: () => true,
            docked: () => isDocked, read: () => ({ shownRubric: '' }) });
        const control = { kind: 'text', value_key: 'search' };
        expect(cells.renderSlot(control, { x: 0, y: 0, width: 330, height: 60 }, 'search')).toBeNull();
        isDocked = false;
        expect(cells.renderSlot(control, { x: 0, y: 0, width: 330, height: 60 }, 'search')).toEqual([]);
    });
});
