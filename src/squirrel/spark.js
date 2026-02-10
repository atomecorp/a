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

})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY: Clear any stale UI state from previous session immediately on startup
// This prevents data leakage between users when the WebView caches DOM state
// ═══════════════════════════════════════════════════════════════════════════════
(function clearStaleSessionUI() {
  if (typeof document === 'undefined') return;

  // Clear project matrix content if it exists from previous session, but keep the container
  const matrixRoot = document.getElementById('eve_project_matrix');
  if (matrixRoot) {
    matrixRoot.classList.remove('is-active');
    matrixRoot.style.display = 'none';
    matrixRoot.style.opacity = '0';
    // Clear the scroll container content, not the root
    const scroll = matrixRoot.querySelector('#eve_project_matrix_scroll');
    if (scroll) {
      scroll.innerHTML = '';
    }
  }

  // Clear matrix tool state
  const matrixTool = document.getElementById('_intuition_matrix');
  if (matrixTool) {
    delete matrixTool.dataset.simpleActive;
    delete matrixTool.dataset.activeTag;
    matrixTool.style.removeProperty('background');
  }

  // Clear any stale project views - only if they exist AND have visible content
  // This is a soft clear to prevent cross-user data leakage
  const projectViews = document.querySelectorAll('[id^="project_view_"]');
  projectViews.forEach(view => {
    // Hide but don't remove - let the matrix handle removal properly
    view.style.display = 'none';
    view.style.visibility = 'hidden';
  });

})();

// atome imports
import './atome/atome.js';
import './atome/mcp.js';
import './ai/agent_gateway.js';
import './ai/default_tools.js';
import './dev/logging.js';
import './dev/dev_console.js';

// === STATIC ES6 IMPORTS ===
import './apis/essentials.js';
import './apis/utils.js';
import './apis/loader.js';
import './apis/shortcut.js';
import { AdoleAPI } from './apis/unified/adole_apis.js';
import { loadServerConfigOnce } from './apis/loadServerConfig.js';
import DragDrop from './apis/dragdrop.js';
import { $, define, observeMutations } from './squirrel.js';

// ============================================
// GLOBAL API EXPOSURE
// ============================================

// Make AdoleAPI available globally throughout the framework
if (typeof window !== 'undefined') {
  window.AdoleAPI = AdoleAPI;
}
// Also make it available in Node.js environments
if (typeof global !== 'undefined') {
  global.AdoleAPI = AdoleAPI;
}


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


// === default behavior ===
import './default/shortcuts.js';

// === OPTIONAL INTEGRATIONS ===
import initIPlugWeb from './integrations/iplug_web.js';
import UnifiedSync from './apis/unified/UnifiedSync.js';



// === IMMEDIATE GLOBAL EXPOSURE ===
window.Squirrel = window.Squirrel || {};
window.$ = $;
window.define = define;
window.observeMutations = observeMutations;
window.body = document.body;
window.toKebabCase = (str) => str.replace(/([A-Z])/g, '-$1').toLowerCase();

// === ATOME UI LAYER (above #intuition and #view) ===
let atomeUiLayerScheduled = false;
let atomeUiObserver = null;

function resolveLayerZIndex(intuitionEl, viewEl) {
  const parseZ = (el) => {
    if (!el || !el.ownerDocument) return NaN;
    const z = window.getComputedStyle(el).zIndex;
    const parsed = parseInt(z, 10);
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  const intuitionZ = parseZ(intuitionEl);
  const viewZ = parseZ(viewEl);
  const finiteLevels = [intuitionZ, viewZ].filter((level) => Number.isFinite(level));
  if (finiteLevels.length > 0) {
    return Math.max(0, ...finiteLevels) + 1;
  }
  return 1;
}

function placeAtomeUiLayer(layer) {
  const body = document.body || document.documentElement;
  if (!body || !layer) return;
  const intuition = document.getElementById('intuition');
  const view = document.getElementById('view');

  if (intuition && intuition.parentElement === body) {
    if (intuition.nextSibling !== layer) {
      body.insertBefore(layer, intuition.nextSibling);
    }
  } else if (view && view.parentElement === body) {
    if (view.previousSibling !== layer) {
      body.insertBefore(layer, view);
    }
  } else if (layer.parentElement !== body) {
    body.appendChild(layer);
  }

  layer.style.zIndex = String(resolveLayerZIndex(intuition, view));
}

function ensureAtomeUiLayer() {
  if (typeof document === 'undefined') return null;
  const body = document.body || document.documentElement;
  if (!body) return null;
  let layer = document.getElementById('atomeUI');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'atomeUI';
    layer.className = 'atome';
    layer.style.position = 'fixed';
    layer.style.inset = '0';
    layer.style.width = '100%';
    layer.style.height = '100%';
    layer.style.background = 'transparent';
    layer.style.pointerEvents = 'none';
    layer.style.overflow = 'auto';
  }
  placeAtomeUiLayer(layer);
  return layer;
}

function scheduleAtomeUiLayer() {
  if (atomeUiLayerScheduled) return;
  atomeUiLayerScheduled = true;
  const run = () => {
    atomeUiLayerScheduled = false;
    ensureAtomeUiLayer();
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 0);
  }
}

function initAtomeUiLayer() {
  const start = () => {
    ensureAtomeUiLayer();
    if (!atomeUiObserver && typeof MutationObserver !== 'undefined') {
      atomeUiObserver = new MutationObserver(scheduleAtomeUiLayer);
      const root = document.body || document.documentElement;
      if (root) {
        atomeUiObserver.observe(root, { childList: true });
      }
    }
    window.addEventListener('squirrel:ready', scheduleAtomeUiLayer);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

initAtomeUiLayer();

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
import('./kickstart.js').then(async () => {
  // Load server_config.json early to avoid hardcoded localhost endpoints
  try {
    const cfg = await loadServerConfigOnce();
    if (cfg) {
      // Debug: confirm globals exist (helps diagnose "missing Fastify WebSocket URL")
    } else {
      console.warn('[Squirrel] server_config.json not loaded (Fastify endpoints may be unavailable)');
    }
  } catch (e) {
    // Silent: config may not be available in some contexts
  }

  // Token key migration (legacy -> current)
  // Some older builds stored the Fastify JWT under 'auth_token'. The unified Fastify adapter
  // expects 'cloud_auth_token'. Copy once to avoid breaking current_user(), projects, etc.
  try {
    const cloud = localStorage.getItem('cloud_auth_token');
    const legacy = localStorage.getItem('auth_token');
    if (!cloud || cloud.length < 10) {
      if (legacy && legacy.length > 10) {
        localStorage.setItem('cloud_auth_token', legacy);
      }
      // Never promote local_auth_token to cloud_auth_token.
      // Tauri and Fastify often use different JWT secrets, which causes 401s.
    }
  } catch (e) {
    // Ignore storage errors
  }

  // Toggle optional integrations once core runtime is ready
  try { initIPlugWeb(); } catch (e) { console.warn('iPlug init failed', e); }
  try { UnifiedSync.init({ autoConnect: true }); } catch (e) { console.warn('UnifiedSync init failed', e); }

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
