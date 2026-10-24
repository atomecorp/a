import { describe, expect, it } from 'vitest';
import { itemsForRender } from '../../eVe/domains/dashboard/dashboard_environment.js';

const categories = [
    ['news', '#9f2f2f'], ['calendar', '#245f94'], ['projects', '#357245'],
    ['contacts', '#673071'], ['monitor', '#2f6f78']
].map(([id, color], order) => ({ id, color, order, icon_id: id, label_key: `eve.dashboard.category.${id}` }));

const weather = {
    id: 'dashboard_module_weather', category_id: 'news', span: 2,
    metadata: { dashboard_module: 'weather', weather: { status: 'ready', temperature: 18, city: 'Paris', condition: 'clear', condition_label: 'Ciel dégagé' } }
};
const sourceItems = new Map(categories.map((category) => [category.id, [
    ...(category.id === 'news' ? [weather] : []),
    { id: `${category.id}-one`, category_id: category.id, title: category.id }
]]));

describe('Dashboard filtered category cascade', () => {
    it('cascades a filtered category from its own row and empties every other row', () => {
        const filtered = itemsForRender(categories, 'news', sourceItems);
        expect(filtered.get('news')).toEqual([weather]);
        expect(filtered.get('calendar').map((item) => item.id)).toEqual(['news-one']);
        for (const id of ['projects', 'contacts', 'monitor']) expect(filtered.get(id)).toEqual([]);
        const restored = itemsForRender(categories, '', sourceItems);
        expect(restored.get('news')).toEqual(sourceItems.get('news'));
        expect(restored.get('projects')).toEqual(sourceItems.get('projects'));
    });
});
