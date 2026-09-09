// Forme commune des contrats de connecteur de domaine.
//
// mail/, calendar/, contacts/ et bank/ portaient chacun un `connector_contract.js`
// avec le même constructeur — normaliser `provider`, `protocol`, `role`, les deux
// listes de capacités — recopié quatre fois. Les quatre copies avaient déjà
// divergé : `contacts` seul n'était pas gelé, `mail` seul n'exposait ni `protocol`
// ni `role`, et chacun nommait autrement les mêmes concepts.
//
// La DÉCISION d'architecture reste propre à chaque domaine (protocoles, hôtes,
// capacités) ; seule la normalisation est partagée. Les champs absents de `fields`
// restent absents du résultat, pour que la forme de sortie de chaque domaine soit
// exactement celle qu'elle était.

const asString = (value, fallback = '') => String(value ?? fallback ?? '');
const asStringList = (value) => (Array.isArray(value) ? value.map((entry) => String(entry)) : []);

/**
 * @param {object} fields
 * @param {string} fields.provider                     obligatoire
 * @param {string} [fields.protocol]
 * @param {string} [fields.role]
 * @param {string[]} [fields.read_capabilities]
 * @param {string[]} [fields.write_capabilities]
 * @param {object} [extras] champs additionnels propres au domaine, copiés tels quels
 */
export const normalizeConnectorContract = (fields = {}, extras = {}) => {
    const contract = { provider: asString(fields.provider) };
    if (fields.protocol !== undefined) contract.protocol = asString(fields.protocol);
    if (fields.role !== undefined) contract.role = asString(fields.role);
    contract.read_capabilities = asStringList(fields.read_capabilities);
    contract.write_capabilities = asStringList(fields.write_capabilities);
    return Object.assign(contract, extras);
};

export default normalizeConnectorContract;
