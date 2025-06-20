/**
 * 🚀 SQUIRREL.JS FULL BUNDLE
 * Include core + composants principaux
 * Kickstart chargé à la toute fin via événement
 */

// === IMPORT DU CORE ===
import '../src/squirrel/apis.js';
import { $, define, observeMutations } from '../src/squirrel/squirrel.js';

// === IMPORT DES COMPOSANTS PRINCIPAUX ===
import Menu from '../src/squirrel/components/menu_builder.js';
import Minimal from '../src/squirrel/components/minimal_builder.js';
import Template from '../src/squirrel/components/template_builder.js';
import Slider from '../src/squirrel/components/slider_builder.js';

// === EXPOSITION GLOBALE IMMÉDIATE ===
window.$ = $;
window.define = define;
window.observeMutations = observeMutations;
window.body = document.body;
window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

// === EXPOSITION DES COMPOSANTS ===
window.Squirrel = {
  // Core utilities
  $,
  define,
  observeMutations,
  
  // Components
  Menu,
  Minimal,
  Template,
  Slider,
  
  // Aliases pour compatibilité
  createMenu: Menu,
  createMinimal: Minimal,
  createTemplate: Template,
  createSlider: Slider,
  
  version: '1.0.0'
};

// === EXPOSITION DIRECTE POUR USAGE CDN SIMPLE ===
window.Menu = Menu;
window.Minimal = Minimal;
window.Template = Template;
window.Slider = Slider;

console.log('✅ Squirrel.js Full Bundle loaded - all functions exposed');

// === ÉVÉNEMENT READY ===
window.dispatchEvent(new CustomEvent('squirrel:ready'));

// === EXPORT POUR ROLLUP ===
// Export par défaut pour rollup
export default { 
  $, 
  define, 
  observeMutations,
  Menu,
  Minimal,
  Template,
  Slider,
  version: '1.0.0'
};

// === CHARGER KICKSTART À LA FIN ===
// Attendre que l'événement ready soit propagé, puis charger kickstart
setTimeout(() => {
  // Créer et exécuter kickstart maintenant que tout est prêt
  function executeKickstart() {
    try {
      // 1. Template basique
      define('view', {
          tag: 'div',
          class: 'atome',
          id: 'view',
      });

      // 2. Animation avec CSS
      $('view', {
          parent: document.body,
          css: {
              background: '#272727',
              color: 'lightgray',
              left: '0px',
              top: '0px',
              position: 'absolute',
              width: '100%',
              height: '100%',
              overflow: 'auto',
          }
      });
      
      console.log('✅ Kickstart demo initialized');
    } catch (error) {
      console.error('❌ Kickstart error:', error);
    }
  }
  
  executeKickstart();
}, 100);
