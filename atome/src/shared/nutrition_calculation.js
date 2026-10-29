/**
 * What a meal brings, computed from its components and the Ciqual table, never guessed
 * (todo/etude_nutrition_menus_2026-10-27.md §6.2). A component counts when:
 *   - it is linked (`ref`) to a Ciqual food of the table release that is loaded, or to a scanned
 *     product (`off`), which keeps its own contents per 100 g;
 *   - its portion is a weight in grams (Ciqual gives contents per 100 g; a millilitre,
 *     a piece or a portion has no weight here, and none is invented);
 *   - every requested nutrient has a value for that food (Ciqual « - », or a null product content = no data).
 * Any other component is « unknown »: a total with one is partial, never completed.
 * « traces » and « < x » are below what can be quantified and add 0.
 *
 * `table` is the loaded Ciqual table `{ foods: Map<code, { per100g }>, version }` (eVe/domains/shopping/food_composition.js).
 * Returns `{ count, computed: [id], unknown: [id], components: { id: { key: amount } }, total: { key: amount } }`.
 */
const amountOf = value => (typeof value === 'number' ? value : 0);
const per100gOf = (ref, { foods, version }) => (ref?.source === 'off' ? ref.per100g
    : ref?.source === 'ciqual' && ref.version === version ? foods.get(ref.code)?.per100g || null : null);

export const computeMealNutrition = (components, table, keys) => {
    const result = { count: components.length, computed: [], unknown: [], components: {},
        total: Object.fromEntries(keys.map(key => [key, 0])) };
    for (const component of components) {
        const per100g = per100gOf(component.ref, table);
        const grams = component.portion?.unit === 'g' ? component.portion.value : null;
        if (!per100g || grams === null || keys.some(key => per100g[key] === null)) { result.unknown.push(component.id); continue; }
        const amounts = Object.fromEntries(keys.map(key => [key, amountOf(per100g[key]) * grams / 100]));
        keys.forEach(key => { result.total[key] += amounts[key]; });
        result.components[component.id] = amounts;
        result.computed.push(component.id);
    }
    return result;
};
