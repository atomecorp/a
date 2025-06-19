/**
 * 🚀 SQUIRREL.JS - CLEAN BUNDLE ENTRY
 */

// Import des fonctions core essentielles
import { $ } from '../src/squirrel/squirrel.js';

// Import des composants essentiels
import * as ButtonBuilder from '../src/squirrel/components/button_builder.js';
import * as BadgeBuilder from '../src/squirrel/components/badge_builder.js';
import * as TooltipBuilder from '../src/squirrel/components/tooltip_builder.js';

// Fonction define locale pour éviter les conflits AMD
function defineTemplate(id, config) {
  if (!window.templateRegistry) {
    window.templateRegistry = new Map();
  }
  window.templateRegistry.set(id, config);
  return config;
}

// Fonction pour créer la structure DOM de base (remplace kickstart)
function createViewElement() {
  if (!document.getElementById('view')) {
    const viewDiv = document.createElement('div');
    viewDiv.id = 'view';
    viewDiv.className = 'atome';
    viewDiv.style.cssText = `
      background: #272727;
      color: lightgray;
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      overflow: auto;
    `;
    document.body.appendChild(viewDiv);
    console.log('✅ Element #view créé');
  }
}

// Initialisation des APIs
function initSquirrel() {
  window.$ = $;
  window.define = defineTemplate;
  
  // Créer la structure DOM de base
  createViewElement();
  
  // Chargement des composants
  const components = {};
  
  try {
    if (ButtonBuilder.default?.create) {
      components.Button = ButtonBuilder.default.create;
      window.Button = ButtonBuilder.default.create;
    }
    
    if (BadgeBuilder.default?.create) {
      components.Badge = BadgeBuilder.default.create;
      window.Badge = BadgeBuilder.default.create;
    }
    
    if (TooltipBuilder.default?.create) {
      components.Tooltip = TooltipBuilder.default.create;
      window.Tooltip = TooltipBuilder.default.create;
    }
  } catch (error) {
    console.warn('⚠️ Erreur lors du chargement des composants:', error.message);
  }
  
  window.Squirrel = {
    version: '1.0.0',
    ready: true,
    $: $,
    define: defineTemplate,
    components: components,
    ...components
  };
  
  console.log('✅ Squirrel.js loaded with components:', Object.keys(components));
}

// Auto-initialisation
if (typeof window !== 'undefined') {
  // Attendre que le DOM soit prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initSquirrel();
      window.dispatchEvent(new CustomEvent('squirrel:ready', {
        detail: { version: '1.0.0', ready: true }
      }));
    });
  } else {
    initSquirrel();
    // Déclencher l'événement de manière asynchrone
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('squirrel:ready', {
        detail: { version: '1.0.0', ready: true }
      }));
    }, 0);
  }
}

export default { initSquirrel };
