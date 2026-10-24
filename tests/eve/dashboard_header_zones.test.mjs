import { describe, expect, it } from 'vitest';
import { itemsForRender } from '../../eVe/domains/dashboard/dashboard_environment.js';

const categories = ['news', 'calendar', 'projects', 'contacts', 'monitor']
    .map((id, order) => ({ id, color: '#245f94', order, icon_id: id, label_key: `eve.dashboard.category.${id}` }));
const sourceItems = new Map(categories.map((category) => [category.id, [
    { id: `${category.id}-one`, category_id: category.id, title: category.id, payload: { start: new Date(Date.now() + 86400000) } },
    { id: `${category.id}-two`, category_id: category.id, title: category.id, payload: { start: new Date(Date.now() + 172800000) } }
]]));

describe('Dashboard rail filtered cascade', () => {
    it('cascades the filtered category from its own row and empties every other row', () => {
        const filtered = itemsForRender(categories, 'projects', sourceItems);
        expect(filtered.get('projects').map((item) => item.id)).toEqual(['projects-one']);
        expect(filtered.get('contacts').map((item) => item.id)).toEqual(['projects-two']);
        for (const id of ['news', 'calendar', 'monitor']) expect(filtered.get(id)).toEqual([]);
    });
});
