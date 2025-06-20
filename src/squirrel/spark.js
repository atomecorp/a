/**
 * 🚀 SQUIRREL APPLICATION - SIMPLIFIED ENTRY POINT
 * Version avec imports statiques pour compatibilité bundling CDN
 */

// === IMPORTS STATIQUES ES6 ===
import './apis.js';
import { $, define, observeMutations } from './squirrel.js';

// === EXPOSITION GLOBALE IMMÉDIATE ===
window.$ = $;
window.define = define;
window.observeMutations = observeMutations;
window.body = document.body;
window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

console.log('✅ Squirrel Core chargé - Ordre respecté');

// === IMPORT KICKSTART APRÈS EXPOSITION ===
import('./kickstart.js').then(() => {
  console.log('✅ Kickstart chargé après exposition');
}).catch(err => {
  console.error('❌ Erreur kickstart:', err);
});
    
