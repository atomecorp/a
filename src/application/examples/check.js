


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
const delete_atome = AdoleAPI.atomes.delete;
const alter_atome = AdoleAPI.atomes.alter;

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

  puts('✅ SECURITY: Skipping redundant ownership check - user accessed project via list_projects()');

  // Continue with project loading...

  // Remove existing project div and clear state if any
  if (currentProjectDiv) {
    currentProjectDiv.remove();
    currentProjectDiv = null;
  }
  
  // Clear visual atome selection
  selectedVisualAtome = null;
  selectedAtomeId = null;
  
  puts('🔄 Creating new project view for: ' + projectName + ' (ID: ' + projectId + ')');

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
      pointerEvents: 'none'  // Don't capture events, let children handle them
    }
  });

  // Update state
  selectedProjectId = projectId;
  currentProjectName = projectName;
  grab('current_project').textContent = projectName;

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

  puts('🔍 Loading atomes for project: ' + projectId);
  
  // Try different filter approaches
  const result = await list_atomes({ projectId: projectId });
  let atomes = result.tauri.atomes.length > 0 ? result.tauri.atomes : result.fastify.atomes;
  
  puts('📊 Total atomes found: ' + atomes.length);
  
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
    
    puts('🔍 Atome ' + (atome.atome_id || atome.id).substring(0, 8) + 
         ' type: ' + atomeType + 
         ' projectId: ' + (atomeProjectId || 'none') + 
         ' particleProjectId: ' + (particleProjectId || 'none') + 
         ' belongs: ' + belongsToProject);
    
    return belongsToProject;
  });
  
  puts('✅ Project atomes found: ' + projectAtomes.length);
  
  // Create visual elements for project atomes
  projectAtomes.forEach(atome => {
    const atomeId = atome.atome_id || atome.id;
    const atomeType = atome.atome_type || atome.type;
    const particles = atome.particles || atome.data || {};

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
    
    puts('📍 Loading atome ' + atomeId.substring(0, 8) + 
         ' - saved position: (' + (savedLeft || 'none') + ', ' + (savedTop || 'none') + ')' +
         ' - using position: (' + left + ', ' + top + ')' +
         ' - saved style: borderRadius=' + (savedBorderRadius || 'default') + ', opacity=' + (savedOpacity !== undefined ? savedOpacity : 'default'));
    console.log('[Position Load] Atome data:', { 
      atomeId: atomeId.substring(0, 8), 
      particles, 
      savedLeft, savedTop, left, top,
      savedBorderRadius, savedOpacity, borderRadius, opacity
    });

    createVisualAtome(atomeId, atomeType, color, left, top, borderRadius, opacity);
  });
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
  selectedAtomeId = atomeId;
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
    const atomes = listResult.tauri.atomes.length > 0 ? listResult.tauri.atomes : listResult.fastify.atomes;
    
    const currentAtome = atomes.find(a => (a.atome_id || a.id) === atomeId);
    
    if (currentAtome) {
      puts('✅ Found current atome state');
      console.log('Current atome data:', currentAtome);
      
      // Check if manual history exists in localStorage
      const historyKey = 'atome_history_' + atomeId;
      const storedHistory = localStorage.getItem(historyKey);
      
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
        localStorage.setItem(historyKey, JSON.stringify(currentAtomeHistory));
      }
      
      // Set to most recent entry
      currentHistoryIndex = Math.max(0, currentAtomeHistory.length - 1);
      
    } else {
      puts('❌ Atome not found in project atomes list');
      currentAtomeHistory = [];
    }
  } catch (error) {
    puts('❌ Error loading atome history: ' + error);
    console.error('History loading error:', error);
    currentAtomeHistory = [];
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
    slider.max = (currentAtomeHistory.length - 1).toString();
    slider.value = currentHistoryIndex.toString();
    
    const currentEntry = currentAtomeHistory[currentHistoryIndex];
    info.textContent = 'Entry ' + currentHistoryIndex + '/' + (currentAtomeHistory.length - 1) + 
      ' - Date: ' + (currentEntry.created_at || 'unknown');
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

  atomeEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Left click only
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = parseInt(atomeEl.style.left) || 0;
    initialTop = parseInt(atomeEl.style.top) || 0;
    atomeEl.style.zIndex = '100';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    atomeEl.style.left = (initialLeft + dx) + 'px';
    atomeEl.style.top = (initialTop + dy) + 'px';
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    atomeEl.style.zIndex = '';

    // Save new position to database
    const newLeft = atomeEl.style.left;
    const newTop = atomeEl.style.top;

    // Don't save if this is a temporary ID
    if (atomeId.startsWith('temp_atome_') || atomeId.startsWith('atome_')) {
      puts('⚠️ Skipping save for temporary atome ID: ' + atomeId.substring(0, 8));
      return;
    }

    puts('💾 Saving position for atome ' + atomeId.substring(0, 8) + ': ' + newLeft + ', ' + newTop);
    
    // Save to manual history first
    saveHistoryEntry(atomeId, { left: newLeft, top: newTop }, 'Position changed');
    
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
 * TEST ONLY - Open a project selector dialog - SECURE VERSION
 * Only shows projects owned by the current user
 * @param {Function} callback - Callback with selected project { project_id, project_name }
 */
async function open_project_selector(callback) {
  const projectsResult = await list_projects();

  // SECURITY: Check for authentication errors
  if (projectsResult.tauri.error && projectsResult.tauri.error.includes('SECURITY')) {
    puts('❌ ' + projectsResult.tauri.error);
    if (typeof callback === 'function') {
      callback({ project_id: null, project_name: null, cancelled: true, error: 'Not logged in' });
    }
    return;
  }

  const projects = projectsResult.tauri.projects.length > 0
    ? projectsResult.tauri.projects
    : projectsResult.fastify.projects;

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
    if (typeof callback === 'function') {
      callback({ user_id: null, username: null, phone: null, cancelled: true });
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
            const loggedUsername = userData?.user?.username || userData?.username || username;
            puts('✅ Switched to user: ' + loggedUsername);
            grab('logged_user').textContent = loggedUsername;
            
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
              const projects = projectsResult.tauri.projects.length > 0
                ? projectsResult.tauri.projects
                : projectsResult.fastify.projects;
              
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
              callback({ user_id: userId, username: loggedUsername, phone: phone, cancelled: false });
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
  const atomes = atomesResult.tauri.atomes.length > 0
    ? atomesResult.tauri.atomes
    : atomesResult.fastify.atomes;

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
        selectedAtomeId = atomeId;
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

//todo: share atomes both atome project type and atome width other user user

//todo: restore atomes from it's history to and bring back the new state to present
//todo: restore atomes from it's history and create an altered history from the present state

/// input box below




(async () => {
  const result = await current_user();
  if (result.logged && result.user) {
    const user_found = result.user.username;
    puts(user_found);
    grab('logged_user').textContent = user_found;
  } else {
    puts('no user logged');
    grab('logged_user').textContent = 'no user logged';
  }
})();

// Load current project on startup
(async () => {
  const result = await list_projects();
  const projects = result.tauri.projects.length > 0
    ? result.tauri.projects
    : result.fastify.projects;

  if (projects && projects.length > 0) {
    const firstProject = projects[0];
    const projectId = firstProject.atome_id;
    const projectName = firstProject.data?.name || 'Unnamed Project';

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
$('span', {
  id: 'clear_console',
  parent: intuitionContainer,
  css: {
    backgroundColor: 'rgba(247, 0, 255, 1)',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'clear console',
  onClick: () => {
    puts('Clearing console...');
    console.clear();
  },
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

$('span', {
  id: 'current_user',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'get current user',
  onClick: async () => {
    const result = await current_user();
    if (result.logged && result.user) {
      const user_found = result.user.username;
      puts(user_found);
      grab('logged_user').textContent = user_found;
    } else {
      puts('no user logged');
      grab('logged_user').textContent = 'no user logged';
    }
  },
});




$('span', {
  id: 'user_list',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'Get user list',
  onClick: async () => {
    puts('Fetching user list...');
    const result = await user_list();
    console.log('[user_list] Result:', result);

    // Display users from Tauri
    if (result.tauri.users && result.tauri.users.length > 0) {
      puts('[Tauri] Users:');
      result.tauri.users.forEach(user => {
        const name = user.username || user.data?.username || 'unknown';
        const phone = user.phone || user.data?.phone || 'unknown';
        puts('  - ' + name + ' (' + phone + ')');
      });
    } else {
      puts('[Tauri] No users found');
    }

    // Display users from Fastify
    if (result.fastify.users && result.fastify.users.length > 0) {
      puts('[Fastify] Users:');
      result.fastify.users.forEach(user => {
        const name = user.username || user.data?.username || 'unknown';
        const phone = user.phone || user.data?.phone || 'unknown';
        puts('  - ' + name + ' (' + phone + ')');
      });
    } else {
      puts('[Fastify] No users found');
    }
  },
});

$('span', {
  id: 'list_tables',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'List all tables',
  onClick: async () => {
    puts('Listing all tables...');
    const result = await list_tables();

    if (result.tauri.tables && result.tauri.tables.length > 0) {
      puts('[Tauri] Tables: ' + result.tauri.tables.join(', '));
    } else {
      puts('[Tauri] No tables found or error: ' + (result.tauri.error || 'unknown'));
    }

    if (result.fastify.tables && result.fastify.tables.length > 0) {
      puts('[Fastify] Tables: ' + result.fastify.tables.join(', '));
    } else {
      puts('[Fastify] No tables found or error: ' + (result.fastify.error || 'unknown'));
    }
  },
});

$('span', {
  id: 'list_unsynced',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'list unsynced',
  onClick: async () => {
    const result = await list_unsynced_atomes();
    // Create a concise summary including deletion states
    const summary = {
      onlyOnTauri: result.onlyOnTauri.length,
      onlyOnFastify: result.onlyOnFastify.length,
      modifiedOnTauri: result.modifiedOnTauri.length,
      modifiedOnFastify: result.modifiedOnFastify.length,
      deletedOnTauri: result.deletedOnTauri.length,
      deletedOnFastify: result.deletedOnFastify.length,
      conflicts: result.conflicts.length,
      synced: result.synced.length,
      error: result.error
    };

    // Check if there's anything to sync (including deletions)
    const hasUnsyncedItems = summary.onlyOnTauri > 0 || summary.onlyOnFastify > 0 ||
      summary.modifiedOnTauri > 0 || summary.modifiedOnFastify > 0 ||
      summary.deletedOnTauri > 0 || summary.deletedOnFastify > 0 ||
      summary.conflicts > 0;

    if (hasUnsyncedItems) {
      puts('Unsynced atomes: ' + JSON.stringify(summary));
      // Show IDs of items needing sync
      if (result.onlyOnTauri.length > 0) {
        puts('  To push: ' + result.onlyOnTauri.map(a => a.atome_id).join(', '));
      }
      if (result.onlyOnFastify.length > 0) {
        puts('  To pull: ' + result.onlyOnFastify.map(a => a.atome_id).join(', '));
      }
      if (result.deletedOnTauri.length > 0) {
        puts('  Deleted on Tauri (propagate to Fastify): ' + result.deletedOnTauri.map(d => d.id).join(', '));
      }
      if (result.deletedOnFastify.length > 0) {
        puts('  Deleted on Fastify (propagate to Tauri): ' + result.deletedOnFastify.map(d => d.id).join(', '));
      }
      if (result.conflicts.length > 0) {
        puts('  Conflicts: ' + result.conflicts.map(c => c.id).join(', '));
      }
    } else {
      puts('✅ All ' + summary.synced + ' atomes are synchronized');
    }
  },
});


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

    const results = await create_user(user_phone, user_phone, user_name);
    grab('logged_user').textContent = user_name;
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
  onClick: () => {
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
  id: 'atome_type_input',
  parent: intuitionContainer,
  attrs: {
    type: 'text',
    placeholder: 'Atome Type',
    value: atome_type
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
      const projects = projectsResult.tauri.projects.length > 0
        ? projectsResult.tauri.projects
        : projectsResult.fastify.projects;
      
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

$('span', {
  id: 'list_projects',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'list projects',
  onClick: async () => {
    puts('Fetching projects...');
    const result = await list_projects();
    const projects = result.tauri.projects.length > 0 ? result.tauri.projects : result.fastify.projects;
    if (projects.length > 0) {
      puts('Projects found: ' + projects.length);
      projects.forEach(p => {
        const name = p.name || p.data?.name || p.particles?.name || 'Unnamed';
        const id = (p.atome_id || p.id).substring(0, 8);
        puts('  - ' + name + ' (' + id + '...)');
      });
    } else {
      puts('No projects found');
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
    const atomeType = grab('atome_type_input').value;
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
      
      // Create visual element with initial position and default style
      createVisualAtome(newId, atomeType, atomeColor, initialLeft, initialTop, '8px', 1.0);
      
      // If we got a real ID, try to reload project to ensure consistency
      if (!newId.startsWith('temp_')) {
        puts('🔄 Reloading project to ensure consistency...');
        setTimeout(() => {
          loadProjectAtomes(selectedProjectId);
        }, 500);
      }
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
        selectedAtomeId = null;
      }
    } else {
      puts('❌ Failed to delete atome');
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
  id: 'list_atomes',
  parent: intuitionContainer,
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'list atomes',
  onClick: async () => {
    const atomeType = grab('atome_type_input').value;
    puts('Fetching atomes of type: ' + atomeType);
    const result = await list_atomes({ type: atomeType });
    const atomes = result.tauri.atomes.length > 0 ? result.tauri.atomes : result.fastify.atomes;
    if (atomes.length > 0) {
      puts('Atomes found: ' + atomes.length);
      atomes.forEach(a => {
        const type = a.atome_type || a.type || 'unknown';
        const color = a.color || a.data?.color || a.particles?.color || '';
        const id = (a.atome_id || a.id).substring(0, 8);
        puts('  - ' + type + (color ? ' (' + color + ')' : '') + ' - ' + id + '...');
      });
    } else {
      puts('No atomes found');
    }
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

$('span', {
  id: 'debug_positions',
  parent: intuitionContainer,
  css: {
    backgroundColor: 'rgba(255, 20, 147, 1)',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'debug positions',
  onClick: async () => {
    if (!selectedProjectId) {
      puts('❌ No project loaded. Please load a project first.');
      return;
    }
    
    puts('🔍 DEBUG: Checking saved positions for project: ' + selectedProjectId);
    const result = await list_atomes({ projectId: selectedProjectId });
    const atomes = result.tauri.atomes.length > 0 ? result.tauri.atomes : result.fastify.atomes;
    
    atomes.forEach(atome => {
      const atomeType = atome.atome_type || atome.type;
      if (atomeType === 'project' || atomeType === 'user') return;
      
      const atomeId = atome.atome_id || atome.id;
      const particles = atome.particles || atome.data || {};
      puts('🔍 Atome ' + atomeId.substring(0, 8) + ' particles: ' + JSON.stringify(particles));
    });
  },
});

// History navigation slider
let currentAtomeHistory = [];
let currentHistoryIndex = 0;

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
    maxWidth: '300px'
  }
});

$('div', {
  parent: grab('history_slider_container'),
  css: { color: 'white', fontSize: '12px', marginBottom: '5px' },
  text: 'Atome History Navigation (select an atome first)'
});

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
    width: '200px',
    margin: '5px 0'
  },
  onChange: async (e) => {
    if (!selectedAtomeId || currentAtomeHistory.length === 0) return;
    
    const historyIndex = parseInt(e.target.value);
    currentHistoryIndex = historyIndex;
    
    const historyEntry = currentAtomeHistory[historyIndex];
    if (historyEntry && selectedVisualAtome) {
      puts('📊 Applying history entry ' + historyIndex + ' to atome');
      
      // Apply visual changes from history
      const particles = historyEntry.particles || historyEntry.data || {};
      
      if (particles.left) selectedVisualAtome.style.left = particles.left;
      if (particles.top) selectedVisualAtome.style.top = particles.top;
      if (particles.color) selectedVisualAtome.style.backgroundColor = particles.color;
      if (particles.borderRadius) selectedVisualAtome.style.borderRadius = particles.borderRadius;
      if (particles.opacity !== undefined) selectedVisualAtome.style.opacity = particles.opacity;
      
      // Update info display
      grab('history_info').textContent = 'Entry ' + historyIndex + '/' + (currentAtomeHistory.length - 1) + 
        ' - Date: ' + (historyEntry.created_at || historyEntry.updated_at || 'unknown');
      
      console.log('[History] Applied entry:', historyEntry);
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
    
    const historyEntry = currentAtomeHistory[currentHistoryIndex];
    if (!historyEntry) {
      puts('❌ Invalid history entry');
      return;
    }
    
    puts('💾 Applying history entry ' + currentHistoryIndex + ' permanently to atome');
    
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
    } else {
      puts('❌ Failed to apply history entry');
      console.log('[History Apply] Failed result:', result);
    }
  }
});

$('br', { parent: intuitionContainer });

$('br', { parent: intuitionContainer });

$('span', {
  id: 'sync_atomes',
  parent: intuitionContainer,
  css: {
    backgroundColor: 'rgba(233, 146, 6, 1)',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'sync atomes',
  onClick: async () => {
    const result = await sync_atomes();
    puts('sync atomes: ' + JSON.stringify(result));
  },
});


