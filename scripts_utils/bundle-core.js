/**
 * 🚀 SQUIRREL.JS CORE BUNDLE
 * Core uniquement, sans composants, sans kickstart
 * Léger et rapide pour usage avec imports explicites
 */

// === IMPORT DU CORE ===
import '../src/squirrel/apis.js';
import { $, define, observeMutations } from '../src/squirrel/squirrel.js';

// === EXPOSITION GLOBALE ===
window.$ = $;
window.define = define;
window.observeMutations = observeMutations;
window.body = document.body;
window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

// === CORE UTILITIES OBJECT ===
window.Squirrel = {
  $,
  define,
  observeMutations,
  version: '1.0.0'
};

console.log('✅ Squirrel.js Core loaded - Use explicit imports for components');

// === PAS D'ÉVÉNEMENT READY POUR LE CORE ===
// Le bundle core est pour usage avancé sans kickstart
