/**
 * 🚀 SQUIRREL CDN - STATIC VERSION OF SPARK.JS
 * Version statique pour bundle CDN (sans dynamic imports)
 */

// Import statique des APIs et du core Squirrel
import '../src/squirrel/apis.js';
import { $, define, observeMutations } from '../src/squirrel/squirrel.js';

// Import statique du système de plugins
import PluginManager from '../src/squirrel/plugin-manager.js';
import PluginAPI from '../src/squirrel/plugin-api.js';

// Import statique de tous les composants
import * as BadgeBuilder from '../src/squirrel/components/badge_builder.js';
import * as ButtonBuilder from '../src/squirrel/components/button_builder.js';
import * as DraggableBuilder from '../src/squirrel/components/draggable_builder.js';
import * as MatrixBuilder from '../src/squirrel/components/matrix_builder.js';
import * as MenuBuilder from '../src/squirrel/components/menu_builder.js';
import * as SliderBuilder from '../src/squirrel/components/slider_builder.js';
import * as TableBuilder from '../src/squirrel/components/table_builder.js';
import * as TooltipBuilder from '../src/squirrel/components/tooltip_builder.js';
import * as UnitBuilder from '../src/squirrel/components/unit_builder.js';

// Import kickstart
import '../src/squirrel/kickstart.js';

// Exposition immédiate et directe (sans attendre le DOM)
window.$ = $;
window.define = define;
window.observeMutations = observeMutations;
window.body = document.body;
window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

// Exposition directe des composants
window.Button = ButtonBuilder.createButton;
window.Badge = BadgeBuilder.createBadge || BadgeBuilder.default;
window.Slider = SliderBuilder.createSlider || SliderBuilder.default;
window.Table = TableBuilder.createTable || TableBuilder.default;
window.Matrix = MatrixBuilder.createMatrix || MatrixBuilder.default;
window.Draggable = DraggableBuilder.default;
window.Menu = MenuBuilder.default;
window.Tooltip = TooltipBuilder.default;
window.Unit = UnitBuilder.default;

// Initialisation du plugin manager
const pluginManager = new PluginManager();
const pluginAPI = new PluginAPI(pluginManager);

window.pluginManager = pluginManager;
window.Squirrel = pluginAPI;

// Émission immédiate de l'événement de compatibilité
if (typeof window !== 'undefined') {
  window.dispatchEvent(new CustomEvent('squirrel:ready', {
    detail: { 
      version: '1.0.0', 
      components: ['Button', 'Badge', 'Slider', 'Table', 'Matrix', 'Draggable', 'Menu', 'Tooltip', 'Unit'],
      domReady: true
    }
  }));
}

// Export pour compatibilité module
export default {
  version: '1.0.0',
  ready: true
};
