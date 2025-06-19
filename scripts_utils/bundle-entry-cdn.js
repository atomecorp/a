/**
 * 🚀 SQUIRREL.JS - CDN BUNDLE ENTRY POINT
 * Static imports version for IIFE bundling
 */

// Import core APIs statically
import { $, define, observeMutations } from '../src/squirrel/squirrel.js';
import '../src/squirrel/apis.js';

// Import plugin system statically
import PluginManager from '../src/squirrel/plugin-manager.js';
import PluginAPI from '../src/squirrel/plugin-api.js';

// Import all components statically
import * as BadgeBuilder from '../src/squirrel/components/badge_builder.js';
import * as ButtonBuilder from '../src/squirrel/components/button_builder.js';
import * as DraggableBuilder from '../src/squirrel/components/draggable_builder.js';
import * as MatrixBuilder from '../src/squirrel/components/matrix_builder.js';
import * as MenuBuilder from '../src/squirrel/components/menu_builder.js';
import * as SliderBuilder from '../src/squirrel/components/slider_builder.js';
import * as TableBuilder from '../src/squirrel/components/table_builder.js';
import * as TooltipBuilder from '../src/squirrel/components/tooltip_builder.js';
import * as UnitBuilder from '../src/squirrel/components/unit_builder.js';

// Import kickstart at the end
import '../src/squirrel/kickstart.js';

// === ÉTAT GLOBAL ===
let pluginManager = null;

// === INITIALISATION IMMÉDIATE DES APIs ===
function initSquirrelAPIs() {
  // Exposer les utilitaires de base
  window.$ = $;
  window.define = define; // Use the real define function from squirrel.js
  window.observeMutations = observeMutations;
  window.body = document.body;
  window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();
  
  // Créer le plugin manager
  pluginManager = new PluginManager();
  window.pluginManager = pluginManager;
  
  // Créer l'API des plugins
  const pluginAPI = new PluginAPI(pluginManager);
  window.Squirrel = pluginAPI;

  // Pre-register all components
  const components = {
    badge_builder: BadgeBuilder,
    button_builder: ButtonBuilder,
    draggable_builder: DraggableBuilder,
    matrix_builder: MatrixBuilder,
    menu_builder: MenuBuilder,
    slider_builder: SliderBuilder,
    table_builder: TableBuilder,
    tooltip_builder: TooltipBuilder,
    unit_builder: UnitBuilder
  };

  // Register all components with the plugin manager and expose globally
  Object.entries(components).forEach(([name, component]) => {
    if (component && typeof component === 'object') {
      pluginManager.registerPlugin(name, component);
      
      // Expose components globally for direct access
      const componentName = name.replace('_builder', '');
      const globalName = componentName.charAt(0).toUpperCase() + componentName.slice(1);
      
    
      // For other components, expose them with their proper names
    
    }
  });
}

// === INITIALISATION DOM ===
function initSquirrelDOM() {
  try {
    window.squirrelDomReady = true;
    
    // Émettre l'événement de compatibilité
    window.dispatchEvent(new CustomEvent('squirrel:ready', {
      detail: { 
        version: '1.0.0', 
        components: pluginManager ? Array.from(pluginManager.getLoadedPlugins()) : [],
        domReady: true
      }
    }));
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation DOM:', error);
  }
}

// === AUTO-INITIALISATION ===
if (typeof window !== 'undefined') {
  // ÉTAPE 1: Initialiser les APIs immédiatement
  initSquirrelAPIs();
  
  // ÉTAPE 2: Initialiser le DOM dès que body est disponible
  if (document.body) {
    // Body disponible, initialiser immédiatement
    initSquirrelDOM();
  } else {
    // Attendre le body
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSquirrelDOM);
    } else {
      setTimeout(initSquirrelDOM, 0);
    }
  }
}

// === EXPOSITION DES APIs CORE ===
// No need for separate function, already done in initSquirrelAPIs

// Export for module compatibility
export const squirrelBundleInfo = {
  ready: true,
  version: '1.0.0',
  components: [
    'badge_builder',
    'button_builder', 
    'draggable_builder',
    'matrix_builder',
    'menu_builder',
    'slider_builder',
    'table_builder',
    'tooltip_builder',
    'unit_builder'
  ]
};

export default {
  initAPIs: initSquirrelAPIs,
  initDOM: initSquirrelDOM,
  version: '1.0.0'
};
