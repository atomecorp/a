/**
 * 🚀 SQUIRREL.JS - BUNDLE ENTRY POINT
 * Point d'entrée avec initialisation immédiate et simple
 */

// === IMPORTS DES MODULES CORE ===
import { $, define, observeMutations } from '../src/squirrel/squirrel.js';
import '../src/squirrel/apis.js';
import PluginManager from '../src/squirrel/plugin-manager.js';
import PluginAPI from '../src/squirrel/plugin-api.js';

// === IMPORTS STATIQUES DES COMPOSANTS ===
import * as ListBuilder from '../src/squirrel/components/List_builder.js';
import * as BadgeBuilder from '../src/squirrel/components/badge_builder.js';
import * as ButtonBuilder from '../src/squirrel/components/button_builder.js';
import * as DraggableBuilder from '../src/squirrel/components/draggable_builder.js';
import * as MatrixBuilder from '../src/squirrel/components/matrix_builder.js';
import * as MenuBuilder from '../src/squirrel/components/menu_builder.js';
import * as SliderBuilder from '../src/squirrel/components/slider_builder.js';
import * as TableBuilder from '../src/squirrel/components/table_builder.js';
import * as TooltipBuilder from '../src/squirrel/components/tooltip_builder.js';
import * as UnitBuilder from '../src/squirrel/components/unit_builder.js';

// === IMPORT KICKSTART ===
import { runKickstart } from '../src/squirrel/kickstart.js';

// === ÉTAT GLOBAL ===
let pluginManager = null;

// === EXPOSITION DES APIS CORE ===
function exposeCorAPIs() {
  // Exposer les utilitaires de base
  window.$ = $;
  window.define = define;
  window.observeMutations = observeMutations;
  window.body = document.body;
  window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();
  
  // Créer le plugin manager
  pluginManager = new PluginManager();
  window.pluginManager = pluginManager;
  
  // Créer l'API des plugins
  const pluginAPI = new PluginAPI(pluginManager);
  window.Squirrel = pluginAPI;
}

// === CHARGEMENT DES COMPOSANTS ===
function loadComponents() {
  const componentModules = {
    ListBuilder,
    BadgeBuilder,
    ButtonBuilder,
    DraggableBuilder,
    MatrixBuilder,
    MenuBuilder,
    SliderBuilder,
    TableBuilder,
    TooltipBuilder,
    UnitBuilder
  };
  
  // === EXPOSITION AUTOMATIQUE DES COMPOSANTS ===
  Object.entries(componentModules).forEach(([moduleName, module]) => {
    try {
      if (module.default && module.default.create) {
        // Extraire le nom du composant (enlever "Builder")
        const componentName = moduleName.replace('Builder', '');
        
        // Exposer globalement
        window[componentName] = module.default.create;
        window[`${componentName}Styles`] = module.default;
        
        // Pour Draggable, exposer aussi les fonctions supplémentaires
        if (componentName === 'Draggable') {
          window.draggable = module.default.create;
          window.makeDraggable = module.default.makeDraggable;
          window.makeDraggableWithDrop = module.default.makeDraggableWithDrop;
          window.makeDropZone = module.default.makeDropZone;
        }
        
        // Enregistrer dans le plugin manager
        pluginManager.loadedPlugins.add(componentName);
      }
    } catch (error) {
      console.warn(`⚠️ Erreur lors de l'exposition de ${moduleName}:`, error.message);
    }
  });
  
  // API pour le chargement manuel (compatibilité)
  window.loadPlugin = async (pluginName) => {
    return window[pluginName];
  };
  
  return componentModules;
}

// === INITIALISATION IMMÉDIATE DES APIs ===
function initSquirrelAPIs() {
  exposeCorAPIs();
  loadComponents();
  window.squirrelReady = true;
}

// === INITIALISATION DOM ===
function initSquirrelDOM() {
  try {
    runKickstart();
    window.squirrelDomReady = true;
    
    // Émettre l'événement de compatibilité
    window.dispatchEvent(new CustomEvent('squirrel:ready', {
      detail: { 
        version: '1.0.0', 
        components: Array.from(pluginManager.loadedPlugins),
        domReady: true
      }
    }));
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation DOM:', error);
  }
}

// === ÉTAT GLOBAL DE PRÉPARATION ===
window.squirrelReady = false;
window.squirrelDomReady = false;

// === FONCTIONS UTILITAIRES ===
window.whenSquirrelReady = function(callback) {
  if (window.squirrelReady) {
    callback();
  } else {
    // Fallback - ne devrait pas arriver
    setTimeout(callback, 0);
  }
};

window.whenSquirrelDOMReady = function(callback) {
  if (window.squirrelDomReady) {
    callback();
  } else {
    window.addEventListener('squirrel:ready', callback, { once: true });
  }
};

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

// Export pour l'utilisation en module (Node.js ou tests)
export { initSquirrelAPIs, initSquirrelDOM, loadComponents };

// Export par défaut pour l'utilisation en module
export default {
  initAPIs: initSquirrelAPIs,
  initDOM: initSquirrelDOM,
  loadComponents
};
