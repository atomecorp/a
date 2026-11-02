import { describe, expect, it } from 'vitest';
import { dashboardLabelBandText, DASHBOARD_TILE_LABEL_MAX } from '../../eVe/domains/dashboard/dashboard_creation_records.js';

// A tile's label (AGENTS.md rule 11, V6.1 validated 2 Nov. 2026): 9 characters at most, then « … », by grapheme; a text
// that is not a label is cut only where its room ends.
describe('Dashboard card labels', () => {
    it('cuts a label after 9 characters, by grapheme, with the canonical « … »', () => {
        const label = value => dashboardLabelBandText(value, 10000, 0, { max: DASHBOARD_TILE_LABEL_MAX });
        expect(label('123456789')).toBe('123456789');
        expect(label('1234567890')).toBe('123456789…');
        expect(label('éclaircie')).toBe('éclaircie');
        const family = '👨‍👩‍👧‍👦';
        expect(dashboardLabelBandText(family.repeat(10), 10000, 0, { max: 9 })).toBe(`${family.repeat(9)}…`);
        expect(dashboardLabelBandText('Mon 2 Nov 18:30 Dentiste', 10000, 0)).toBe('Mon 2 Nov 18:30 Dentiste');
    });
});
