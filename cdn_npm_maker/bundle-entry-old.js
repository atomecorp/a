/**
 * 🚀 SQUIRREL.JS - BUNDLE ENTRY POINT (DYNAMIC VERSION)
 * Point d'entrée avec chargement dynamique des composants
 */

// === IMPORTS DES MODULES CORE ===
import { $, define, observeMutations } from '../src/squirrel/squirrel.js';
import '../src/squirrel/apis.js';
import PluginManager from '../src/squirrel/plugin-manager.js';
import PluginAPI from '../src/squirrel/plugin-api.js';

// === IMPORTS STATIQUES DES COMPOSANTS (pour Rollup) ===
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

// === IMPORT KICKSTART EN DERNIER ===
import { runKickstart } from '../src/squirrel/kickstart.js';

// === REGISTRATION DYNAMIQUE DES COMPOSANTS ===
// Auto-discovery des composants disponibles
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
  
  console.log('🔍 Enregistrement des composants...');
  return componentModules;
}

// === INITIALISATION DU FRAMEWORK ===
function initSquirrel() {
  console.log('🔄 Initialisation de Squirrel.js...');
  
  // Exposer les utilitaires de base
  window.$ = $;
  window.define = define;
  window.observeMutations = observeMutations;
  window.body = document.body;
  window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();
  
  // Créer le plugin manager
  const pluginManager = new PluginManager();
  window.pluginManager = pluginManager;
  
  // Créer l'API des plugins
  const pluginAPI = new PluginAPI(pluginManager);
  window.Squirrel = pluginAPI;
  
  // === CHARGEMENT DES COMPOSANTS ===
  console.log('🔍 Chargement des composants...');
  const componentModules = loadComponents();
  
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
        
        // console.log(`  ✅ ${componentName} exposé globalement`);
      }
    } catch (error) {
      console.warn(`  ⚠️ Erreur lors de l'exposition de ${moduleName}:`, error.message);
    }
  });
  
  // API pour le chargement manuel (pour compatibilité)
  window.loadPlugin = async (pluginName) => {
    // console.log(`✅ Plugin ${pluginName} déjà chargé dans le bundle`);
    return window[pluginName];
  };
  
  console.log('🎉 Squirrel.js initialisé avec succès!');
  console.log(`📦 ${Object.keys(componentModules).length} composants chargés`);
  console.log('🧩 Composants:', Array.from(pluginManager.loadedPlugins));
  
  // Émettre un événement pour signaler que tout est prêt
  window.dispatchEvent(new CustomEvent('squirrel:ready', {
    detail: { 
      version: '1.0.0', 
      components: Array.from(pluginManager.loadedPlugins),
      count: Object.keys(componentModules).length,
      dynamicLoading: true
    }
  }));
  
  // 🚀 KICKSTART EN DERNIER - Après que tout soit prêt
  try {
    runKickstart();
  } catch (error) {
    console.error('❌ Erreur lors du kickstart:', error);
  }
}

// === INITIALISATION IMMEDIATE ===
// État global de préparation
window.squirrelReady = false;
window.squirrelDomReady = false;

// Initialiser immédiatement les APIs (sans DOM)
function initSquirrelAPIs() {
  console.log('⚡ Initialisation immédiate des APIs Squirrel...');
  
  // Les APIs sont déjà disponibles grâce aux imports
  // Charger les composants sans créer d'éléments DOM
  loadComponents();
  
  console.log('✅ APIs Squirrel disponibles immédiatement');
  window.squirrelReady = true;
}

// Initialiser le DOM quand il est prêt
function initSquirrelDOM() {
  console.log('🏠 Initialisation DOM Squirrel...');
  
  try {
    runKickstart();
    window.squirrelDomReady = true;
    
    // Émettre l'événement de compatibilité
    window.dispatchEvent(new CustomEvent('squirrel:ready', {
      detail: { 
        version: '1.0.0', 
        components: window.pluginManager ? Array.from(window.pluginManager.loadedPlugins) : [],
        domReady: true
      }
    }));
    
    console.log('🎉 Squirrel.js complètement initialisé!');
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation DOM:', error);
  }
}

// Fonction utilitaire pour les utilisateurs
window.whenSquirrelReady = function(callback) {
  if (window.squirrelReady) {
    callback();
  } else {
    // Fallback au cas où (ne devrait pas arriver)
    window.addEventListener('squirrel:ready', callback, { once: true });
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
  
  // ÉTAPE 2: Initialiser le DOM quand prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSquirrelDOM);
  } else {
    // DOM déjà prêt
    setTimeout(initSquirrelDOM, 0);
  }
}

// Export pour l'utilisation en module (Node.js ou tests)
export { initSquirrel, loadComponents };

// Export par défaut pour l'utilisation en module
export default {
  init: initSquirrel,
  loadComponents
};
