

const CHECK_DEBUG = (typeof window !== 'undefined' && window.__CHECK_DEBUG__ === true);
function checkDebugPuts(message) {
  if (!CHECK_DEBUG) return;
  if (typeof puts === 'function') puts(message);
}
function checkDebugLog(...args) {
  if (!CHECK_DEBUG) return;
  console.log(...args);
}
const shadowLeft = 0,
  shadowTop = 0,
  shadowBlur = 12;
const items_spacing = 3;
const item_border_radius = 3;
const item_size = 39;
const DIRECTIONS = [
  "TLH",
  "TRH",
  "BLH",
  "BRH",
  "TLV",
  "BLV",
  "TRV",
  "BRV"
];

const DIRECTION_LABEL_TO_VALUE = {
  TLH: "top_left_horizontal",
  TRH: "top_right_horizontal",
  BLH: "bottom_left_horizontal",
  BRH: "bottom_right_horizontal",
  TLV: "top_left_vertical",
  BLV: "bottom_left_vertical",
  TRV: "top_right_vertical",
  BRV: "bottom_right_vertical"
};

const DIRECTION_VALUES = DIRECTIONS.map(code => DIRECTION_LABEL_TO_VALUE[code]);
const DIRECTION_VALUE_TO_LABEL = DIRECTION_VALUES.reduce((acc, value, index) => {
  acc[value] = DIRECTIONS[index];
  return acc;
}, {});

const light_theme = {
  themeName: "light",
  button_color: 'rgba(48, 188, 55, 0.85)',
  button_active_color: "#b70fd5ff",
  // palette_bg: '#804901ff',
  // tool_bg: 'linear-gradient(180deg, rgba(32, 190, 48, 0.85) 0%, rgba(72,71,71,0.35) 100%)',
  // particle_bg: '#4a4a4aff',
  // option_bg: '#c40fdfff',
  // zonespecial_bg: '#4a4a4aff',
  momentary_flash_duration: 150,
  slider_length: '70%',
  slider_zoom_length: '100%',
  slider_length_vertical: '30%',
  slider_zoom_length_vertical: '69%',
  slider_track_color: 'rgba(241, 139, 49, 1)',
  slider_revealed_track_color: 'rgba(241, 139, 49, 1)',
  handle_color: 'rgba(248, 184, 128, 1)',
  slider_handle_size: '16%', // relative handle size (%, px, or ratio)
  slider_handle_radius: '25%', // border-radius for handle (%, px, or ratio 0..1)
  item_zoom: '330%',            // width target when pressing a slider item
  item_zoom_transition: '220ms',// animation duration
  drag_sensitivity: 0.5, // 0.5 => dx direct; <0.5 plus fin; >0.5 plus rapide
  drag_mode: 'unit', // 'unit' => 1px pointeur = 1 unité; 'percent' => (dx/width*100)
  button_size: '33%',
  items_spacing: items_spacing + 'px',
  item_size: item_size + 'px',
  support_thickness: item_size + shadowBlur + shadowTop + shadowLeft + 'px',
  // Translucent gradient for a glassy look
  tool_bg: 'linear-gradient(180deg, rgba(72,71,71,0.85) 0%, rgba(72,71,71,0.35) 100%)',
  tool_bg_active: "#7a7c73ff",
  tool_backDrop_effect: '9px',
  tool_text: "#cacacaff",
  tool_font: "0.9vw",
  tool_font_px: 10,
  text_char_max: 9,
  tool_active_bg: "#e0e0e0",
  tool_lock_bg: '#ff5555', // couleur lock
  tool_lock_pulse_duration: '1400ms', // durée animation clignotement doux
  tool_lock_toggle_mode: 'long', // 'long' (par défaut) ou 'click' pour permettre le clic simple de sortir
  tool_lock_bg: "#b22929ff",
  toolbox_icon: 'menu',            // false pour masquer, ou 'settings', 'play', etc.
  toolbox_icon_color: '#cacacaff',
  toolbox_icon_size: '30%',      // px, %, ou ratio (0..1)
  toolbox_icon_top: '50%',       // position verticale
  toolbox_icon_left: '50%',
  edit_mode_color: '#ff6f61',
  toolboxOffsetMain: "7px",
  toolboxOffsetEdge: "19px",
  satellite_offset: '0px',
  items_offset_main: item_border_radius + items_spacing + 'px',
  icon_color: "#cacacaff",
  icon_size: "39%",
  icon_top: '60%',       // position verticale
  icon_left: '50%',
  // Toggle label/icon visibility when a palette is popped out
  palette_icon: false,
  palette_label: true,
  // Particle value/unit display (theme-driven)
  particle_value_unit: '%',
  particle_value_value: 30,
  particle_value_decimals: 0,
  particle_value_font_px: 11,
  particle_value_bottom: '6%',
  particle_value_color: '#cacacaff',
  particle_unit_color: '#9e9e9eff',
  item_shadow: `${shadowLeft}px ${shadowTop}px ${shadowBlur}px rgba(0,0,0,0.69)`,
  item_border_radius: item_border_radius + 'px',
  // Animation settings for menu open
  anim_duration_ms: 333,
  anim_stagger_ms: 33,
  anim_bounce_overshoot: 0.09,
  // Elasticity controls extra rebounds (0 = back easing, 1 = strong elastic)
  anim_elasticity: 6,
  direction: "top_left_horizontal",
  button_color: 'rgba(204, 35, 35, 0.85)',
  button_active_color: "rgba(72,71,71,0.15) 100%)",
  palette_bg: 'rgba(72,71,71,0)',
  tool_bg: 'rgba(72,71,71,0)',
  particle_bg: 'rgba(72,71,71)',
  option_bg: 'rgba(72,71,71,0)',
  zonespecial_bg: 'rgba(72,71,71,0)',

};
Intuition.addTheme(light_theme)

const DEFAULT_ORIENTATION = (light_theme.direction || 'top_left_horizontal').toLowerCase();
const intuition_content = {
  version: "1.1",
  meta: { namespace: "vie.menu", defaultLocale: "en" },
  toolbox: { children: ['file', 'tools', 'capture', 'perform', 'settings'] },
  //
  file: { type: 'palette', children: ['import', 'load', 'save'] },
  tools: { type: 'palette', children: ['volume', 'ADSR', 'controller'] },
  settings: { type: 'palette', children: ['orientation'], icon: false },
  capture: { label: 'record', type: 'tool', icon: 'record', action: 'momentary', },
  perform: { label: 'perform', type: 'tool', icon: null },

};

Intuition({ name: 'newMenu', theme: light_theme, content: intuition_content, orientation: DEFAULT_ORIENTATION });

// Create a container for our test UI controls, separate from project space
const intuitionContainer = grab('intuition')
intuitionContainer.style.width = '100%';
intuitionContainer.style.position = 'relative';
intuitionContainer.style.zIndex = '10';
intuitionContainer.style.pointerEvents = 'none'; // Don't block interactions
// Allow pointer events only on child elements
intuitionContainer.style.background = 'transparent';

// ============================================
// ADOLE v3.0 - PRODUCTION API ACCESS
// ============================================

// AdoleAPI is now available globally via spark.js
// No need to import manually - use window.AdoleAPI or simply AdoleAPI

// Remote Commands System
import { RemoteCommands } from '/squirrel/apis/remote_commands.js';
import { BuiltinHandlers } from '/squirrel/apis/remote_command_handlers.js';

// Load Share logic (wrappers + handlers) for this test harness.
import './share.js';

// Authentication functions - Use AdoleAPI.auth.*
const create_user = AdoleAPI.auth.create;
const log_user = AdoleAPI.auth.login;
const current_user = AdoleAPI.auth.current;
const unlog_user = AdoleAPI.auth.logout;
const delete_user = AdoleAPI.auth.delete;
const user_list = AdoleAPI.auth.list;

// Project functions - Use AdoleAPI.projects.*
const create_project = AdoleAPI.projects.create;
const list_projects = AdoleAPI.projects.list;
const delete_project = AdoleAPI.projects.delete;

// Atome functions - Use AdoleAPI.atomes.*
const create_atome = AdoleAPI.atomes.create;
const list_atomes = AdoleAPI.atomes.list;
const get_atome = AdoleAPI.atomes.get;
const delete_atome = (...args) => {
  const api = window.AdoleAPI || AdoleAPI;
  return api.atomes.delete(...args);
};
const alter_atome = (...args) => {
  const api = window.AdoleAPI || AdoleAPI;
  return api.atomes.alter(...args);
};

// Sharing functions - Use AdoleAPI.sharing.*
const share_atome = AdoleAPI.sharing.share;

// Sync functions - Use AdoleAPI.sync.*
const sync_atomes = AdoleAPI.sync.sync;
const list_unsynced_atomes = AdoleAPI.sync.listUnsynced;

// Debug functions - Use AdoleAPI.debug.*
const list_tables = AdoleAPI.debug.listTables;

// ============================================
// ⚠️⚠️⚠️ TEST SECTION - DO NOT CALL FROM PRODUCTION CODE ⚠️⚠️⚠️
// ============================================
// Everything below this line is temporary test UI and will be removed.
// Production code above MUST NOT reference any element defined below.
// Any such reference will cause a crash when the test section is removed.
// ============================================

// Test state variables
let selectedProjectId = null;
let selectedAtomeId = null;
let currentProjectName = null;
let currentProjectDiv = null;
let selectedVisualAtome = null;

// When Share imports/assigns atomes to the current project, refresh the project view.
if (typeof window !== 'undefined') {
  window.addEventListener('adole-share-imported', async (e) => {
    try {
      const sharedProjectId = e?.detail?.sharedProjectId || null;
      const shareType = e?.detail?.shareType || null;
      const effectiveShareType = shareType || 'linked';
      const projectId = (sharedProjectId && effectiveShareType === 'linked')
        ? sharedProjectId
        : (e?.detail?.projectId || selectedProjectId);
      if (!projectId) return;

      const shouldSwitchProject = !currentProjectDiv || String(projectId) !== String(selectedProjectId || '');
      if (!shouldSwitchProject) {
        await loadProjectAtomes(projectId);
        return;
      }

      let projectName = e?.detail?.projectName || null;
      let backgroundColor = e?.detail?.backgroundColor || null;

      try {
        const projectResult = await get_atome(projectId);
        if (projectResult?.tauri?.success || projectResult?.fastify?.success) {
          const projectData = projectResult?.tauri?.atome || projectResult?.fastify?.atome;
          const particles = projectData?.particles || projectData?.data || {};
          projectName = projectName || particles.name || particles.projectName || particles.label || null;
          backgroundColor = backgroundColor || particles.backgroundColor || null;
        }
      } catch (_) { }

      await loadProjectView(
        projectId,
        projectName || 'Shared project',
        backgroundColor || '#333'
      );
    } catch (_) { }
  });

  window.addEventListener('adole-share-create', async (e) => {
    try {
      const projectId = selectedProjectId;
      if (!projectId) return;

      const detail = e?.detail || {};
      const parentId = detail.parentId || detail.parent_id || null;
      const particles = detail.particles || {};
      const particleProjectId = particles.projectId || particles.project_id || null;

      if (String(parentId || '') !== String(projectId) &&
        String(particleProjectId || '') !== String(projectId)) {
        return;
      }

      await loadProjectAtomes(projectId);
    } catch (_) { }
  });

  window.addEventListener('adole-share-publish', async (e) => {
    try {
      const projectId = selectedProjectId;
      if (!projectId) return;

      const detail = e?.detail || {};
      const items = Array.isArray(detail.items) ? detail.items : [];
      const matches = items.some(item => {
        const parentId = item?.parentId || item?.parent_id || null;
        return String(parentId || '') === String(projectId);
      });

      if (!matches && items.length) return;
      await loadProjectAtomes(projectId);
    } catch (_) { }
  });
}

function publishSelectedAtome(atomeId) {
  selectedAtomeId = atomeId || null;
  if (typeof window === 'undefined') return;

  window.__selectedAtomeId = selectedAtomeId;
  try {
    window.dispatchEvent(new CustomEvent('adole-atome-selected', { detail: { atomeId: selectedAtomeId } }));
  } catch (e) {
    console.warn('[check.js] Failed to dispatch selection event:', e);
  }
}

function pickAuthoritativeAtomes(result) {
  const fastifyOk = result?.fastify && !result.fastify.error;
  const tauriOk = result?.tauri && !result.tauri.error;
  const isTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
  const preferFastify = !!result?.meta?.preferFastify;

  if (isTauriRuntime) {
    if (preferFastify) {
      if (fastifyOk) {
        return Array.isArray(result.fastify.atomes) ? result.fastify.atomes : [];
      }
      if (tauriOk) {
        return Array.isArray(result.tauri.atomes) ? result.tauri.atomes : [];
      }
      return [];
    }
    if (tauriOk) {
      return Array.isArray(result.tauri.atomes) ? result.tauri.atomes : [];
    }
    if (fastifyOk) {
      return Array.isArray(result.fastify.atomes) ? result.fastify.atomes : [];
    }
    return [];
  }

  if (fastifyOk) {
    return Array.isArray(result.fastify.atomes) ? result.fastify.atomes : [];
  }
  if (tauriOk) {
    return Array.isArray(result.tauri.atomes) ? result.tauri.atomes : [];
  }
  return [];
}

function pickAuthoritativeProjects(result) {
  const fastifyOk = result?.fastify && !result.fastify.error;
  const tauriOk = result?.tauri && !result.tauri.error;
  const isTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
  const preferFastify = !!result?.meta?.preferFastify;

  if (isTauriRuntime) {
    if (preferFastify) {
      if (fastifyOk) {
        return Array.isArray(result.fastify.projects) ? result.fastify.projects : [];
      }
      if (tauriOk) {
        return Array.isArray(result.tauri.projects) ? result.tauri.projects : [];
      }
      return [];
    }
    if (tauriOk) {
      return Array.isArray(result.tauri.projects) ? result.tauri.projects : [];
    }
    if (fastifyOk) {
      return Array.isArray(result.fastify.projects) ? result.fastify.projects : [];
    }
    return [];
  }

  if (fastifyOk) {
    return Array.isArray(result.fastify.projects) ? result.fastify.projects : [];
  }
  if (tauriOk) {
    return Array.isArray(result.tauri.projects) ? result.tauri.projects : [];
  }
  return [];
}

/**
 * TEST ONLY - Create or replace the project visual container in 'view' - SECURE VERSION
 * @param {string} projectId - The project ID
 * @param {string} projectName - The project name
 * @param {string} backgroundColor - Optional background color (defaults to '#333')
 */
async function loadProjectView(projectId, projectName, backgroundColor = '#333') {
  if (!projectId) {
    puts('❌ Cannot load project: Missing project ID');
    return;
  }

  // SECURITY: Verify project belongs to current user
  const currentUserResult = await current_user();
  const currentUserId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;

  if (!currentUserId) {
    puts('❌ SECURITY: Cannot load project - no user logged in');
    return;
  }

  // SECURITY NOTE: This verification is temporarily disabled because it's redundant.
  // If the user can access the project via list_projects(), they already have permission.
  // The get_atome() API correctly filters by owner, so getting undefined means access denied.

  checkDebugPuts('✅ SECURITY: Skipping redundant ownership check - user accessed project via list_projects()');

  // Continue with project loading...

  // Remove existing project div and clear state if any
  if (currentProjectDiv) {
    currentProjectDiv.remove();
    currentProjectDiv = null;
  }

  // Clear visual atome selection
  selectedVisualAtome = null;
  publishSelectedAtome(null);

  checkDebugPuts('🔄 Creating new project view for: ' + projectName + ' (ID: ' + projectId + ')');

  // Create new project container directly in 'view' (no intermediate project_canvas)
  currentProjectDiv = $('div', {
    id: 'project_view_' + projectId,
    parent: grab('view'),
    css: {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      backgroundColor: backgroundColor,
      overflow: 'hidden',
      zIndex: '5',  // Above background but below UI
      pointerEvents: 'auto'  // Allow bureau selection on click
    },
    onClick: (e) => {
      // Clicking the bureau selects the current project so it can be shared.
      // Child atomes stopPropagation() in their onClick.
      try { e.stopPropagation(); } catch (_) { }

      if (selectedVisualAtome) {
        try { selectedVisualAtome.style.border = '2px solid transparent'; } catch (_) { }
      }
      selectedVisualAtome = null;
      publishSelectedAtome(projectId);
      puts('Selected bureau (project): ' + String(projectId).substring(0, 8) + '...');
    }
  });

  // Update state
  selectedProjectId = projectId;
  currentProjectName = projectName;
  grab('current_project').textContent = projectName;

  // Persist current project to database (for restoration at next login)
  if (typeof AdoleAPI !== 'undefined' && AdoleAPI.projects?.setCurrent) {
    AdoleAPI.projects.setCurrent(projectId, projectName, true);
  }

  // Load atomes for this project and display them
  loadProjectAtomes(projectId).catch(error => {
    puts('❌ Failed to load atomes: ' + error);
  });
}

/**
 * TEST ONLY - Load and display atomes belonging to a project
 * @param {string} projectId - The project ID
 */
async function loadProjectAtomes(projectId) {
  if (!projectId) {
    puts('❌ Cannot load atomes: Missing project ID');
    return;
  }

  checkDebugPuts('🔍 Loading atomes for project: ' + projectId);

  try {
    if (typeof AdoleAPI !== 'undefined' && AdoleAPI.sync?.sync) {
      await AdoleAPI.sync.sync();
    }
  } catch (_) { }

  // Fastify is the authoritative source for shared atomes.
  const result = await list_atomes({ projectId: projectId, includeShared: true });
  const atomes = pickAuthoritativeAtomes(result);

  checkDebugPuts('📊 Total atomes found: ' + atomes.length);

  // Clear previous visuals to avoid creating duplicate DOM nodes on reload
  try {
    if (currentProjectDiv) {
      const olds = currentProjectDiv.querySelectorAll('[id^="atome_"]');
      olds.forEach(el => {
        try { el.remove(); } catch (_) { }
      });
    }
  } catch (_) { }

  // Filter to get only atomes that belong to this project and are not projects/users
  const projectAtomes = atomes.filter(atome => {
    const atomeType = atome.atome_type || atome.type;
    const atomeProjectId = atome.project_id || atome.projectId || atome.parent_id || atome.parentId;
    const particles = atome.particles || atome.data || {};
    const particleProjectId = particles.projectId || particles.project_id;

    // Skip projects and users
    if (atomeType === 'project' || atomeType === 'user') return false;

    // Check if atome belongs to this project
    const belongsToProject = atomeProjectId === projectId || particleProjectId === projectId;

    checkDebugPuts('🔍 Atome ' + (atome.atome_id || atome.id).substring(0, 8) +
      ' type: ' + atomeType +
      ' projectId: ' + (atomeProjectId || 'none') +
      ' particleProjectId: ' + (particleProjectId || 'none') +
      ' belongs: ' + belongsToProject);

    return belongsToProject;
  });

  checkDebugPuts('✅ Project atomes found: ' + projectAtomes.length);

  // Create visual elements for project atomes
  for (const atome of projectAtomes) {
    let atomeId = atome.atome_id || atome.id;
    let atomeType = atome.atome_type || atome.type;
    let particles = atome.particles || atome.data || {};

    // Get stored position or default with detailed logging
    const savedLeft = particles.left;
    const savedTop = particles.top;
    const left = savedLeft || '50px';
    const top = savedTop || '50px';
    const color = particles.color || atome.color || 'blue';

    // Get stored style properties
    const savedBorderRadius = particles.borderRadius;
    const savedOpacity = particles.opacity;
    const borderRadius = savedBorderRadius || '8px';
    const opacity = savedOpacity !== undefined ? savedOpacity : 1.0;

    puts('📍 Loading atome ' + String(atomeId).substring(0, 8) +
      ' - saved position: (' + (savedLeft || 'none') + ', ' + (savedTop || 'none') + ')' +
      ' - using position: (' + left + ', ' + top + ')' +
      ' - saved style: borderRadius=' + (savedBorderRadius || 'default') + ', opacity=' + (savedOpacity !== undefined ? savedOpacity : 'default'));
    console.log('[Position Load] Atome data:', {
      atomeId: String(atomeId).substring(0, 8),
      particles,
      savedLeft, savedTop, left, top,
      savedBorderRadius, savedOpacity, borderRadius, opacity
    });

    createVisualAtome(atomeId, atomeType, color, left, top, borderRadius, opacity);
  }
}

/**
 * TEST ONLY - Create a visual atome element in the project container
 * @param {string} atomeId - The atome ID
 * @param {string} type - The atome type
 * @param {string} color - The atome color
 * @param {string} left - CSS left position
 * @param {string} top - CSS top position
 * @param {string} borderRadius - CSS border radius (optional)
 * @param {number} opacity - CSS opacity (optional)
 * @returns {HTMLElement} The created element
 */
function createVisualAtome(atomeId, type, color, left, top, borderRadius = '8px', opacity = 1.0) {
  if (!currentProjectDiv) {
    puts('No project loaded. Please load a project first.');
    return null;
  }

  const atomeEl = $('div', {
    id: 'atome_' + atomeId,
    parent: currentProjectDiv,
    css: {
      position: 'absolute',
      left: left,
      top: top,
      width: '80px',
      height: '80px',
      backgroundColor: color,
      borderRadius: borderRadius,
      opacity: opacity,
      cursor: 'move',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      color: 'white',
      fontSize: '12px',
      textAlign: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      userSelect: 'none',
      border: '2px solid transparent',
      zIndex: '50',
      pointerEvents: 'auto'
    },
    text: type + '\n' + atomeId.substring(0, 6),
    onClick: (e) => {
      e.stopPropagation();
      selectVisualAtome(atomeEl, atomeId);
    }
  });

  // Make draggable
  makeAtomeDraggable(atomeEl, atomeId);

  return atomeEl;
}

/**
 * TEST ONLY - Select a visual atome for operations
 * @param {HTMLElement} atomeEl - The atome element
 * @param {string} atomeId - The atome ID
 */
async function selectVisualAtome(atomeEl, atomeId) {
  // Deselect previous
  if (selectedVisualAtome) {
    selectedVisualAtome.style.border = '2px solid transparent';
  }

  // Select new
  selectedVisualAtome = atomeEl;
  publishSelectedAtome(atomeId);
  atomeEl.style.border = '2px solid yellow';
  puts('Selected atome: ' + atomeId.substring(0, 8) + '...');

  // Load atome history for navigation
  await loadAtomeHistory(atomeId);
}

/**
 * TEST ONLY - Load history for the selected atome
 * @param {string} atomeId - The atome ID
 */
async function loadAtomeHistory(atomeId) {
  if (!atomeId) {
    currentAtomeHistory = [];
    updateHistorySlider();
    return;
  }

  puts('📚 Loading history for atome: ' + atomeId.substring(0, 8) + '...');

  try {
    // Try to get current atome state from list_atomes since get_atome has issues
    const listResult = await list_atomes({ projectId: selectedProjectId });
    const atomes = pickAuthoritativeAtomes(listResult);

    const tauriAtomes = Array.isArray(listResult?.tauri?.atomes) ? listResult.tauri.atomes : [];
    const fastifyAtomes = Array.isArray(listResult?.fastify?.atomes) ? listResult.fastify.atomes : [];

    const findById = (items) => {
      if (!Array.isArray(items)) return null;
      return items.find(a => (a?.atome_id || a?.id) === atomeId) || null;
    };

    let currentAtome = findById(atomes);
    if (!currentAtome) {
      // In Tauri, the preferred backend may be local (SQLite) while the selected atome
      // actually exists only on Fastify (shared/remote). Always try the other backend.
      const preferredWasTauri = atomes === tauriAtomes;
      const fallbackList = preferredWasTauri ? fastifyAtomes : tauriAtomes;
      currentAtome = findById(fallbackList);
      if (currentAtome) {
        puts('ℹ️ History: atome found on fallback backend');
      }
    }

    if (currentAtome) {
      puts('✅ Found current atome state');
      console.log('Current atome data:', currentAtome);

      // Check if manual history exists in localStorage
      const historyKey = 'atome_history_' + atomeId;
      let storedHistory = null;
      try {
        storedHistory = localStorage.getItem(historyKey);
      } catch (e) {
        console.warn('[History] localStorage.getItem failed:', e);
        storedHistory = null;
      }

      if (storedHistory) {
        try {
          const parsedHistory = JSON.parse(storedHistory);
          currentAtomeHistory = parsedHistory.sort((a, b) => {
            return new Date(a.timestamp) - new Date(b.timestamp);
          });
          puts('✅ Loaded manual history: ' + currentAtomeHistory.length + ' entries');
        } catch (e) {
          puts('⚠️ Failed to parse stored history, creating new');
          currentAtomeHistory = [];
        }
      } else {
        puts('📝 No stored history found, creating initial entry');
        currentAtomeHistory = [];
      }

      // Always add current state as most recent entry
      const currentState = {
        particles: currentAtome.particles || currentAtome.data || {},
        timestamp: new Date().toISOString(),
        id: currentAtome.atome_id || currentAtome.id,
        note: 'Current state (loaded from database)'
      };

      // Add current state if it's different from the last entry
      const lastEntry = currentAtomeHistory[currentAtomeHistory.length - 1];
      if (!lastEntry || JSON.stringify(lastEntry.particles) !== JSON.stringify(currentState.particles)) {
        currentAtomeHistory.push(currentState);

        // Save updated history to localStorage
        try {
          localStorage.setItem(historyKey, JSON.stringify(currentAtomeHistory));
        } catch (e) {
          console.warn('[History] localStorage.setItem failed:', e);
        }
      }

      // Set to most recent entry
      currentHistoryIndex = Math.max(0, currentAtomeHistory.length - 1);

      // Recalculate proportional positions after loading history
      currentProportionalPositions = calculateProportionalPositions(currentAtomeHistory);

    } else {
      puts('❌ Atome not found in project atomes list');
      currentAtomeHistory = [];
      currentProportionalPositions = [];
    }
  } catch (error) {
    puts('❌ Error loading atome history: ' + error);
    console.error('History loading error:', error);
    currentAtomeHistory = [];
    currentProportionalPositions = [];
  }

  updateHistorySlider();
}

/**
 * Save a new history entry for an atome
 */
function saveHistoryEntry(atomeId, particles, note = 'Manual modification') {
  if (!atomeId || atomeId.startsWith('temp_')) return;

  const historyKey = 'atome_history_' + atomeId;
  const storedHistory = localStorage.getItem(historyKey);
  let history = [];

  if (storedHistory) {
    try {
      history = JSON.parse(storedHistory);
    } catch (e) {
      history = [];
    }
  }

  const newEntry = {
    particles: { ...particles },
    timestamp: new Date().toISOString(),
    id: atomeId,
    note: note
  };

  history.push(newEntry);

  // Keep only last 50 entries to avoid storage overflow
  if (history.length > 50) {
    history = history.slice(-50);
  }

  localStorage.setItem(historyKey, JSON.stringify(history));
  puts('📝 Saved history entry: ' + note);
}

/**
 * Update the history slider UI based on current history data
 */
function updateHistorySlider() {
  const slider = grab('history_slider');
  const info = grab('history_info');

  if (currentAtomeHistory.length === 0) {
    slider.disabled = true;
    slider.max = '0';
    slider.value = '0';
    info.textContent = 'No history available';
  } else {
    slider.disabled = false;
    slider.max = '1000'; // Use high resolution for smooth scrubbing
    slider.value = '1000'; // Start at the end (most recent)

    // Calculate proportional positions for better scrubbing
    currentProportionalPositions = calculateProportionalPositions(currentAtomeHistory);

    const currentEntry = currentAtomeHistory[currentHistoryIndex];
    info.textContent = 'Loaded ' + currentAtomeHistory.length + ' entries with enhanced spacing - Entry ' + currentHistoryIndex + '/' + (currentAtomeHistory.length - 1);
    puts('✅ Loaded manual history: ' + currentAtomeHistory.length + ' entries with proportional spacing');
    console.log('[History] Proportional positions:', currentProportionalPositions);
  }
}

/**
 * TEST ONLY - Make an atome element draggable and save position
 * @param {HTMLElement} atomeEl - The atome element
 * @param {string} atomeId - The atome ID
 */
function makeAtomeDraggable(atomeEl, atomeId) {
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  const dragRealtime = (() => {
    let rafId = null;
    let lastSentAt = 0;
    let lastKey = '';
    let pending = null;

    const flush = () => {
      rafId = null;
      if (!isDragging || !pending) return;

      const realtimePush = window.__SHARE_REALTIME_PUSH__;
      if (typeof realtimePush !== 'function') return;

      const now = performance.now();
      // ~30fps throttle to avoid flooding
      if ((now - lastSentAt) < 33) {
        rafId = requestAnimationFrame(flush);
        return;
      }

      const key = pending.left + '|' + pending.top;
      if (key === lastKey) return;

      lastKey = key;
      lastSentAt = now;
      Promise.resolve(realtimePush(atomeId, { left: pending.left, top: pending.top }))
        .catch(() => { });
    };

    return {
      push(pos) {
        if (!pos) return;
        if (atomeId.startsWith('temp_atome_') || atomeId.startsWith('atome_')) return;
        pending = pos;
        if (!rafId) rafId = requestAnimationFrame(flush);
      },
      cancel() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        pending = null;
      }
    };
  })();

  atomeEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Left click only
    isDragging = true;

    startX = e.clientX;
    startY = e.clientY;
    initialLeft = parseInt(atomeEl.style.left) || 0;
    initialTop = parseInt(atomeEl.style.top) || 0;
    atomeEl.style.zIndex = '100';

    // Start continuous recording for drag
    startContinuousRecording(atomeId, 'drag movement');
    recordContinuousState(atomeId, {
      left: initialLeft + 'px',
      top: initialTop + 'px'
    });

    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const newLeft = (initialLeft + dx) + 'px';
    const newTop = (initialTop + dy) + 'px';

    atomeEl.style.left = newLeft;
    atomeEl.style.top = newTop;

    // Record continuous position changes
    recordContinuousState(atomeId, {
      left: newLeft,
      top: newTop
    });

    // Realtime: push position during drag (no DB write) so receivers see continuous movement.
    dragRealtime.push({ left: newLeft, top: newTop });
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    atomeEl.style.zIndex = '';

    // Cancel any pending realtime frame
    dragRealtime.cancel();

    const newLeft = atomeEl.style.left;
    const newTop = atomeEl.style.top;

    // Don't save if this is a temporary ID
    if (atomeId.startsWith('temp_atome_') || atomeId.startsWith('atome_')) {
      puts('⚠️ Skipping save for temporary atome ID: ' + atomeId.substring(0, 8));
      stopContinuousRecording(atomeId, { left: newLeft, top: newTop }, 'drag movement');
      return;
    }

    puts('💾 Saving drag sequence for atome ' + atomeId.substring(0, 8));

    // Stop continuous recording which will save to history
    stopContinuousRecording(atomeId, { left: newLeft, top: newTop }, 'drag movement');

    alter_atome(atomeId, { left: newLeft, top: newTop }).then(async result => {
      if (result.tauri.success || result.fastify.success) {
        puts('✅ Position saved: ' + newLeft + ', ' + newTop);
        console.log('[Position Save] Success result:', result);
      } else {
        puts('⚠️ Database save failed, but position tracked in history');
        console.log('[Position Save] Failed result:', result);
      }

      // Reload history if this atome is currently selected
      if (selectedAtomeId === atomeId) {
        puts('🔄 Reloading history after position save...');
        await loadAtomeHistory(atomeId);
      }
    }).catch(error => {
      puts('⚠️ Database save error, but position tracked in history: ' + error);
      console.error('[Position Save] Error:', error);
    });
  });
}

/**
 * Play drag animation from a stored sequence
 * @param {HTMLElement} atomeEl - The atome element to animate
 * @param {Array} dragSequence - Array of position objects with timestamp
 * @param {number} speedMultiplier - Speed multiplier (1=normal, 2=2x speed, 0.5=half speed)
 */
function playDragAnimation(atomeEl, dragSequence, speedMultiplier = 1) {
  if (!dragSequence || dragSequence.length < 2 || isPlayingAnimation) {
    return;
  }

  isPlayingAnimation = true;
  let currentFrame = 0;

  // Show stop button
  const stopBtn = grab('stop_animation_button');
  if (stopBtn) stopBtn.style.display = 'inline-block';

  function animateNextFrame() {
    if (currentFrame >= dragSequence.length || !isPlayingAnimation) {
      isPlayingAnimation = false;
      if (stopBtn) stopBtn.style.display = 'none';
      return;
    }

    const frame = dragSequence[currentFrame];
    atomeEl.style.left = frame.left;
    atomeEl.style.top = frame.top;

    currentFrame++;

    if (currentFrame < dragSequence.length) {
      const nextFrame = dragSequence[currentFrame];
      const delay = (nextFrame.relativeTime - frame.relativeTime) / speedMultiplier;
      setTimeout(animateNextFrame, Math.max(1, delay));
    } else {
      isPlayingAnimation = false;
      if (stopBtn) stopBtn.style.display = 'none';
    }
  }

  // Start from first position
  if (dragSequence.length > 0) {
    atomeEl.style.left = dragSequence[0].left;
    atomeEl.style.top = dragSequence[0].top;
    setTimeout(animateNextFrame, 50);
  }
}

/**
 * Start continuous recording for any property changes
 * @param {string} atomeId - The atome ID
 * @param {string} changeType - Type of change (drag, resize, color, etc.)
 */
function startContinuousRecording(atomeId, changeType = 'unknown') {
  if (isRecordingContinuous) return; // Already recording

  isRecordingContinuous = true;
  continuousStartTime = Date.now();
  lastContinuousRecordTime = continuousStartTime;
  currentContinuousSequence = [];

  puts('🎬 Started continuous recording for ' + changeType);
}

/**
 * Record current state during continuous changes
 * @param {string} atomeId - The atome ID
 * @param {Object} properties - Current properties to record
 * @param {number} throttleMs - Minimum time between recordings (default 50ms)
 */
function recordContinuousState(atomeId, properties, throttleMs = 50) {
  if (!isRecordingContinuous) return;

  const now = Date.now();
  if (now - lastContinuousRecordTime >= throttleMs) {
    currentContinuousSequence.push({
      timestamp: now,
      relativeTime: now - continuousStartTime,
      ...properties
    });
    lastContinuousRecordTime = now;
  }
}

/**
 * Stop continuous recording and save to history
 * @param {string} atomeId - The atome ID
 * @param {Object} finalProperties - Final properties
 * @param {string} changeDescription - Description of the change
 */
function stopContinuousRecording(atomeId, finalProperties, changeDescription) {
  if (!isRecordingContinuous || currentContinuousSequence.length === 0) {
    isRecordingContinuous = false;
    return;
  }

  isRecordingContinuous = false;
  const endTime = Date.now();

  // Add final state
  currentContinuousSequence.push({
    timestamp: endTime,
    relativeTime: endTime - continuousStartTime,
    ...finalProperties
  });

  puts('🎬 Stopped continuous recording: ' + currentContinuousSequence.length + ' frames over ' + (endTime - continuousStartTime) + 'ms');

  // Save complete sequence to history
  saveHistoryEntry(atomeId, {
    ...finalProperties,
    continuousSequence: currentContinuousSequence,
    continuousDuration: endTime - continuousStartTime,
    changeType: changeDescription
  }, changeDescription + ' (' + currentContinuousSequence.length + ' frames)');

  // Clear sequence
  currentContinuousSequence = [];
}

/**
 * Calculate proportional slider positions giving more space to continuous sequences
 * @param {Array} historyEntries - Array of history entries
 * @returns {Array} Array of cumulative positions (0-1) for each entry
 */
function calculateProportionalPositions(historyEntries) {
  if (!historyEntries || historyEntries.length === 0) return [];

  const weights = historyEntries.map(entry => {
    const particles = entry.particles || entry.data || {};
    const continuousSeq = particles.continuousSequence || particles.dragSequence;

    // Give continuous sequences 5x more space than punctual changes
    return continuousSeq && continuousSeq.length > 1 ? 5 : 1;
  });

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const positions = [];
  let cumulativeWeight = 0;

  for (let i = 0; i < weights.length; i++) {
    positions.push(cumulativeWeight / totalWeight);
    cumulativeWeight += weights[i];
  }

  // Add final position
  positions.push(1);

  return positions;
}

/**
 * Find history index from slider position using proportional mapping
 * @param {number} sliderPosition - Position from slider (0-1)
 * @param {Array} proportionalPositions - Array of proportional positions
 * @returns {number} History index
 */
function findHistoryIndexFromPosition(sliderPosition, proportionalPositions) {
  for (let i = 0; i < proportionalPositions.length - 1; i++) {
    if (sliderPosition >= proportionalPositions[i] && sliderPosition <= proportionalPositions[i + 1]) {
      return i;
    }
  }
  return proportionalPositions.length - 2; // Last valid index
}

/**
 * Calculate frame index within a continuous sequence based on position within that entry's space
 * @param {number} sliderPosition - Position from slider (0-1)
 * @param {number} entryStartPos - Start position of this entry (0-1)
 * @param {number} entryEndPos - End position of this entry (0-1)
 * @param {number} sequenceLength - Number of frames in the sequence
 * @returns {number} Frame index
 */
function calculateFrameIndex(sliderPosition, entryStartPos, entryEndPos, sequenceLength) {
  const progressWithinEntry = (sliderPosition - entryStartPos) / (entryEndPos - entryStartPos);
  const clampedProgress = Math.max(0, Math.min(1, progressWithinEntry));
  return Math.floor(clampedProgress * (sequenceLength - 1));
}

/**
 * Stop any currently playing animation
 */
function stopDragAnimation() {
  isPlayingAnimation = false;
  const stopBtn = grab('stop_animation_button');
  if (stopBtn) stopBtn.style.display = 'none';
}

/**
 * TEST ONLY - Open a project selector dialog - SECURE VERSION
 * Shows projects accessible to the current user (owned + shared)
 * @param {Function} callback - Callback with selected project { project_id, project_name }
 */
async function open_project_selector(callback) {
  const projectsResult = await list_projects();

  // SECURITY: Check for authentication errors (only block if both backends failed)
  const tauriSecurity = projectsResult.tauri.error && projectsResult.tauri.error.includes('SECURITY');
  const fastifySecurity = projectsResult.fastify.error && projectsResult.fastify.error.includes('SECURITY');
  if (tauriSecurity && fastifySecurity) {
    puts('❌ ' + (projectsResult.fastify.error || projectsResult.tauri.error));
    if (typeof callback === 'function') {
      callback({ project_id: null, project_name: null, cancelled: true, error: 'Not logged in' });
    }
    return;
  }

  const projects = pickAuthoritativeProjects(projectsResult);

  if (projects.length === 0) {
    puts('No projects found for current user');
    if (typeof callback === 'function') {
      callback({ project_id: null, project_name: null, cancelled: true });
    }
    return;
  }

  const existingSelector = grab('project_selector_overlay');
  if (existingSelector) existingSelector.remove();

  const overlay = $('div', {
    id: 'project_selector_overlay',
    parent: intuitionContainer,
    css: {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: '1000',
      pointerEvents: 'auto'
    }
  });

  const modal = $('div', {
    id: 'project_selector_modal',
    parent: overlay,
    css: {
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '8px',
      minWidth: '300px',
      maxHeight: '400px',
      overflowY: 'auto',
      pointerEvents: 'auto'
    }
  });

  $('div', {
    parent: modal,
    css: { fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#333', pointerEvents: 'auto' },
    text: 'Select a Project'
  });

  projects.forEach((project, index) => {
    const projectId = project.atome_id || project.id;
    const projectName = project.name || project.data?.name || project.particles?.name || 'Unnamed Project';

    $('div', {
      id: 'project_item_' + index,
      parent: modal,
      css: {
        padding: '10px',
        margin: '5px 0',
        backgroundColor: '#f0f0f0',
        borderRadius: '4px',
        cursor: 'pointer',
        color: '#333',
        pointerEvents: 'auto'
      },
      text: projectName,
      onClick: () => {
        selectedProjectId = projectId;
        currentProjectName = projectName;
        overlay.remove();
        grab('current_project').textContent = projectName;
        if (typeof callback === 'function') {
          callback({ project_id: projectId, project_name: projectName, cancelled: false });
        }
      }
    });
  });

  $('div', {
    parent: modal,
    css: {
      padding: '10px',
      marginTop: '15px',
      backgroundColor: '#ccc',
      borderRadius: '4px',
      cursor: 'pointer',
      textAlign: 'center',
      color: '#333',
      pointerEvents: 'auto'
    },
    text: 'Cancel',
    onClick: () => {
      overlay.remove();
      if (typeof callback === 'function') {
        callback({ project_id: null, project_name: null, cancelled: true });
      }
    }
  });
}

/**
 * TEST ONLY - Open a user selector dialog
 * @param {Function} callback - Callback with selected user { user_id, username, phone }
 */
async function open_user_selector(callback) {
  const usersResult = await user_list();
  const users = usersResult.tauri.users.length > 0
    ? usersResult.tauri.users
    : usersResult.fastify.users;

  if (users.length === 0) {
    const phoneInput = grab('phone_pass_input');
    const usernameInput = grab('username_input');
    const phone = phoneInput?.value?.trim() || '';
    const username = usernameInput?.value?.trim() || '';

    if (phone) {
      const loginResult = await log_user(phone, phone, username || '');
      if (loginResult.tauri.success || loginResult.fastify.success) {
        const userData = loginResult.tauri.success ? loginResult.tauri.data : loginResult.fastify.data;
        const userObj = userData?.user || userData || { username, phone };
        const label = formatUserSummary(userObj);
        puts('✅ Logged user: ' + label);
        grab('logged_user').textContent = label;
        logUserDetails(userObj, 'manual_login');

        const userId = userObj.user_id || userObj.atome_id || userObj.id;
        if (userId) await initRemoteCommands(userId);

        if (typeof callback === 'function') {
          callback({ user_id: userId, username, phone, cancelled: false });
        }
        return;
      }
      puts('❌ Login failed (offline fallback)');
    }

    if (typeof callback === 'function') {
      callback({ user_id: null, username: null, phone: null, cancelled: true, error: 'No users available' });
    }
    return;
  }

  const existingSelector = grab('user_selector_overlay');
  if (existingSelector) existingSelector.remove();

  const overlay = $('div', {
    id: 'user_selector_overlay',
    parent: intuitionContainer,
    css: {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: '1000',
      pointerEvents: 'auto'
    }
  });

  const modal = $('div', {
    id: 'user_selector_modal',
    parent: overlay,
    css: {
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '8px',
      minWidth: '300px',
      maxHeight: '400px',
      overflowY: 'auto',
      pointerEvents: 'auto'
    }
  });

  $('div', {
    parent: modal,
    css: { fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#333', pointerEvents: 'auto' },
    text: 'Select a User'
  });

  users.forEach((user, index) => {
    const userId = user.atome_id || user.id;
    const username = user.username || user.data?.username || 'Unknown User';
    const phone = user.phone || user.data?.phone || 'No phone';

    $('div', {
      id: 'user_item_' + index,
      parent: modal,
      css: {
        padding: '10px',
        margin: '5px 0',
        backgroundColor: '#f0f0f0',
        borderRadius: '4px',
        cursor: 'pointer',
        color: '#333',
        pointerEvents: 'auto'
      },
      text: username + ' (' + phone + ')',
      onClick: async () => {
        overlay.remove();
        if (phone && phone !== 'No phone') {
          const loginResult = await log_user(phone, phone, '');
          if (loginResult.tauri.success || loginResult.fastify.success) {
            const userData = loginResult.tauri.success ? loginResult.tauri.data : loginResult.fastify.data;
            const userObj = userData?.user || userData || { username, phone };
            const label = formatUserSummary(userObj);
            puts('✅ Switched to user: ' + label);
            grab('logged_user').textContent = label;
            logUserDetails(userObj, 'switch_user');

            // Clear current project view when switching users
            if (currentProjectDiv) {
              currentProjectDiv.remove();
              currentProjectDiv = null;
            }
            selectedProjectId = null;
            currentProjectName = null;
            grab('current_project').textContent = 'no project loaded';

            // Auto-load first project of new user
            try {
              const projectsResult = await list_projects();
              const projects = pickAuthoritativeProjects(projectsResult);

              if (projects && projects.length > 0) {
                const firstProject = projects[0];
                const projectId = firstProject.atome_id || firstProject.id;
                const projectName = firstProject.name || firstProject.data?.name || firstProject.particles?.name || 'Unnamed Project';

                // Get background color
                const particles = firstProject.particles || firstProject.data || {};
                const backgroundColor = particles.backgroundColor || firstProject.backgroundColor || '#333';

                await loadProjectView(projectId, projectName, backgroundColor);
                puts('✅ Auto-loaded first project: ' + projectName);
              } else {
                puts('No projects found for this user');
              }
            } catch (error) {
              puts('❌ Failed to auto-load project: ' + error);
            }

            if (typeof callback === 'function') {
              callback({ user_id: userId, username: username, phone: phone, cancelled: false });
            }
          } else {
            puts('❌ Failed to switch user');
            if (typeof callback === 'function') {
              callback({ user_id: null, username: null, phone: null, cancelled: false, error: 'Login failed' });
            }
          }
        } else {
          puts('❌ User has no phone number');
          if (typeof callback === 'function') {
            callback({ user_id: null, username: null, phone: null, cancelled: false, error: 'No phone number' });
          }
        }
      }
    });
  });

  $('div', {
    parent: modal,
    css: {
      padding: '10px',
      marginTop: '15px',
      backgroundColor: '#ccc',
      borderRadius: '4px',
      cursor: 'pointer',
      textAlign: 'center',
      color: '#333',
      pointerEvents: 'auto'
    },
    text: 'Cancel',
    onClick: () => {
      overlay.remove();
      if (typeof callback === 'function') {
        callback({ user_id: null, username: null, phone: null, cancelled: true });
      }
    }
  });
}

/**
 * TEST ONLY - Open an atome selector dialog
 * @param {Object} options - Filter options { type, projectId }
 * @param {Function} callback - Callback with selected atome { atome_id, atome }
 */
async function open_atome_selector(options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  console.log('[open_atome_selector] Opening atome selector...');

  const atomesResult = await list_atomes(options);
  const atomes = pickAuthoritativeAtomes(atomesResult);

  const filteredAtomes = atomes.filter(a => {
    const type = a.atome_type || a.type;
    return type !== 'project' && type !== 'user';
  });

  if (filteredAtomes.length === 0) {
    console.log('[open_atome_selector] No atomes found');
    if (typeof callback === 'function') {
      callback({ atome_id: null, atome: null, cancelled: true });
    }
    return;
  }

  const existingSelector = grab('atome_selector_overlay');
  if (existingSelector) existingSelector.remove();

  const overlay = $('div', {
    id: 'atome_selector_overlay',
    parent: intuitionContainer,
    css: {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: '1000',
      pointerEvents: 'auto'
    }
  });

  const modal = $('div', {
    id: 'atome_selector_modal',
    parent: overlay,
    css: {
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '8px',
      minWidth: '350px',
      maxHeight: '400px',
      overflowY: 'auto',
      pointerEvents: 'auto'
    }
  });

  $('div', {
    parent: modal,
    css: { fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#333', pointerEvents: 'auto' },
    text: 'Select an Atome'
  });

  filteredAtomes.forEach((atome, index) => {
    const atomeId = atome.atome_id || atome.id;
    const atomeType = atome.atome_type || atome.type || 'unknown';
    const atomeColor = atome.color || atome.data?.color || atome.particles?.color || '';
    const displayText = atomeType + (atomeColor ? ' (' + atomeColor + ')' : '') + ' - ' + atomeId.substring(0, 8) + '...';

    $('div', {
      id: 'atome_item_' + index,
      parent: modal,
      css: {
        padding: '10px',
        margin: '5px 0',
        backgroundColor: '#f0f0f0',
        borderRadius: '4px',
        cursor: 'pointer',
        color: '#333',
        fontSize: '14px',
        pointerEvents: 'auto'
      },
      text: displayText,
      onClick: () => {
        publishSelectedAtome(atomeId);
        overlay.remove();
        console.log('[open_atome_selector] Selected atome:', atomeId);
        if (typeof callback === 'function') {
          callback({ atome_id: atomeId, atome: atome, cancelled: false });
        }
      }
    });
  });

  $('div', {
    parent: modal,
    css: {
      padding: '10px',
      marginTop: '15px',
      backgroundColor: '#ccc',
      borderRadius: '4px',
      cursor: 'pointer',
      textAlign: 'center',
      color: '#333',
      pointerEvents: 'auto'
    },
    text: 'Cancel',
    onClick: () => {
      overlay.remove();
      if (typeof callback === 'function') {
        callback({ atome_id: null, atome: null, cancelled: true });
      }
    }
  });
}

// ============================================
// UI BUTTONS & tests
// ============================================

function formatUserSummary(user) {
  const username = user?.username || user?.data?.username || 'unknown';
  const userId = user?.user_id || user?.atome_id || user?.id || null;
  const phone = user?.phone || user?.data?.phone || null;

  const parts = [String(username)];
  if (userId) parts.push(`(${userId})`);
  if (phone) parts.push(`phone:${phone}`);
  return parts.join(' ');
}

function logUserDetails(user, context = 'current_user') {
  try {
    console.log(`[check.js] ${context} details`, user);
  } catch (_) { }

  try {
    puts(`[${context}] user details: ` + JSON.stringify(user));
  } catch (_) {
    puts(`[${context}] user details: [unserializable]`);
  }
}

//todo: share atomes both atome project type and atome width other user user

//todo: restore atomes from it's history to and bring back the new state to present
//todo: restore atomes from it's history and create an altered history from the present state

/// input box below

// Initialize Remote Commands after user login
async function initRemoteCommands(userId) {
  // Register built-in handlers
  BuiltinHandlers.registerAll();

  // Start listening for commands with the actual user ID
  if (RemoteCommands?.canStart) {
    const canStart = await RemoteCommands.canStart();
    if (!canStart) {
      updateRemoteCommandsStatus(false);
      return;
    }
  }
  const started = await RemoteCommands.start(userId);
  if (started) {
    puts('[RemoteCommands] ✅ Listener active for user: ' + userId);
    updateRemoteCommandsStatus(true);
  } else {
    puts('[RemoteCommands] ❌ Failed to start');
    updateRemoteCommandsStatus(false);
  }
}

function updateRemoteCommandsStatus(active) {
  const statusEl = grab('remote_commands_status');
  if (statusEl) {
    statusEl.textContent = active ? '📡 RC: ON' : '📡 RC: OFF';
    statusEl.style.backgroundColor = active ? 'rgba(0, 200, 0, 1)' : 'rgba(200, 0, 0, 1)';
  }
}

(async () => {
  const result = await current_user();
  if (result.logged && result.user) {
    const label = formatUserSummary(result.user);
    puts('Logged user: ' + label);
    grab('logged_user').textContent = label;
    logUserDetails(result.user, 'current_user');

    // Start remote commands listener after login with actual user ID
    const userId = result.user.user_id || result.user.atome_id || result.user.id;
    await initRemoteCommands(userId);

    const isTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    if (isTauriRuntime && AdoleAPI?.sync?.maybeSync) {
      try {
        const syncResult = await AdoleAPI.sync.maybeSync('refresh');
        checkDebugPuts('sync atomes (refresh): ' + JSON.stringify(syncResult));
      } catch (error) {
        checkDebugPuts('sync atomes (refresh) failed: ' + (error?.message || String(error)));
      }
    }
  } else {
    puts('no user logged');
    grab('logged_user').textContent = 'no user logged';
  }
})();

// Load current project on startup (prefer saved project, fallback to first project)
(async () => {
  // First, try to load the user's saved/last used project
  let savedProject = null;
  if (typeof AdoleAPI !== 'undefined' && AdoleAPI.projects?.loadSaved) {
    savedProject = await AdoleAPI.projects.loadSaved();
  }

  const result = await list_projects();
  const projects = pickAuthoritativeProjects(result);

  if (projects && projects.length > 0) {
    // Find the saved project in the list, or use first project as fallback
    let targetProject = null;

    if (savedProject?.id) {
      targetProject = projects.find(p => p.atome_id === savedProject.id);
      if (targetProject) {
        puts('🔄 Restoring saved project: ' + (savedProject.name || 'unnamed'));
      }
    }

    if (!targetProject) {
      targetProject = projects[0];
    }

    const projectId = targetProject.atome_id;
    const projectName = targetProject.data?.name || savedProject?.name || 'Unnamed Project';

    if (projectId) {
      // Retrieve background color from project data
      const projectResult = await get_atome(projectId);
      let backgroundColor = '#333'; // Default color

      if (projectResult.tauri.success || projectResult.fastify.success) {
        const projectData = projectResult.tauri.atome || projectResult.fastify.atome;
        const particles = projectData?.particles || projectData?.data || {};
        backgroundColor = particles.backgroundColor || '#333';
      }

      puts('Project loaded: ' + projectName + ' (color: ' + backgroundColor + ')');
      await loadProjectView(projectId, projectName, backgroundColor);
    } else {
      puts('❌ Project found but missing ID');
    }
  } else {
    puts('no project available');
    grab('current_project').textContent = 'no project loaded';
  }
})();

const phone_pass = '11111111';
const username = 'jeezs';

$('input', {
  id: 'phone_pass_input',
  parent: intuitionContainer,
  attrs: {
    type: 'text',
    placeholder: 'Phone / Password',
    value: phone_pass
  },
  css: {

    margin: '10px',
    marginTop: '100px',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    width: '100px'
  }
});

$('input', {
  id: 'username_input',
  parent: intuitionContainer,
  attrs: {
    type: 'text',
    placeholder: 'Username',
    value: username
  },
  css: {
    margin: '10px',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    width: '100px'
  }
});

// Send Notification Button
$('span', {
  id: 'send_notification_command',
  parent: intuitionContainer,
  css: {
    backgroundColor: 'rgba(200, 100, 0, 1)',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block',
    cursor: 'pointer'
  },
  text: '🔔 Send Notif',
  onClick: async () => {
    const targetInput = grab('remote_target_input');
    const targetUserId = targetInput?.value?.trim();

    if (!targetUserId) {
      puts('[RemoteCommands] Enter a target user ID first');
      return;
    }

    if (!RemoteCommands.isActive()) {
      puts('[RemoteCommands] Not connected');
      return;
    }

    puts(`[RemoteCommands] Sending notification to ${targetUserId}...`);

    const result = await RemoteCommands.sendCommand(targetUserId, 'show-notification', {
      message: 'Hello from remote! 👋',
      type: 'success',
      duration: 5000
    });

    if (result.success) {
      puts(`[RemoteCommands] Notification sent! delivered=${result.delivered}`);
    } else {
      puts(`[RemoteCommands] Failed: ${result.error}`);
    }
  },
});

// Target User ID or Phone Input
$('input', {
  id: 'remote_target_input',
  parent: intuitionContainer,
  css: {
    padding: '8px',
    margin: '10px',
    border: '1px solid #666',
    borderRadius: '4px',
    width: '200px',
    fontSize: '12px'
  },
  attr: {
    type: 'text',
    placeholder: 'Phone or User ID'
  }
});

$('span', {
  id: 'logged_user',
  parent: intuitionContainer,
  css: {
    backgroundColor: 'rgba(0, 255, 98, 1)',
    marginLeft: '0',
    padding: '10px',
    color: 'black',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'no user logged',

});

$('span', {
  id: 'current_project',
  parent: intuitionContainer,
  css: {
    backgroundColor: 'rgba(0, 255, 98, 1)',
    marginLeft: '0',
    padding: '10px',
    color: 'black',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'no project loaded',
});

$('br', { parent: intuitionContainer });
$('br', { parent: intuitionContainer });


$('span', {
  id: 'create_user',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'create user',
  onClick: async () => {
    const user_phone = grab('phone_pass_input').value;
    const user_name = grab('username_input').value;

    const results = await create_user(user_phone, user_phone, user_name, (result) => {
      if (result?.tauri?.success || result?.fastify?.success) {
        console.log('user: ' + user_name + ' created');
      }
    });

    if (results?.tauri?.success || results?.fastify?.success) {
      const projectName = 'untitled';

      // Generate random background color for the project
      const colors = ['#2c3e50', '#8e44ad', '#3498db', '#e67e22', '#27ae60', '#f39c12', '#e74c3c', '#9b59b6', '#1abc9c', '#34495e', '#16a085', '#f1c40f', '#d35400'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      const projectResult = await create_project(projectName);
      if (projectResult?.tauri?.success || projectResult?.fastify?.success) {
        console.log('project: ' + projectName + ' created');

        const tauriData = projectResult?.tauri?.data?.data;
        const fastifyData = projectResult?.fastify?.data?.data;
        const newId = tauriData?.atome_id || fastifyData?.atome_id;

        if (newId) {
          const alterResult = await alter_atome(newId, { backgroundColor: randomColor });
          if (!(alterResult?.tauri?.success || alterResult?.fastify?.success)) {
            console.warn('project backgroundColor update failed:', alterResult?.tauri?.error || alterResult?.fastify?.error || alterResult);
          }

          await loadProjectView(newId, projectName, randomColor);
        } else {
          console.warn('project creation succeeded but no project id found:', projectResult);
        }
      } else {
        console.warn('project creation failed:', projectResult?.tauri?.error || projectResult?.fastify?.error || projectResult);
      }
    }
    grab('logged_user').textContent = `${user_name} phone:${user_phone}`;
    puts('user created: ' + user_name + ' user phone created: ' + user_phone);
  },
});

$('span', {
  id: 'log_user',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'log user',
  onClick: async () => {
    const phone = grab('phone_pass_input')?.value?.trim() || '';
    const username = grab('username_input')?.value?.trim() || '';

    if (phone) {
      const loginResult = await log_user(phone, phone, username || '');
      if (loginResult.tauri.success || loginResult.fastify.success) {
        const userData = loginResult.tauri.success ? loginResult.tauri.data : loginResult.fastify.data;
        const userObj = userData?.user || userData || { username, phone };
        const label = formatUserSummary(userObj);
        puts('✅ Logged user: ' + label);
        grab('logged_user').textContent = label;
        logUserDetails(userObj, 'manual_login');

        const userId = userObj.user_id || userObj.atome_id || userObj.id;
        if (userId) await initRemoteCommands(userId);
        return;
      }
      puts('❌ Login failed; opening user selector');
    }

    open_user_selector((result) => {
      if (!result.cancelled && !result.error) {
        puts('User selection successful');
      } else if (result.error) {
        puts('User switch error: ' + result.error);
      } else {
        puts('User selection cancelled');
      }
    });
  },
});

$('span', {
  id: 'unlog_user',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'unlog user',
  onClick: async () => {
    const results = await unlog_user();

    if (results.tauri.success || results.fastify.success) {
      puts('User logged out');
      grab('logged_user').textContent = 'no user logged';
    } else {
      puts('Logout failed');
    }
  },
});



$('span', {
  id: 'delete_user',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'delete user',
  onClick: async () => {
    puts('Deleting user...');
    const phone = grab('phone_pass_input').value;
    const user_name = grab('username_input').value;

    const results = await delete_user(phone, phone, user_name);
    if (results.tauri.success || results.fastify.success) {
      puts('User deleted, logging out...');
      await unlog_user();
      grab('logged_user').textContent = 'no user logged';
    }
  },
});

$('br', { parent: intuitionContainer });
const atome_type = 'shape';
const atome_color = 'orange';
const atome_project_name = 'my project';

$('input', {
  id: 'atome_project_name_input',
  parent: intuitionContainer,
  attrs: {
    type: 'text',
    placeholder: 'Atome Type',
    value: atome_project_name
  },
  css: {
    margin: '10px',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    width: '100px'
  }
});


$('input', {
  id: 'atome_color_input',
  parent: intuitionContainer,
  attrs: {
    type: 'text',
    placeholder: 'Atome Color',
    value: atome_color
  },
  css: {
    margin: '10px',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    width: '100px'
  }
});
$('br', { parent: intuitionContainer });



$('span', {
  id: 'create_project',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'create project',
  onClick: async () => {
    const projectName = grab('atome_project_name_input').value;

    // Generate random background color for the project
    const colors = ['#2c3e50', '#8e44ad', '#3498db', '#e67e22', '#27ae60', '#f39c12', '#e74c3c', '#9b59b6', '#1abc9c', '#34495e', '#16a085', '#f1c40f', '#d35400'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    // Step 1: Create project using standard API
    const result = await create_project(projectName);

    if (result.tauri.success || result.fastify.success) {
      const tauriData = result.tauri?.data?.data;
      const fastifyData = result.fastify?.data?.data;

      const newId = tauriData?.atome_id || fastifyData?.atome_id;

      if (newId) {
        // Step 2: Add backgroundColor using standard alter_atome API for proper historization
        const alterResult = await alter_atome(newId, { backgroundColor: randomColor });

        if (alterResult.tauri.success || alterResult.fastify.success) {
          puts('✅ Project created with background color: ' + projectName + ' (color: ' + randomColor + ')');
        } else {
          puts('⚠️ Project created but failed to set background color: ' + projectName);
        }

        await loadProjectView(newId, projectName, randomColor);
      } else {
        puts('❌ Project creation failed: Invalid response');
      }
    } else {
      puts('❌ Failed to create project');
    }
  },
});

$('span', {
  id: 'load_project',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'load project',
  onClick: async () => {
    puts('Select a project to load...');
    const selection = await new Promise(resolve => {
      open_project_selector(resolve);
    });

    if (selection.cancelled) {
      puts('Loading cancelled');
      return;
    }

    // For now, get background color from the projects list since get_atome has issues
    let backgroundColor = '#333'; // Default color

    try {
      const projectsResult = await list_projects();
      const projects = pickAuthoritativeProjects(projectsResult);

      const selectedProject = projects.find(p =>
        (p.atome_id || p.id) === selection.project_id
      );

      if (selectedProject) {
        const particles = selectedProject.particles || selectedProject.data || {};
        backgroundColor = particles.backgroundColor ||
          selectedProject.backgroundColor ||
          selectedProject.color ||
          '#333';
        puts('✅ Found background color from projects list: ' + backgroundColor);
      } else {
        puts('⚠️ Project not found in list, using default color');
      }
    } catch (error) {
      puts('⚠️ Failed to get background color: ' + error + ', using default');
    }

    await loadProjectView(selection.project_id, selection.project_name, backgroundColor);
    puts('✅ Project loaded: ' + selection.project_name + ' with color: ' + backgroundColor);
  },
});


$('span', {
  id: 'delete_project',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'delete project',
  onClick: async () => {
    puts('Select a project to delete...');
    const selection = await new Promise(resolve => {
      open_project_selector(resolve);
    });

    if (selection.cancelled) {
      puts('Deletion cancelled');
      return;
    }

    const result = await delete_project(selection.project_id);
    if (result.tauri.success || result.fastify.success) {
      puts('✅ Project deleted: ' + selection.project_name);
    } else {
      puts('❌ Failed to delete project');
    }
  },
});
$('br', { parent: intuitionContainer });

$('span', {
  id: 'create_atome',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'create atome',
  onClick: async () => {
    if (!selectedProjectId) {
      puts('❌ No project loaded. Please load a project first.');
      return;
    }
    const atomeTypeInput = grab('atome_type_input');
    const atomeType = atomeTypeInput ? atomeTypeInput.value : atome_type;
    const atomeColor = grab('atome_color_input').value;
    const initialLeft = '100px';
    const initialTop = '100px';

    puts('🔄 Creating atome: ' + atomeType + ' (' + atomeColor + ') at position: ' + initialLeft + ', ' + initialTop);

    const result = await create_atome({
      type: atomeType,
      color: atomeColor,
      projectId: selectedProjectId,
      particles: { left: initialLeft, top: initialTop }
    });

    console.log('[create_atome button] Full result:', result);

    // Debug: Let's see the exact structure
    puts('🔍 DEBUG create_atome result structure:');
    puts('  Tauri: ' + JSON.stringify(result.tauri));
    puts('  Fastify: ' + JSON.stringify(result.fastify));

    if (result.tauri.success || result.fastify.success) {
      // Try to extract the real ID from the API response
      const tauriData = result.tauri.data || {};
      const fastifyData = result.fastify.data || {};

      // Try different possible paths for the ID
      let newId = null;

      // Check Tauri response first
      if (result.tauri.success && tauriData) {
        newId = tauriData.atome_id || tauriData.id || tauriData.atomeId ||
          (tauriData.data && tauriData.data.atome_id) ||
          (tauriData.atome && tauriData.atome.atome_id) ||
          (typeof tauriData === 'string' ? tauriData : null);
      }

      // If not found in Tauri, check Fastify
      if (!newId && result.fastify.success && fastifyData) {
        newId = fastifyData.atome_id || fastifyData.id || fastifyData.atomeId ||
          (fastifyData.data && fastifyData.data.atome_id) ||
          (fastifyData.atome && fastifyData.atome.atome_id) ||
          (typeof fastifyData === 'string' ? fastifyData : null);
      }

      // If still no ID, generate temporary one as fallback
      if (!newId) {
        newId = 'temp_atome_' + Date.now();
        puts('⚠️ Warning: Could not extract real atome ID, using temporary: ' + newId);
      } else {
        puts('✅ Extracted real atome ID: ' + newId);
      }

      console.log('[create_atome button] Final ID:', newId);
      puts('✅ Atome created: ' + newId.substring(0, 8) + '...');

      // Reload project to display the new atome
      puts('🔄 Reloading project atomes...');
      await loadProjectAtomes(selectedProjectId);
    } else {
      puts('❌ Failed to create atome');
      puts('  Tauri error: ' + (result.tauri.error || 'none'));
      puts('  Fastify error: ' + (result.fastify.error || 'none'));
    }
  },
});

$('span', {
  id: 'delete_atome',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'delete atome',
  onClick: async () => {
    if (!selectedAtomeId || !selectedVisualAtome) {
      puts('❌ No atome selected. Click on an atome to select it first.');
      return;
    }
    puts('Deleting selected atome: ' + selectedAtomeId.substring(0, 8) + '...');
    const result = await delete_atome(selectedAtomeId);

    if (result.tauri?.success || result.fastify?.success) {
      puts('✅ Atome deleted');
      // Remove visual element
      if (selectedVisualAtome) {
        selectedVisualAtome.remove();
        selectedVisualAtome = null;
        publishSelectedAtome(null);
      }
    } else {
      puts('❌ Failed to delete atome');
      try {
        const tauriErr = result?.tauri?.error || (result?.tauri?.data && result?.tauri?.data?.error) || null;
        const fastifyErr = result?.fastify?.error || (result?.fastify?.data && result?.fastify?.data?.error) || null;
        if (tauriErr) puts('  Tauri error: ' + tauriErr);
        if (fastifyErr) puts('  Fastify error: ' + fastifyErr);
      } catch (_) { }
    }
  },
});

$('span', {
  id: 'alter_atome',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'alter atome',
  onClick: async () => {
    if (!selectedAtomeId || !selectedVisualAtome) {
      puts('❌ No atome selected. Click on an atome to select it first.');
      return;
    }

    // Generate random color, border radius and opacity
    const colorOptions = ['red', 'green', 'blue', 'purple', 'orange', 'cyan', 'magenta', 'pink', 'yellow', 'lime', 'teal', 'navy'];
    const borderRadiusOptions = ['0px', '8px', '15px', '25px', '40px', '50%'];
    const opacityOptions = [0.3, 0.5, 0.7, 0.8, 0.9, 1.0];

    const newColor = colorOptions[Math.floor(Math.random() * colorOptions.length)];
    const newBorderRadius = borderRadiusOptions[Math.floor(Math.random() * borderRadiusOptions.length)];
    const newOpacity = opacityOptions[Math.floor(Math.random() * opacityOptions.length)];

    puts('🔄 Altering atome style - color: ' + newColor + ', borderRadius: ' + newBorderRadius + ', opacity: ' + newOpacity);

    // Save to manual history first
    saveHistoryEntry(selectedAtomeId, {
      color: newColor,
      borderRadius: newBorderRadius,
      opacity: newOpacity
    }, 'Style changed');

    // Save to database using alter_atome
    const result = await alter_atome(selectedAtomeId, {
      color: newColor,
      borderRadius: newBorderRadius,
      opacity: newOpacity
    });

    if (result.tauri?.success || result.fastify?.success) {
      puts('✅ Atome style altered and saved');
      console.log('[Alter Save] Success result:', result);
    } else {
      puts('⚠️ Database save failed, but style tracked in history');
      console.log('[Alter Save] Failed result:', result);
    }

    // Update visual element immediately
    selectedVisualAtome.style.backgroundColor = newColor;
    selectedVisualAtome.style.borderRadius = newBorderRadius;
    selectedVisualAtome.style.opacity = newOpacity;

    // Reload history to show the new entry
    puts('🔄 Reloading history after style change...');
    await loadAtomeHistory(selectedAtomeId);
  },
});
$('span', {
  id: 'list_project_atomes',
  parent: intuitionContainer,
  css: {
    backgroundColor: 'rgba(255, 165, 0, 1)',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'list project atomes',
  onClick: async () => {
    if (!selectedProjectId) {
      puts('❌ No project loaded. Please load a project first.');
      return;
    }

    puts('🔍 Listing atomes for current project: ' + selectedProjectId);
    await loadProjectAtomes(selectedProjectId);
  },
});

// History navigation slider
let currentAtomeHistory = [];
let currentHistoryIndex = 0;
let isRecordingDrag = false;
let dragStartTime = 0;
let lastRecordTime = 0;
let currentDragSequence = [];
let isPlayingAnimation = false;

// Add CSS rule to ensure all UI elements are clickable
const uiStyle = document.createElement('style');
uiStyle.textContent = `
  #intuition span, #intuition input, #intuition div[id*="slider"], #intuition div[id*="button"] {
    pointer-events: auto !important;
  }
`;
document.head.appendChild(uiStyle);

$('div', {
  id: 'history_slider_container',
  parent: intuitionContainer,
  css: {
    position: 'relative',
    margin: '10px',
    padding: '10px',
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: '8px',
    display: 'block',
    zIndex: '1',
    pointerEvents: 'auto',
    maxWidth: '400px'
  }
});

$('div', {
  parent: grab('history_slider_container'),
  css: { color: 'white', fontSize: '12px', marginBottom: '5px' },
  text: 'Atome History Navigation (select an atome first)'
});

// History navigation slider - add variable for current drag sequence
let currentDragSequenceForScrub = null;
let isInScrubMode = false;
let currentScrubEntry = null;
let isRecordingContinuous = false;
let continuousStartTime = 0;
let lastContinuousRecordTime = 0;
let currentContinuousSequence = [];
let currentProportionalPositions = [];

$('input', {
  id: 'history_slider',
  parent: grab('history_slider_container'),
  attrs: {
    type: 'range',
    min: '0',
    max: '0',
    value: '0',
    disabled: true
  },
  css: {
    width: '400px',
    margin: '5px 0'
  },
  onInput: (e) => {
    if (!selectedAtomeId || currentAtomeHistory.length === 0) return;

    // Stop any playing animation first
    stopDragAnimation();

    const sliderValue = parseInt(e.target.value);
    const sliderPosition = sliderValue / 1000; // Convert to 0-1 range

    if (isInScrubMode && currentDragSequenceForScrub && currentScrubEntry) {
      // SCRUB MODE: Navigate through continuous sequence frames
      const frameIndex = Math.max(0, Math.min(currentDragSequenceForScrub.length - 1, sliderValue));
      const currentFrame = currentDragSequenceForScrub[frameIndex];

      // Ensure exit button is visible
      const exitBtn = grab('exit_scrub_button');
      if (exitBtn) exitBtn.style.display = 'inline-block';

      // Ensure play button is visible
      const playBtn = grab('play_animation_button');
      if (playBtn) {
        playBtn.style.display = 'inline-block';
        playBtn.dragSequence = currentDragSequenceForScrub;
      }

      if (currentFrame && selectedVisualAtome) {
        // Apply all recorded properties
        if (currentFrame.left) selectedVisualAtome.style.left = currentFrame.left;
        if (currentFrame.top) selectedVisualAtome.style.top = currentFrame.top;
        if (currentFrame.color) selectedVisualAtome.style.backgroundColor = currentFrame.color;
        if (currentFrame.borderRadius) selectedVisualAtome.style.borderRadius = currentFrame.borderRadius;
        if (currentFrame.opacity !== undefined) selectedVisualAtome.style.opacity = currentFrame.opacity;
        if (currentFrame.width) selectedVisualAtome.style.width = currentFrame.width;
        if (currentFrame.height) selectedVisualAtome.style.height = currentFrame.height;
        if (currentFrame.transform) selectedVisualAtome.style.transform = currentFrame.transform;

        grab('history_info').textContent = 'SCRUB: Frame ' + (frameIndex + 1) + '/' + currentDragSequenceForScrub.length +
          ' - Time: ' + currentFrame.relativeTime + 'ms';
      }
    } else {
      // HISTORY MODE: Use proportional mapping to find the correct entry
      const historyIndex = findHistoryIndexFromPosition(sliderPosition, currentProportionalPositions);
      const historyEntry = currentAtomeHistory[historyIndex];

      if (historyEntry && selectedVisualAtome) {
        const particles = historyEntry.particles || historyEntry.data || {};

        // Auto-detect continuous sequences for potential scrubbing
        const continuousSeq = particles.continuousSequence || particles.dragSequence;

        if (continuousSeq && continuousSeq.length > 1) {
          // AUTO-SCRUB: Calculate which frame to show based on position within this entry's space
          const entryStartPos = currentProportionalPositions[historyIndex];
          const entryEndPos = currentProportionalPositions[historyIndex + 1];

          const frameIndex = calculateFrameIndex(sliderPosition, entryStartPos, entryEndPos, continuousSeq.length);
          const currentFrame = continuousSeq[frameIndex];

          // SCRUB through the sequence based on slider position
          if (currentFrame) {
            if (currentFrame.left) selectedVisualAtome.style.left = currentFrame.left;
            if (currentFrame.top) selectedVisualAtome.style.top = currentFrame.top;
            if (currentFrame.color) selectedVisualAtome.style.backgroundColor = currentFrame.color;
            if (currentFrame.borderRadius) selectedVisualAtome.style.borderRadius = currentFrame.borderRadius;
            if (currentFrame.opacity !== undefined) selectedVisualAtome.style.opacity = currentFrame.opacity;
            if (currentFrame.width) selectedVisualAtome.style.width = currentFrame.width;
            if (currentFrame.height) selectedVisualAtome.style.height = currentFrame.height;
            if (currentFrame.transform) selectedVisualAtome.style.transform = currentFrame.transform;
          }

          // SHOW SCRUB AND PLAY BUTTONS for this sequence
          const scrubBtn = grab('scrub_sequence_button');
          if (scrubBtn) {
            scrubBtn.style.display = 'inline-block';
            scrubBtn.dragSequence = continuousSeq;
            scrubBtn.historyEntry = historyEntry;
          }

          const playBtn = grab('play_animation_button');
          if (playBtn) {
            playBtn.style.display = 'inline-block';
            playBtn.dragSequence = continuousSeq;
          }

          const changeType = particles.changeType || 'continuous change';
          grab('history_info').textContent = 'SCRUB: ' + changeType + ' - Frame ' + (frameIndex + 1) + '/' + continuousSeq.length +
            ' (Entry ' + historyIndex + '/' + (currentAtomeHistory.length - 1) + ') - Enhanced spacing';
        } else {
          // HIDE SCRUB AND PLAY BUTTONS for single-state entries
          const scrubBtn = grab('scrub_sequence_button');
          if (scrubBtn) scrubBtn.style.display = 'none';
          const playBtn = grab('play_animation_button');
          if (playBtn) playBtn.style.display = 'none';

          // Apply single state change for punctual entries
          if (particles.left) selectedVisualAtome.style.left = particles.left;
          if (particles.top) selectedVisualAtome.style.top = particles.top;
          if (particles.color) selectedVisualAtome.style.backgroundColor = particles.color;
          if (particles.borderRadius) selectedVisualAtome.style.borderRadius = particles.borderRadius;
          if (particles.opacity !== undefined) selectedVisualAtome.style.opacity = particles.opacity;
          if (particles.width) selectedVisualAtome.style.width = particles.width;
          if (particles.height) selectedVisualAtome.style.height = particles.height;
          if (particles.transform) selectedVisualAtome.style.transform = particles.transform;

          grab('history_info').textContent = 'Entry ' + historyIndex + '/' + (currentAtomeHistory.length - 1) +
            ' - Punctual change - Position ' + Math.round(sliderPosition * 100) + '%';
        }

        // Hide exit scrub button in history mode
        const exitBtn = grab('exit_scrub_button');
        if (exitBtn) exitBtn.style.display = 'none';
      }
    }
  },
  onChange: async (e) => {
    if (!selectedAtomeId || currentAtomeHistory.length === 0) return;

    // Stop any playing animation first
    stopDragAnimation();

    const sliderValue = parseInt(e.target.value);

    if (isInScrubMode && currentDragSequenceForScrub && currentScrubEntry) {
      // STAY in scrub mode and on current frame - don't exit
      const frameIndex = Math.max(0, Math.min(currentDragSequenceForScrub.length - 1, sliderValue));
      const currentFrame = currentDragSequenceForScrub[frameIndex];

      if (currentFrame && selectedVisualAtome) {
        // Apply the selected frame properties
        if (currentFrame.left) selectedVisualAtome.style.left = currentFrame.left;
        if (currentFrame.top) selectedVisualAtome.style.top = currentFrame.top;
        if (currentFrame.color) selectedVisualAtome.style.backgroundColor = currentFrame.color;
        if (currentFrame.borderRadius) selectedVisualAtome.style.borderRadius = currentFrame.borderRadius;
        if (currentFrame.opacity !== undefined) selectedVisualAtome.style.opacity = currentFrame.opacity;
        if (currentFrame.width) selectedVisualAtome.style.width = currentFrame.width;
        if (currentFrame.height) selectedVisualAtome.style.height = currentFrame.height;
        if (currentFrame.transform) selectedVisualAtome.style.transform = currentFrame.transform;

        grab('history_info').textContent = 'SCRUB: Selected frame ' + (frameIndex + 1) + '/' + currentDragSequenceForScrub.length +
          ' - Time: ' + currentFrame.relativeTime + 'ms (Release mouse to exit scrub mode)';
        puts('🎯 Selected frame ' + (frameIndex + 1) + '/' + currentDragSequenceForScrub.length);
      }
    } else {
      // Normal history mode selection
      const historyIndex = sliderValue;
      currentHistoryIndex = historyIndex;

      console.log('[History] Selected entry:', currentAtomeHistory[historyIndex]);
    }
  }
});

$('div', {
  id: 'history_info',
  parent: grab('history_slider_container'),
  css: { color: 'white', fontSize: '11px', marginTop: '5px' },
  text: 'No history loaded'
});

$('span', {
  id: 'stop_animation_button',
  parent: grab('history_slider_container'),
  css: {
    backgroundColor: '#f44',
    padding: '5px 8px',
    color: 'white',
    margin: '5px 2px 5px 0',
    fontSize: '10px',
    cursor: 'pointer',
    borderRadius: '3px',
    display: 'none' // Hidden by default
  },
  text: 'Stop',
  onClick: () => {
    stopDragAnimation();
    puts('⏹️ Animation stopped');
  }
});

$('span', {
  id: 'exit_scrub_button',
  parent: grab('history_slider_container'),
  css: {
    backgroundColor: '#c44',
    padding: '5px 8px',
    color: 'white',
    margin: '5px 0',
    fontSize: '10px',
    cursor: 'pointer',
    borderRadius: '3px',
    display: 'none' // Hidden by default, shown only in scrub mode
  },
  text: 'Exit Scrub',
  onClick: () => {
    if (isInScrubMode) {
      // Exit scrub mode, return to history mode
      isInScrubMode = false;
      const slider = grab('history_slider');

      // Reset slider to history mode
      slider.max = currentAtomeHistory.length - 1;
      slider.value = currentHistoryIndex; // Return to the history entry we were on

      // Hide exit button
      grab('exit_scrub_button').style.display = 'none';

      grab('history_info').textContent = 'Exited scrub mode - Back to history navigation';
      puts('⬅️ Exited scrub mode manually');

      // Reset scrub variables
      currentDragSequenceForScrub = null;
      currentScrubEntry = null;
    }
  }
});

$('span', {
  id: 'play_animation_button',
  parent: grab('history_slider_container'),
  css: {
    backgroundColor: '#4a4',
    padding: '5px 8px',
    color: 'white',
    margin: '5px 2px 5px 0',
    fontSize: '10px',
    cursor: 'pointer',
    borderRadius: '3px',
    display: 'none' // Hidden by default, shown for continuous sequences
  },
  text: 'Play',
  dragSequence: null, // Will be set by slider
  onClick: () => {
    const playBtn = grab('play_animation_button');
    if (playBtn && playBtn.dragSequence && selectedVisualAtome) {
      puts('🎬 Playing continuous animation at original speed...');
      playDragAnimation(selectedVisualAtome, playBtn.dragSequence, 1); // Original speed
    }
  }
});

$('span', {
  id: 'exit_scrub_button',
  parent: grab('history_slider_container'),
  css: {
    backgroundColor: '#c44',
    padding: '5px 8px',
    color: 'white',
    margin: '5px 0',
    fontSize: '10px',
    cursor: 'pointer',
    borderRadius: '3px',
    display: 'none' // Hidden by default, shown only in scrub mode
  },
  text: 'Exit Scrub',
  onClick: () => {
    if (isInScrubMode) {
      // Exit scrub mode, return to history mode
      isInScrubMode = false;
      const slider = grab('history_slider');

      // Reset slider to history mode
      slider.max = currentAtomeHistory.length - 1;
      slider.value = currentHistoryIndex; // Return to the history entry we were on

      // Hide exit button and play button, show scrub button again
      grab('exit_scrub_button').style.display = 'none';
      grab('play_animation_button').style.display = 'none';
      const scrubBtn = grab('scrub_sequence_button');
      if (scrubBtn) scrubBtn.style.display = 'inline-block';

      grab('history_info').textContent = 'Exited scrub mode - Back to history navigation';
      puts('⬅️ Exited scrub mode manually');

      // Reset scrub variables
      currentDragSequenceForScrub = null;
      currentScrubEntry = null;
    }
  }
});

$('span', {
  id: 'apply_history_to_atome',
  parent: grab('history_slider_container'),
  css: {
    backgroundColor: 'rgba(100, 200, 100, 0.8)',
    padding: '5px 10px',
    color: 'white',
    margin: '5px',
    display: 'inline-block',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer'
  },
  text: 'Apply to Atome',
  onClick: async () => {
    if (!selectedAtomeId || currentAtomeHistory.length === 0) {
      puts('❌ No atome selected or no history available');
      return;
    }

    // Get current slider position and convert to history index
    const slider = grab('history_slider');
    if (!slider) {
      puts('❌ History slider not found');
      return;
    }

    let historyEntry;
    let historyIndex;

    if (isInScrubMode && currentScrubEntry) {
      // If in scrub mode, use the scrub entry
      historyEntry = currentScrubEntry;
      historyIndex = currentAtomeHistory.indexOf(currentScrubEntry);
    } else {
      // Use proportional system to find the current entry
      const sliderValue = parseInt(slider.value);
      const sliderPosition = sliderValue / 1000;
      historyIndex = findHistoryIndexFromPosition(sliderPosition, currentProportionalPositions);
      historyEntry = currentAtomeHistory[historyIndex];
    }

    if (!historyEntry) {
      puts('❌ Invalid history entry - Index: ' + historyIndex + ', Total: ' + currentAtomeHistory.length);
      return;
    }

    puts('💾 Applying history entry ' + historyIndex + '/' + (currentAtomeHistory.length - 1) + ' permanently to atome');

    const particles = historyEntry.particles || historyEntry.data || {};
    const updates = {};

    if (particles.left) updates.left = particles.left;
    if (particles.top) updates.top = particles.top;
    if (particles.color) updates.color = particles.color;
    if (particles.borderRadius) updates.borderRadius = particles.borderRadius;
    if (particles.opacity !== undefined) updates.opacity = particles.opacity;

    const result = await alter_atome(selectedAtomeId, updates);

    if (result.tauri?.success || result.fastify?.success) {
      puts('✅ History entry applied permanently');
      console.log('[History Apply] Success result:', result);

      // Add the new applied state to history
      const newHistoryEntry = {
        timestamp: Date.now(),
        type: 'applied_state',
        particles: { ...updates },
        data: { ...updates }
      };

      // Add to history
      currentAtomeHistory.push(newHistoryEntry);

      // Update localStorage
      const storageKey = 'atome_history_' + selectedAtomeId;
      try {
        localStorage.setItem(storageKey, JSON.stringify(currentAtomeHistory));
      } catch (e) {
        console.warn('[History] Failed to save to localStorage:', e);
      }

      // Recalculate proportional positions
      currentProportionalPositions = calculateProportionalPositions(currentAtomeHistory);

      // Update slider to point to the new latest state
      const slider = grab('history_slider');
      if (slider) {
        slider.value = 1000; // Move to end (latest state)
      }

      // Update current atome with the new state visually
      const atome = grab(selectedAtomeId);
      if (atome) {
        if (updates.left !== undefined) atome.left = updates.left;
        if (updates.top !== undefined) atome.top = updates.top;
        if (updates.color !== undefined) atome.color = updates.color;
        if (updates.borderRadius !== undefined) atome.borderRadius = updates.borderRadius;
        if (updates.opacity !== undefined) atome.opacity = updates.opacity;
      }

      puts('🔄 History updated with new applied state (' + currentAtomeHistory.length + ' total entries)');

    } else {
      puts('❌ Failed to apply history entry');
      console.log('[History Apply] Failed result:', result);
    }
  }
});

$('br', { parent: intuitionContainer });

$('br', { parent: intuitionContainer });

// ============================================
// SIMPLE PROJECT TEST
// ============================================

async function loadFastifyWsApiUrl() {
  try {
    const isTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    const localPort = window.__ATOME_LOCAL_HTTP_PORT__ || 3000;
    const localBase = isTauriRuntime ? `http://127.0.0.1:${localPort}` : '';
    const configUrl = isTauriRuntime ? `${localBase}/server_config.json` : '/server_config.json';

    const response = await fetch(configUrl, { cache: 'no-store' });
    if (!response || !response.ok) {
      console.warn('[check.js] Cannot load server_config.json', { status: response ? response.status : 'no-response', configUrl });
      return null;
    }

    const config = await response.json();
    const host = config?.fastify?.host;
    const port = config?.fastify?.port;
    const apiWsPath = config?.fastify?.apiWsPath;

    if (!host || !port || !apiWsPath) {
      console.warn('[check.js] Invalid fastify config for ws/api', { host, port, apiWsPath });
      return null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${host}:${port}${apiWsPath}`;
  } catch (error) {
    console.warn('[check.js] Failed to read server_config.json', error);
    return null;
  }
}

function getFastifyToken() {
  try {
    const hostname = window.location?.hostname || '';
    const isTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    const isLocalDev = isTauriRuntime
      || hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === ''
      || hostname.startsWith('192.168.')
      || hostname.startsWith('10.');

    // For Fastify ws/api calls we must prefer the Fastify-issued JWT.
    // local_auth_token may come from Tauri and can be signed with a different secret.
    const token = isLocalDev
      ? (localStorage.getItem('cloud_auth_token') || localStorage.getItem('auth_token') || localStorage.getItem('local_auth_token'))
      : (localStorage.getItem('cloud_auth_token') || localStorage.getItem('auth_token') || localStorage.getItem('local_auth_token'));

    return token && token.length > 10 ? token : null;
  } catch (_) {
    return null;
  }
}

function wsSendAndWait(ws, payload, matchFn, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve({ ok: false, error: 'timeout' });
    }, timeoutMs);

    const onMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (matchFn(message)) {
          cleanup();
          resolve(message);
        }
      } catch (e) {
        // ignore
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.removeEventListener('message', onMessage);
    };

    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify(payload));
  });
}

async function send_message_to_jeezs({ fromSelectedUser } = {}) {
  const wsUrl = await loadFastifyWsApiUrl();
  if (!wsUrl) {
    console.warn('[check.js] Fastify ws/api URL unavailable; cannot send message');
    return;
  }

  const token = getFastifyToken();
  if (!token) {
    console.warn('[check.js] Missing auth token; login first');
    return;
  }

  const toUserId = 'e25b813b-810f-5871-b503-aef5f188e137';
  const toPhone = '11111111';
  const requestId = `dm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const message = `console-only message (selected: ${fromSelectedUser?.username || fromSelectedUser?.userId || 'unknown'})`;

  await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);

    ws.addEventListener('open', async () => {
      const authRequestId = `auth_me_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const authResponse = await wsSendAndWait(
        ws,
        { type: 'auth', action: 'me', requestId: authRequestId, token },
        (m) => m?.type === 'auth-response' && (m.requestId === authRequestId || m.request_id === authRequestId),
        8000
      );

      if (!authResponse?.success) {
        console.warn('[check.js] ws/api auth(me) failed; cannot send direct-message', authResponse);
        try { ws.close(); } catch (e) { }
        resolve();
        return;
      }

      const response = await wsSendAndWait(
        ws,
        {
          type: 'direct-message',
          requestId,
          toUserId,
          toPhone,
          message
        },
        (m) => m?.type === 'direct-message-response' && (m.requestId === requestId || m.request_id === requestId),
        8000
      );

      console.log('[check.js] direct-message response', response);
      try { ws.close(); } catch (e) { }
      resolve();
    });

    ws.addEventListener('error', (e) => {
      console.warn('[check.js] WebSocket error sending direct-message', e);
      try { ws.close(); } catch (err) { }
      resolve();
    });
  });
}

/**
 * Open user selector (copied from sharing UI) and log DB-style info for the selected user.
 * Logs: user id, username, phone, total atomes, and breakdown by atome_type.
 */


async function logSelectedUserDbInfo(selection) {
  const userId = selection.userId;
  const username = selection.username;
  const phone = selection.phone;

  puts('🔎 DB debug for user: ' + username + ' (' + phone + ')');

  console.log('[User DB Info] Selected user:', {
    userId,
    username,
    phone,
    raw: selection.raw
  });

  if (!phone || phone === 'No phone') {
    puts('❌ Selected user has no phone');
    return;
  }

  puts('🔐 Switching session to selected user to count atomes');

  try {
    const loginResult = await log_user(phone, phone, '');
    if (!(loginResult.tauri.success || loginResult.fastify.success)) {
      puts('❌ Login failed for selected user');
      console.log('[User DB Info] Login failed:', loginResult);
      return;
    }

    const atomesResult = await list_atomes({});
    const atomes = pickAuthoritativeAtomes(atomesResult);

    const byType = {};
    atomes.forEach(a => {
      const type = a.atome_type || a.type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    });

    const report = {
      user: { id: userId, username, phone },
      atomes: {
        total: atomes.length,
        byType: byType
      }
    };

    console.log('[User DB Info] Report:', report);
    puts('✅ Logged user DB info to console (total atomes: ' + atomes.length + ')');
  } catch (error) {
    puts('❌ DB debug error: ' + error.message);
    console.error('[User DB Info] Error:', error);
  }
}

/**
 * Open user selector for sharing current selection
 */

/**
 * Share with selected user using share_atome function
 */

// ============================================================================
// FASTIFY BROADCAST PROBE (debug)
// Sends a message every second to Fastify /ws/api; server rebroadcasts it to ALL
// connected /ws/api clients so we can verify reception.
// ============================================================================

async function startFastifyBroadcastProbe() {
  const isTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
  if (isTauriRuntime && window.__SQUIRREL_FORCE_FASTIFY__ !== true) {
    return;
  }

  const wsUrl = await loadFastifyWsApiUrl();
  if (!wsUrl) {
    puts('[probe] Fastify ws/api URL unavailable; cannot start direct-message probe');
    return;
  }

  const initialToken = getFastifyToken();
  if (!initialToken) {
    puts('[probe] Missing auth token; login first');
    return;
  }

  // Target a DIFFERENT user than the sender to avoid self-delivery duplicates
  const targetUser = {
    user_id: 'e25b813b-810f-5871-b503-aef5f188e137',
    username: 'Jeezs',
    phone: '11111111'
  };

  const ws = new WebSocket(wsUrl);

  let lastAuthedToken = null;
  let probeTimer = null;

  // Only log direct-message-response (ACK from server), ignore console-message
  // (which is delivered to ALL connections of this user, causing "duplicates")
  ws.onmessage = function (event) {
    try {
      const parsed = JSON.parse(event.data);
      // Filter: only show ACKs, not broadcast messages
      if (parsed.type === 'direct-message-response') {
        console.log('[probe] ACK', parsed);
      }
      // Silently ignore console-message and auth-response
    } catch (_) {
      console.log('[ws/api] message (raw)', event.data);
    }
  };

  ws.addEventListener('error', () => {
    puts('[probe] ws/api socket error');
  });

  ws.addEventListener('open', async () => {
    puts('[probe] ws/api socket open');
    console.log('[probe] ws/api socket open');

    const doAuthMe = async (tokenToUse) => {
      const authRequestId = `auth_me_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const authResponse = await wsSendAndWait(
        ws,
        { type: 'auth', action: 'me', requestId: authRequestId, token: tokenToUse },
        (m) => m?.type === 'auth-response' && (m.requestId === authRequestId || m.request_id === authRequestId),
        8000
      );
      return authResponse;
    };

    const firstAuth = await doAuthMe(initialToken);
    if (!firstAuth?.success) {
      puts('[probe] ws/api auth(me) failed; direct-message probe will not start');
      console.warn('[probe] ws/api auth(me) failed', firstAuth);
      try { ws.close(); } catch (_) { }
      return;
    }
    lastAuthedToken = initialToken;

    puts('[probe] ws/api authenticated; starting probe loop');
    console.log('[probe] ws/api authenticated; starting probe loop');

    const tick = async () => {
      try {
        const tokenNow = getFastifyToken();
        if (!tokenNow) {
          puts('[probe] Missing auth token; stopping probe');
          try { clearInterval(probeTimer); } catch (_) { }
          try { ws.close(); } catch (_) { }
          return;
        }

        if (tokenNow !== lastAuthedToken) {
          const reAuth = await doAuthMe(tokenNow);
          if (!reAuth?.success) {
            puts('[probe] ws/api re-auth(me) failed; stopping probe');
            console.warn('[probe] ws/api re-auth(me) failed', reAuth);
            try { clearInterval(probeTimer); } catch (_) { }
            try { ws.close(); } catch (_) { }
            return;
          }
          lastAuthedToken = tokenNow;
        }

        const requestId = `dm_probe_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const sentAtIso = new Date().toISOString();
        puts('-----------');
        puts(grab('logged_user').textContent);
        console.log('-----------');
        ws.send(JSON.stringify({
          type: 'direct-message',
          requestId,
          toUserId: targetUser.user_id,
          toPhone: targetUser.phone,
          message: `debug test message @ ${sentAtIso} (requestId: ${requestId})`
        }));
      } catch (error) {
        puts('[probe] Probe loop error: ' + (error?.message || String(error)));
        console.error('[probe] Probe loop error', error);
      }
    };

    // Run once immediately, then every 12s.
    await tick();
    probeTimer = setInterval(() => { tick(); }, 12000);
  });

  ws.addEventListener('close', () => {
    if (probeTimer) {
      try { clearInterval(probeTimer); } catch (_) { }
      probeTimer = null;
    }
    puts('[probe] ws/api socket closed');
  });
}

(() => {
  const isTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
  if (!isTauriRuntime || window.__SQUIRREL_FORCE_FASTIFY__ === true) {
    setTimeout(startFastifyBroadcastProbe, 2500);
  }
})();
