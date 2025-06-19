/**
 * 🚀 SQUIRREL.JS - CDN BUNDLE ENTRY POINT
 * Utilise la version statique de spark.js pour le CDN
 */

// Import de la version statique de spark qui gère tout
import './spark-cdn.js';

// Import direct des fonctions principales pour les réexporter
import { $, define, observeMutations } from '../src/squirrel/squirrel.js';
import { createButton } from '../src/squirrel/components/button_builder.js';

// Force l'exposition dans le contexte global APRÈS le chargement
if (typeof window !== 'undefined') {
  // Exposition immédiate dans le contexte IIFE
  window.$ = $;
  window.Button = createButton;
  window.define = define;
  window.observeMutations = observeMutations;
  
  console.log('🔍 CDN Bundle - Functions exposed:', {
    '$': typeof window.$,
    'Button': typeof window.Button,
    'define': typeof window.define
  });
}

// Export pour compatibilité module
export const squirrelBundleInfo = {
  ready: true,
  version: '1.0.0',
  type: 'cdn'
};

export default {
  version: '1.0.0',
  type: 'cdn',
  $,
  Button: createButton,
  define
};
