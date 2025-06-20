/**
 * 🚀 SQUIRREL APPLICATION - SIMPLIFIED ENTRY POINT
 * Version avec imports statiques pour compatibilité bundling CDN
 */

// === IMPORTS STATIQUES ES6 ===
import './apis.js';
import { $, define, observeMutations } from './squirrel.js';

// === IMPORTS DES COMPOSANTS ===
import Button from './components/button_builder.js';
import Slider from './components/slider_builder.js';
import Table from './components/table_builder.js';
import Matrix from './components/matrix_builder.js';
import List from './components/List_builder.js';
import Menu from './components/menu_builder.js';
import Unit, { 
  selectUnits, 
  getSelectedUnits, 
  deleteUnit, 
  connectUnits, 
  disconnectUnits,
  getAllConnections,
  getUnit,
  getAllUnits 
} from './components/unit_builder.js';
import Draggable from './components/draggable_builder.js';
import Badge from './components/badge_builder.js';
import Tooltip from './components/tooltip_builder.js';
import Template from './components/template_builder.js';
import Minimal from './components/minimal_builder.js';

// === EXPOSITION GLOBALE IMMÉDIATE ===
window.$ = $;
window.define = define;
window.observeMutations = observeMutations;
window.body = document.body;
window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

// === EXPOSITION DES COMPOSANTS ===
window.Button = Button;
window.Slider = Slider;
window.Table = Table;
window.Matrix = Matrix;
window.List = List;
window.Menu = Menu;
window.Unit = Unit;
window.Draggable = Draggable;
window.Badge = Badge;
window.Tooltip = Tooltip;
window.Template = Template;
window.Minimal = Minimal;

// === AJOUT DES MÉTHODES STATIQUES À UNIT POUR COMPATIBILITÉ ===
Unit.selectUnits = selectUnits;
Unit.getSelectedUnits = getSelectedUnits;
Unit.deleteUnit = deleteUnit;
Unit.connectUnits = connectUnits;
Unit.disconnectUnits = disconnectUnits;
Unit.getAllConnections = getAllConnections;
Unit.getUnit = getUnit;
Unit.getAllUnits = getAllUnits;

console.log('✅ Squirrel Core chargé - Ordre respecté');

// === IMPORT KICKSTART APRÈS EXPOSITION ===
import('./kickstart.js').then(() => {
  console.log('✅ Kickstart chargé après exposition');
}).catch(err => {
  console.error('❌ Erreur kickstart:', err);
});
    
