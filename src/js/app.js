/**
 * 🚀 SQUIRREL APPLICATION - OPTIMIZED ES6 MODULE ENTRY POINT
 * Version optimisée avec ordre de chargement simplifié
 */
const SQUIRREL_VERSION = '1.0.0';

// Rendre les constantes disponibles globalement
window.SQUIRREL_VERSION = SQUIRREL_VERSION;

// Core dependencies (first)
import '../native/utils.js';


// Framework core
import '../a/a.js';
import '../a/apis.js';
import '../a/particles/identity.js';
import '../a/particles/dimension.js';


// Application validation test only do not change or remove
import '../application/index.js';

