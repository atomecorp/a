/**
 * 🚀 SQUIRREL APPLICATION - SIMPLIFIED ENTRY POINT
 * Version avec imports statiques pour compatibilité bundling CDN
 */

// === IMPORTS STATIQUES ES6 ===
import './apis.js';
import { $, define, observeMutations } from './squirrel.js';

// === EXPOSITION GLOBALE ===
window.$ = $;
window.define = define;
window.observeMutations = observeMutations;
window.body = document.body;
window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

console.log('✅ Squirrel Core chargé');

// === ÉVÉNEMENT READY ===
window.dispatchEvent(new CustomEvent('squirrel:ready'));
console.log('🎉 Événement squirrel:ready déclenché');
    
