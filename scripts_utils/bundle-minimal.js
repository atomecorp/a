/**
 * 🚀 SQUIRREL.JS MINIMAL WORKING BUNDLE
 * Version ultra-simple qui marche VRAIMENT
 */

// === IMPORT DU CORE ===
import '../src/squirrel/apis.js';
import { $, define, observeMutations } from '../src/squirrel/squirrel.js';

// === IMPORT DE KICKSTART ===
import '../src/squirrel/kickstart.js';

// === EXPOSITION GLOBALE FORCÉE ===
// Forcer Rollup à garder ces assignations
globalThis.$ = $;
globalThis.define = define;
globalThis.observeMutations = observeMutations;
globalThis.Squirrel = { $, define, observeMutations, version: '1.0.0' };

// Aliases pour compatibilité
window.$ = $;
window.define = define;
window.observeMutations = observeMutations;
window.Squirrel = globalThis.Squirrel;

console.log('✅ Squirrel.js Minimal loaded');

// === EXPORT POUR ROLLUP ===
export default globalThis.Squirrel;
