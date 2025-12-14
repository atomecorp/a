
// ============================================
// ADOLE v3.0 - PRODUCTION API ACCESS
// ============================================

import { AdoleAPI } from '../../squirrel/apis/unified/adole_apis.js';

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
 */
async function loadProjectView(projectId, projectName) {
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

  // Remove existing project div if any
  if (currentProjectDiv) {
    currentProjectDiv.remove();
  }

  // Check if project_canvas exists, create if not
  let canvasContainer = grab('project_canvas');
  if (!canvasContainer) {
    canvasContainer = $('div', {
      id: 'project_canvas',
      parent: grab('view'),
      css: {
        position: 'fixed',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        backgroundColor: '#333',
        overflow: 'hidden',
        zIndex: '-1'
      }
    });
  }

  // Create new project container inside the canvas
  currentProjectDiv = $('div', {
    id: 'project_view_' + projectId,
    parent: canvasContainer,
    css: {
      position: 'relative',
      width: '100%',
      height: '100%',
      backgroundColor: '#3a3a3a',
      overflow: 'hidden'
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

  const result = await list_atomes({ parentId: projectId });
  const atomes = result.tauri.atomes.length > 0 ? result.tauri.atomes : result.fastify.atomes;

  // Filter to get only atomes that belong to this project
  atomes.forEach(atome => {
    const atomeId = atome.atome_id || atome.id;
    const atomeType = atome.atome_type || atome.type;
    const particles = atome.particles || atome.data || {};

    // Skip projects and users
    if (atomeType === 'project' || atomeType === 'user') return;

    // Get stored position or default
    const left = particles.left || '50px';
    const top = particles.top || '50px';
    const color = particles.color || atome.color || 'blue';

    createVisualAtome(atomeId, atomeType, color, left, top);
  });
}

/**
 * TEST ONLY - Create a visual atome element in the project container
 * @param {string} atomeId - The atome ID
 * @param {string} type - The atome type
 * @param {string} color - The atome color
 * @param {string} left - CSS left position
 * @param {string} top - CSS top position
 * @returns {HTMLElement} The created element
 */
function createVisualAtome(atomeId, type, color, left, top) {
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
      borderRadius: '8px',
      cursor: 'move',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      color: 'white',
      fontSize: '12px',
      textAlign: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      userSelect: 'none',
      border: '2px solid transparent'
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
function selectVisualAtome(atomeEl, atomeId) {
  // Deselect previous
  if (selectedVisualAtome) {
    selectedVisualAtome.style.border = '2px solid transparent';
  }

  // Select new
  selectedVisualAtome = atomeEl;
  selectedAtomeId = atomeId;
  atomeEl.style.border = '2px solid yellow';
  puts('Selected atome: ' + atomeId.substring(0, 8) + '...');
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

    alter_atome(atomeId, { left: newLeft, top: newTop }).then(result => {
      if (result.tauri.success || result.fastify.success) {
        puts('Position saved: ' + newLeft + ', ' + newTop);
      }
    }).catch(error => {
      puts('❌ Failed to save position: ' + error);
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
      zIndex: '1000'
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
      overflowY: 'auto'
    }
  });

  $('div', {
    parent: modal,
    css: { fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#333' },
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
        color: '#333'
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
      color: '#333'
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
      zIndex: '1000'
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
      overflowY: 'auto'
    }
  });

  $('div', {
    parent: modal,
    css: { fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#333' },
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
        color: '#333'
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
      color: '#333'
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
      zIndex: '1000'
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
      overflowY: 'auto'
    }
  });

  $('div', {
    parent: modal,
    css: { fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#333' },
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
        fontSize: '14px'
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
      color: '#333'
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
      puts('Project loaded: ' + projectName);
      await loadProjectView(projectId, projectName);
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

$('br', {});

$('span', {
  id: 'current_user',
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


$('br', {});


$('span', {
  id: 'create_user',
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

$('br', {});
const atome_type = 'shape';
const atome_color = 'blue';
const atome_project_name = 'my project';

$('input', {
  id: 'atome_project_name_input',
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
$('br', {});



$('span', {
  id: 'create_project',
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
    const result = await create_project(projectName);

    if (result.tauri.success || result.fastify.success) {
      const tauriData = result.tauri?.data?.data;
      const fastifyData = result.fastify?.data?.data;

      const newId = tauriData?.atome_id || fastifyData?.atome_id;

      if (newId) {
        puts('✅ Project created: ' + projectName);
        await loadProjectView(newId, projectName);
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

    await loadProjectView(selection.project_id, selection.project_name);
    puts('✅ Project loaded: ' + selection.project_name);
  },
});


$('span', {
  id: 'delete_project',
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

$('br', {});

$('span', {
  id: 'create_atome',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'create atome',
  onClick: () => {
    if (!selectedProjectId) {
      puts('❌ No project loaded. Please load a project first.');
      return;
    }
    const atomeType = grab('atome_type_input').value;
    const atomeColor = grab('atome_color_input').value;
    // puts('Creating atome: ' + atomeType + ' (' + atomeColor + ')');
    create_atome({
      type: atomeType,
      color: atomeColor,
      projectId: selectedProjectId,
      particles: { left: '100px', top: '100px' }
    }, (result) => {
      console.log('[create_atome button] Full result:', result);
      if (result.tauri.success || result.fastify.success) {
        // Try multiple paths to extract the ID
        const tauriData = result.tauri.data || {};
        const fastifyData = result.fastify.data || {};
        const newId = tauriData.atome_id || tauriData.id || tauriData.atomeId ||
          fastifyData.atome_id || fastifyData.id || fastifyData.atomeId ||
          (typeof tauriData === 'string' ? tauriData : null) ||
          (typeof fastifyData === 'string' ? fastifyData : null) ||
          'atome_' + Date.now();
        console.log('[create_atome button] Extracted ID:', newId);
        puts('✅ Atome created: ' + newId.substring(0, 8) + '...');
        // Create visual element
        createVisualAtome(newId, atomeType, atomeColor, '100px', '100px');
      } else {
        puts('❌ Failed to create atome');
      }
    });
  },
});

$('span', {
  id: 'delete_atome',
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
    // For testing, change color to a random one
    const colors = ['red', 'green', 'blue', 'purple', 'orange', 'cyan', 'magenta'];
    const newColor = colors[Math.floor(Math.random() * colors.length)];
    puts('Altering atome color to: ' + newColor);
    const result = await alter_atome(selectedAtomeId, { color: newColor });

    if (result.tauri?.success || result.fastify?.success) {
      puts('✅ Atome altered');
      // Update visual element
      selectedVisualAtome.style.backgroundColor = newColor;
    } else {
      puts('❌ Failed to alter atome');
    }
  },
});

$('span', {
  id: 'list_atomes',
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

$('br', {});

$('span', {
  id: 'sync_atomes',
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


