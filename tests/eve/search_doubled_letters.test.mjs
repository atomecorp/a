// R-141 (13 Nov. 2026): « HIT » finds « Sprint HIIT »; a doubled letter typed once still finds its word.
import { expect, test } from 'vitest';
import { searchMatches } from '../../eVe/i18n/search_text.js';

test('a doubled letter typed once matches, a short or foreign word does not', () => {
    expect(searchMatches('Sprint HIIT', 'HIT')).toBe(true);
    expect(searchMatches('Pommes', 'pomes')).toBe(true);
    expect(searchMatches('Pompes', 'pompe')).toBe(true);
    expect(searchMatches('Marche', 'hit')).toBe(false);
    expect(searchMatches('Allure', 'al')).toBe(true);
});
