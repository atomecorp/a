/**
 * 🚀 SQUIRREL APPLICATION - SIMPLIFIED ENTRY POINT
 * Version with static imports for CDN bundling compatibility
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CRITICAL FIX: Prevent page reload on unhandled promise rejections in Tauri WebView
// This MUST be installed FIRST, in capture phase, before any async operations
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  if (window._squirrelErrorHandlerInstalled) return;
  window._squirrelErrorHandlerInstalled = true;

  // Capture phase handler - catches rejections before they bubble
  window.addEventListener('unhandledrejection', function (e) {
    console.error('[Squirrel] Unhandled Promise Rejection caught:', e.reason);
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }, true); // true = capture phase

  // Also add bubble phase for safety
  window.addEventListener('unhandledrejection', function (e) {
    e.preventDefault();
    return false;
  }, false);

  // Prevent any default error behavior that could cause reload
  window.onerror = function (msg, url, line, col, error) {
    console.error('[Squirrel] Uncaught error:', msg, 'at', url, line, col);
    return true; // Prevents default handling
  };

  console.log('[Squirrel] Error handlers installed (capture + bubble phase)');
})();

// atome imports
import './atome/atome.js';
import './atome/mcp.js';

// === STATIC ES6 IMPORTS ===
import './apis/essentials.js';
import './apis/utils.js';
import './apis/loader.js';
import './apis/shortcut.js';
import './apis/unified/adole_apis.js';
import DragDrop from './apis/dragdrop.js';
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
import dropDown from './components/dropDown_builder.js';
import Tooltip from './components/tooltip_builder.js';
import Template from './components/template_builder.js';
import Minimal from './components/minimal_builder.js';
import Slice, { createSlice } from './components/slice_builder.js';
import Intuition from './components/intuition_builder.js';


// === default behavior ===
import './default/shortcuts.js';

// === OPTIONAL INTEGRATIONS ===
import initIPlugWeb from './integrations/iplug_web.js';
import initSyncEngine from './integrations/sync_engine.js';
import './integrations/atome_sync.js'; // Exposes window.Atome



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
window.dropDown = dropDown;
window.Tooltip = Tooltip;
window.Template = Template;
window.Minimal = Minimal;
window.Slice = Slice;
window.createSlice = createSlice;
window.Intuition = Intuition;

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
window.Squirrel.Intuition = Intuition;
window.DragDrop = DragDrop;
window.Squirrel.DragDrop = DragDrop;

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
  // Toggle optional integrations once core runtime is ready
  try { initIPlugWeb(); } catch (e) { console.warn('iPlug init failed', e); }
  try { initSyncEngine(); } catch (e) { console.warn('SyncEngine init failed', e); }

  // === LOAD APPLICATION ===
  // Setup drag/drop prevention
  window.addEventListener("dragover", function (e) {
    e.preventDefault();
    e.stopPropagation();
  });
  window.addEventListener("drop", function (e) {
    e.preventDefault();
    e.stopPropagation();
  });

  // Import application once framework is ready
  let __appImported = false;
  function __importAppOnce() {
    if (__appImported) return;
    __appImported = true;
    import('../application/index.js').catch(err => {
      console.error('[Squirrel] Application import error:', err);
    });
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!isIOS) {
    // Non-iOS: import immediately since squirrel:ready was just dispatched by kickstart
    __importAppOnce();
  } else {
    // iOS waits for explicit native signal
    window.addEventListener('local-server-ready', __importAppOnce, { once: true });
    // Safety fallback: if native forgot to dispatch within 900ms, continue anyway
    setTimeout(__importAppOnce, 900);
  }
}).catch(err => {
  console.error('❌ Kickstart error:', err);
});

