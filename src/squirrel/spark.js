/**
 * 🚀 SQUIRREL APPLICATION - SIMPLIFIED ENTRY POINT
 * Version with static imports for CDN bundling compatibility
 */

// === STATIC ES6 IMPORTS ===
import './apis.js';
import { $, define, observeMutations } from './squirrel.js';

// === COMPONENT IMPORTS ===
import Button from './components/button_builder.js';
import Slider from './components/slider_builder.js';
import Table from './components/table_builder.js';
import Matrix from './components/matrix_builder.js';
import List from './components/List_builder.js';
import Menu from './components/menu_builder.js';
import Console from './components/console_builder.js';
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
import Draggable, { makeDraggable, makeDraggableWithDrop, makeDropZone } from './components/draggable_builder.js';
import Badge from './components/badge_builder.js';
import Tooltip from './components/tooltip_builder.js';
import Template from './components/template_builder.js';
import Minimal from './components/minimal_builder.js';
import Slice, { createSlice } from './components/slice_builder.js';

// === OPTIONAL INTEGRATIONS ===
import initIPlugWeb from './integrations/iplug_web.js';



// === IMMEDIATE GLOBAL EXPOSURE ===
window.Squirrel = window.Squirrel || {};
window.$ = $;
window.define = define;
window.observeMutations = observeMutations;
window.body = document.body;
window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

// === COMPONENT EXPOSURE ===
window.Button = Button;
window.Slider = Slider;
window.Table = Table;
window.Matrix = Matrix;
window.List = List;
window.Menu = Menu;
window.Console = Console;
window.Unit = Unit;
window.Draggable = Draggable;
window.makeDraggable = makeDraggable;
window.makeDraggableWithDrop = makeDraggableWithDrop;
window.makeDropZone = makeDropZone;
window.Badge = Badge;
window.Tooltip = Tooltip;
window.Template = Template;
window.Minimal = Minimal;
window.Slice = Slice;
window.createSlice = createSlice;

window.Squirrel.Button = Button;
window.Squirrel.Slider = Slider;
window.Squirrel.Table = Table;
window.Squirrel.Matrix = Matrix;
window.Squirrel.List = List;
window.Squirrel.Menu = Menu;
window.Squirrel.Console = Console;
window.Squirrel.Unit = Unit;
window.Squirrel.Draggable = Draggable;
window.Squirrel.makeDraggable = makeDraggable;
window.Squirrel.makeDraggableWithDrop = makeDraggableWithDrop;
window.Squirrel.makeDropZone = makeDropZone;
window.Squirrel.Badge = Badge;
window.Squirrel.Tooltip = Tooltip;
window.Squirrel.Template = Template;
window.Squirrel.Minimal = Minimal;
window.Squirrel.Slice = Slice;
window.Squirrel.createSlice = createSlice;

// === ADD STATIC METHODS TO UNIT FOR COMPATIBILITY ===
Unit.selectUnits = selectUnits;
Unit.getSelectedUnits = getSelectedUnits;
Unit.deleteUnit = deleteUnit;
Unit.connectUnits = connectUnits;
Unit.disconnectUnits = disconnectUnits;
Unit.getAllConnections = getAllConnections;
Unit.getUnit = getUnit;
Unit.getAllUnits = getAllUnits;


// === IMPORT KICKSTART AFTER EXPOSURE ===
import('./kickstart.js').then(() => {
  // Toggle iPlug Web integration here (enabled by default). Comment to disable.
  try { initIPlugWeb(); } catch(e) { console.warn('iPlug init failed', e); }
}).catch(err => {
  console.error('❌ Kickstart error:', err);
});

