// Table d'alias de propriétés — source unique.
//
// Le produit persiste 15 propriétés sous DEUX orthographes (camelCase ET
// snake_case) : mesuré sur un coffre réel, `svgMarkup` et `svg_markup` stockaient
// deux fois les mêmes 35 789 octets, avec doublement dans `particles_versions` et
// dans la charge d'événement.
//
// La double écriture n'est pas un oubli : à ce jour, 30 modules ne lisent QUE
// `fontSize`, 8 ne lisent QUE `font_size` ; 76 ne lisent QUE `zIndex`, 6 ne lisent
// QUE `z_index`. Supprimer une orthographe casserait des lecteurs des deux côtés.
// Ce module ne prétend donc pas résoudre la dette : il la DÉCLARE en un seul
// endroit, pour que
//   - les écrivains cessent de répéter les paires à la main (source de divergence),
//   - les lecteurs disposent d'un accesseur qui connaît les deux,
//   - la garde `scripts/check_property_aliases.mjs` puisse mesurer la dette et
//     empêcher son augmentation.
//
// Chaque paire retirée d'ici est une paire dont tous les lecteurs ont convergé.

/** camelCase → snake_case, pour les propriétés encore écrites en double. */
export const DUAL_WRITTEN_PROPERTY_ALIASES = Object.freeze({
    backgroundColor: 'background_color',
    currentActivityId: 'current_activity_id',
    currentActivityName: 'current_activity_name',
    currentProjectId: 'current_project_id',
    fileName: 'file_name',
    filePath: 'file_path',
    firstName: 'first_name',
    fontSize: 'font_size',
    fontWeight: 'font_weight',
    lineHeight: 'line_height',
    matrixSlot: 'matrix_slot',
    mimeType: 'mime_type',
    projectNumber: 'project_number',
    zIndex: 'z_index'
});

/** snake_case → camelCase (index inverse, construit une fois). */
export const SNAKE_TO_CAMEL_PROPERTY_ALIASES = Object.freeze(
    Object.fromEntries(Object.entries(DUAL_WRITTEN_PROPERTY_ALIASES).map(([camel, snake]) => [snake, camel]))
);

/**
 * Toutes les orthographes connues d'une propriété, la clé demandée en premier.
 * @param {string} key
 * @returns {string[]}
 */
export const propertySpellings = (key) => {
    const name = String(key || '');
    if (!name) return [];
    const other = DUAL_WRITTEN_PROPERTY_ALIASES[name] || SNAKE_TO_CAMEL_PROPERTY_ALIASES[name];
    return other ? [name, other] : [name];
};

/**
 * Lit une propriété sans se soucier de son orthographe.
 *
 * Utilise `??` et non `||` : la moitié de ces propriétés sont numériques, et un
 * `zIndex` ou un `left` valant 0 tombait dans le repli avec `||`.
 *
 * @param {object} properties
 * @param {string} key
 * @param {*} [fallback]
 */
export const readAliasedProperty = (properties, key, fallback = undefined) => {
    if (!properties || typeof properties !== 'object') return fallback;
    for (const spelling of propertySpellings(key)) {
        const value = properties[spelling];
        if (value !== undefined && value !== null) return value;
    }
    return fallback;
};

/**
 * Écrit une propriété sous les deux orthographes tant que la paire figure dans
 * la table. Une seule écriture dès qu'une paire en sort.
 *
 * @param {object} target  objet de propriétés muté sur place
 * @param {string} key
 * @param {*} value
 * @returns {object} target
 */
export const writeAliasedProperty = (target, key, value) => {
    if (!target || typeof target !== 'object') return target;
    for (const spelling of propertySpellings(key)) target[spelling] = value;
    return target;
};

export default {
    DUAL_WRITTEN_PROPERTY_ALIASES,
    SNAKE_TO_CAMEL_PROPERTY_ALIASES,
    propertySpellings,
    readAliasedProperty,
    writeAliasedProperty
};
