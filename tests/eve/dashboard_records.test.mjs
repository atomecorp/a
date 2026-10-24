import { describe, expect, it } from 'vitest';
import { DASHBOARD_VISUAL_TOKENS as tokens } from '../../eVe/domains/dashboard/dashboard_tokens.js';
import { formatDashboardDisplayLabel } from '../../eVe/domains/dashboard/dashboard_item_text_fields.js';

describe('Dashboard card labels', () => {
    it('truncates a settled label by grapheme with the canonical overflow marker', () => {
        expect(formatDashboardDisplayLabel('12345678', tokens.labelText)).toBe('12345678');
        expect(formatDashboardDisplayLabel('1234567890', tokens.labelText)).toBe('1234567890');
        expect(formatDashboardDisplayLabel('12345678901', tokens.labelText)).toBe('1234567890.');
        expect(formatDashboardDisplayLabel('éclairci', tokens.labelText)).toBe('éclairci');
        expect(formatDashboardDisplayLabel('éclaircie', tokens.labelText)).toBe('éclaircie');
        const family = '👨‍👩‍👧‍👦';
        expect(formatDashboardDisplayLabel(family.repeat(11), tokens.labelText)).toBe(`${family.repeat(10)}.`);
    });
});
