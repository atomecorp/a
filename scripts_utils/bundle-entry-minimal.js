/**
 * 🚀 SQUIRREL.JS - MINIMAL BUNDLE
 */

// Import minimal des fonctions core
import { $ } from '../src/squirrel/squirrel.js';

// Fonction define simple
const defineTemplate = (id, config) => {
  if (!window.templateRegistry) window.templateRegistry = new Map();
  window.templateRegistry.set(id, config);
  return config;
};

// Auto-initialisation
if (typeof window !== 'undefined') {
  window.$ = $;
  window.define = defineTemplate;
  window.Squirrel = {
    version: '1.0.0',
    ready: true,
    $: $,
    define: defineTemplate
  };
  
  console.log('✅ Squirrel minimal loaded');
}

export default { $ };
