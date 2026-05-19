// Exemple de test WebSocket avec le serveur Fastify sur le port 3001
// Interface complète utilisant les APIs Squirrel

// Variables globales pour WebSocket
let websocket = null;
let isConnected = false;
let messageInputElement = null;

// Container principal
const container = $('div', {
  css: {
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    maxWidth: '800px',
    margin: '0 auto',
    backgroundColor: '#f8f9fa',
    borderRadius: '10px'
  },
  parent: '#view'
});

// Titre
$('h1', {
  text: '🔌 Test WebSocket avec Fastify',
  css: {
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: '30px'
  },
  parent: container
});

// Statut de connexion
const statusDisplay = $('div', {
  css: {
    backgroundColor: '#e74c3c',
    color: 'white',
    padding: '15px',
    borderRadius: '8px',
    textAlign: 'center',
    marginBottom: '20px',
    fontWeight: 'bold'
  },
  text: '❌ Déconnecté',
  parent: container
});

// Section Health Check
const healthSection = $('div', {
  css: {
    backgroundColor: 'white',
    border: '2px solid #dee2e6',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px'
  },
  parent: container
});

$('h2', {
  text: '🏥 Health Check',
  css: { color: '#495057', marginBottom: '15px' },
  parent: healthSection
});

const healthButton = $('button', {
  text: '🔍 Tester le serveur',
  css: {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
    marginRight: '10px'
  },
  onclick: checkHealth,
  parent: healthSection
});

const healthResult = $('div', {
  css: {
    marginTop: '15px',
    padding: '10px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '14px'
  },
  text: 'Cliquez pour tester la connexion...',
  parent: healthSection
});

// Section WebSocket
const wsSection = $('div', {
  css: {
    backgroundColor: 'white',
    border: '2px solid #dee2e6',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px'
  },
  parent: container
});

$('h2', {
  text: '🌐 WebSocket',
  css: { color: '#495057', marginBottom: '15px' },
  parent: wsSection
});

const connectBtn = $('button', {
  text: '🔗 Connecter',
  css: {
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
    marginRight: '10px'
  },
  onclick: connectWS,
  parent: wsSection
});

const disconnectBtn = $('button', {
  text: '🔌 Déconnecter',
  css: {
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
    marginRight: '10px',
    display: 'none'
  },
  onclick: disconnectWS,
  parent: wsSection
});

// Input message avec la nouvelle API Squirrel améliorée
messageInputElement = $('input', {
  id: 'message-input',
  attrs: {
    type: 'text',
    placeholder: 'Message à envoyer...'
  },
  css: {
    width: '60%',
    padding: '10px',
    border: '1px solid #ced4da',
    borderRadius: '6px',
    marginTop: '15px',
    marginRight: '10px'
  },
  parent: wsSection
});

const sendBtn = $('button', {
  text: '📤 Envoyer',
  css: {
    backgroundColor: '#17a2b8',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  onclick: sendMessage,
  parent: wsSection
});

const messagesLog = $('div', {
  css: {
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    padding: '15px',
    marginTop: '15px',
    maxHeight: '200px',
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: '12px'
  },
  text: 'Messages WebSocket...',
  parent: wsSection
});

// Section Database Management
const dbSection = $('div', {
  css: {
    backgroundColor: 'white',
    border: '2px solid #dee2e6',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px'
  },
  parent: container
});

$('h2', {
  text: '� User Management',
  css: { color: '#495057', marginBottom: '20px' },
  parent: dbSection
});

// Add User Form
const addUserForm = $('div', {
  css: {
    backgroundColor: '#f8f9fa',
    padding: '15px',
    borderRadius: '6px',
    marginBottom: '20px',
    border: '1px solid #dee2e6'
  },
  parent: dbSection
});

$('h3', {
  text: '➕ Add New User',
  css: { color: '#28a745', marginBottom: '15px', fontSize: '18px' },
  parent: addUserForm
});

// Name input
const nameInput = $('input', {
  attrs: {
    type: 'text',
    placeholder: 'Enter user name...',
    id: 'user-name-input'
  },
  css: {
    width: '200px',
    padding: '8px 12px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    marginRight: '10px',
    marginBottom: '10px'
  },
  parent: addUserForm
});

// Password input
const passwordInput = $('input', {
  attrs: {
    type: 'password',
    placeholder: 'Enter password...',
    id: 'user-password-input'
  },
  css: {
    width: '200px',
    padding: '8px 12px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    marginRight: '10px',
    marginBottom: '10px'
  },
  parent: addUserForm
});

// Role select
const roleSelect = $('select', {
  id: 'user-role-select',
  css: {
    width: '120px',
    padding: '8px 12px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    marginRight: '10px',
    marginBottom: '10px'
  },
  parent: addUserForm
});

// Add options to select
['read', 'edit', 'admin'].forEach(role => {
  const option = $('option', {
    attrs: { value: role },
    text: role.charAt(0).toUpperCase() + role.slice(1),
    parent: roleSelect
  });
});

// Add user button
const addUserBtn = $('button', {
  text: '✅ Add User',
  css: {
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    marginLeft: '10px'
  },
  onclick: addNewUser,
  parent: addUserForm
});

// Users list and management
const usersManagement = $('div', {
  css: {
    marginTop: '20px'
  },
  parent: dbSection
});

$('h3', {
  text: '📋 Users List',
  css: { color: '#495057', marginBottom: '15px', fontSize: '18px' },
  parent: usersManagement
});

// Refresh button
const refreshUsersBtn = $('button', {
  text: '🔄 Refresh Users',
  css: {
    backgroundColor: '#17a2b8',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    marginBottom: '15px'
  },
  onclick: loadUsersList,
  parent: usersManagement
});

// Users display container
const usersContainer = $('div', {
  css: {
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    maxHeight: '400px',
    overflowY: 'auto'
  },
  parent: usersManagement
});

// Status display
const statusDisplay2 = $('div', {
  css: {
    padding: '15px',
    marginTop: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '14px',
    border: '1px solid #dee2e6',
    minHeight: '100px'
  },
  text: 'Ready to manage users...',
  parent: dbSection
});

function getFastifyHttpBase() {
  try {
    const base = typeof window !== 'undefined' ? window.__SQUIRREL_FASTIFY_URL__ : '';
    if (typeof base === 'string' && base.trim()) return base.trim().replace(/\/$/, '');
  } catch (e) { }
  return null;
}

function getFastifyWsApiUrl() {
  try {
    const explicit = typeof window !== 'undefined' ? window.__SQUIRREL_FASTIFY_WS_API_URL__ : '';
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  } catch (e) { }

  const httpBase = getFastifyHttpBase();
  if (!httpBase) return null;
  return httpBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/ws/api';
}

// === FONCTIONS ===

function checkHealth() {
  const base = getFastifyHttpBase();
  if (!base) {
    healthResult.innerHTML = `
        <div style="color: #dc3545; font-weight: bold;">❌ Error</div>
        <div>Fastify URL is not configured (server_config.json)</div>
      `;
    return;
  }

  fetch(`${base}/health`)
    .then(response => response.json())
    .then(data => {
      healthResult.innerHTML = `
        <div style="color: #28a745; font-weight: bold;">✅ Serveur OK</div>
        <div>Status: ${data.status}</div>
        <div>Uptime: ${Math.round(data.uptime)}s</div>
        <div>Version: ${data.fastify}</div>
      `;
    })
    .catch(error => {
      healthResult.innerHTML = `
        <div style="color: #dc3545; font-weight: bold;">❌ Erreur</div>
        <div>Serveur inaccessible: ${base}</div>
      `;
    });
}

function connectWS() {
  if (isConnected) return;

  const wsUrl = getFastifyWsApiUrl();
  if (!wsUrl) {
    logMessage('❌ Error', 'Fastify WebSocket URL is not configured (server_config.json)');
    return;
  }

  websocket = new WebSocket(wsUrl);

  websocket.onopen = () => {
    isConnected = true;
    updateStatus(true);
    logMessage('🔗 Connexion', 'WebSocket connecté !');
  };

  websocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      logMessage('📥 Reçu', JSON.stringify(data, null, 2));
    } catch (e) {
      logMessage('📥 Reçu', event.data);
    }
  };

  websocket.onclose = () => {
    isConnected = false;
    updateStatus(false);
    logMessage('🔌 Fermé', 'WebSocket déconnecté');
  };

  websocket.onerror = (error) => {
    logMessage('❌ Erreur', 'Erreur WebSocket');
  };
}

function disconnectWS() {
  if (websocket && isConnected) {
    websocket.close();
  }
}

function sendMessage() {
  if (!isConnected || !websocket) {
    logMessage('⚠️ Attention', 'Pas de connexion WebSocket');
    return;
  }

  if (!messageInputElement || !messageInputElement.value) {
    logMessage('❌ Erreur', 'Input de message non disponible');
    return;
  }

  const msg = messageInputElement.value.trim();
  if (!msg) return;

  const data = {
    type: 'message',
    content: msg,
    timestamp: new Date().toISOString()
  };

  websocket.send(JSON.stringify(data));
  logMessage('📤 Envoyé', JSON.stringify(data));
  messageInputElement.value = '';
}

function updateStatus(connected) {
  if (connected) {
    statusDisplay.style.backgroundColor = '#28a745';
    statusDisplay.textContent = '✅ WebSocket Connecté';
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'inline-block';
  } else {
    statusDisplay.style.backgroundColor = '#e74c3c';
    statusDisplay.textContent = '❌ WebSocket Déconnecté';
    connectBtn.style.display = 'inline-block';
    disconnectBtn.style.display = 'none';
  }
}

function logMessage(type, content) {
  const time = new Date().toLocaleTimeString();
  const entry = $('div', {
    css: {
      borderBottom: '1px solid #dee2e6',
      paddingBottom: '5px',
      marginBottom: '5px'
    },
    parent: messagesLog
  });

  $('strong', {
    text: `[${time}] ${type}: `,
    css: { color: '#495057' },
    parent: entry
  });

  $('span', {
    text: content,
    css: { color: '#6c757d' },
    parent: entry
  });

  messagesLog.scrollTop = messagesLog.scrollHeight;
}

// Database API Functions
// User Management Functions
async function addNewUser() {
  const name = nameInput.value.trim();
  const password = passwordInput.value.trim();
  const role = roleSelect.value;
  if (!name || !password) {
    updateUserStatus('❌ Please fill in both name and password', 'error');
    return;
  }

  try {
    updateUserStatus('⏳ Creating user...', 'info');

    const base = getFastifyHttpBase();
    if (!base) {
      updateUserStatus('❌ Fastify URL is not configured (server_config.json)', 'error');
      return;
    }

    const response = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        password: password,
        autorisation: role
      })
    });

    const data = await response.json();
    if (data.success) {
      updateUserStatus(`✅ User "${name}" created successfully!`, 'success');

      // Clear form
      nameInput.value = '';
      passwordInput.value = '';
      roleSelect.value = 'read';

      // Refresh users list
      await loadUsersList();

      // Send WebSocket notification if connected
      if (isConnected && websocket) {
        websocket.send(JSON.stringify({
          type: 'user_added',
          user: data.data,
          timestamp: new Date().toISOString()
        }));
      }
    } else {
      updateUserStatus(`❌ Error creating user: ${data.error}`, 'error');
    }
  } catch (error) {
    updateUserStatus(`❌ Network Error: ${error.message}`, 'error');
  }
}

async function deleteUser(userId, userName) {
  // Créer une div de confirmation personnalisée
  showDeleteConfirmation(userId, userName);
}

function showDeleteConfirmation(userId, userName) {
  // Overlay semi-transparent
  const overlay = $('div', {
    css: {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      zIndex: '1000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    parent: 'body'
  });

  // Modal de confirmation
  const modal = $('div', {
    css: {
      backgroundColor: 'white',
      borderRadius: '10px',
      padding: '30px',
      maxWidth: '400px',
      width: '90%',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
      textAlign: 'center',
      position: 'relative'
    },
    parent: overlay
  });

  // Icône d'avertissement
  $('div', {
    text: '⚠️',
    css: {
      fontSize: '48px',
      marginBottom: '20px'
    },
    parent: modal
  });

  // Titre
  $('h3', {
    text: 'Confirmer la suppression',
    css: {
      color: '#e74c3c',
      marginBottom: '15px',
      fontSize: '20px'
    },
    parent: modal
  });

  // Message
  $('p', {
    text: `Êtes-vous sûr de vouloir supprimer l'utilisateur "${userName}" ?`,
    css: {
      color: '#2c3e50',
      marginBottom: '25px',
      lineHeight: '1.5'
    },
    parent: modal
  });

  // Container pour les boutons
  const buttonContainer = $('div', {
    css: {
      display: 'flex',
      gap: '15px',
      justifyContent: 'center'
    },
    parent: modal
  });

  // Bouton Annuler
  $('button', {
    text: '❌ Annuler',
    css: {
      backgroundColor: '#95a5a6',
      color: 'white',
      border: 'none',
      padding: '12px 24px',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold'
    },
    onclick: () => {
      overlay.remove();
    },
    parent: buttonContainer
  });

  // Bouton Confirmer
  $('button', {
    text: '🗑️ Supprimer',
    css: {
      backgroundColor: 'transparent',
      color: 'white',
      border: 'none',
      padding: '12px 24px',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold'
    },
    onclick: () => {
      overlay.remove();
      performDeleteUser(userId, userName);
    },
    parent: buttonContainer
  });

  // Fermer si on clique sur l'overlay
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  };
}

async function performDeleteUser(userId, userName) {
  try {
    updateUserStatus(`⏳ Deleting user "${userName}"...`, 'info');

    const base = getFastifyHttpBase();
    if (!base) {
      updateUserStatus('❌ Fastify URL is not configured (server_config.json)', 'error');
      return;
    }

    const response = await fetch(`${base}/api/users/${userId}`, {
      method: 'DELETE'
    });

    const data = await response.json();
    if (data.success) {
      updateUserStatus(`✅ User "${userName}" deleted successfully!`, 'success');

      // Refresh users list
      await loadUsersList();

      // Send WebSocket notification if connected
      if (isConnected && websocket) {
        websocket.send(JSON.stringify({
          type: 'user_deleted',
          userId: userId,
          userName: userName,
          timestamp: new Date().toISOString()
        }));
      }
    } else {
      updateUserStatus(`❌ Error deleting user: ${data.error}`, 'error');
    }
  } catch (error) {
    updateUserStatus(`❌ Network Error: ${error.message}`, 'error');
  }
}

async function loadUsersList() {
  try {
    updateUserStatus('⏳ Loading users...', 'info');

    const base = getFastifyHttpBase();
    if (!base) {
      updateUserStatus('❌ Fastify URL is not configured (server_config.json)', 'error');
      usersContainer.innerHTML = '<div style="padding: 15px; color: #dc3545;">Fastify URL not configured</div>';
      return;
    }

    const response = await fetch(`${base}/api/users`);
    const data = await response.json();
    if (data.success) {
      displayUsers(data.data);
      updateUserStatus(`✅ Loaded ${data.data.length} users`, 'success');
    } else {
      updateUserStatus(`❌ Error loading users: ${data.error}`, 'error');
      usersContainer.innerHTML = '<div style="padding: 15px; color: #dc3545;">Failed to load users</div>';
    }
  } catch (error) {
    updateUserStatus(`❌ Network Error: ${error.message}`, 'error');
    usersContainer.innerHTML = '<div style="padding: 15px; color: #dc3545;">Network error</div>';
  }
}

function displayUsers(users) {
  if (users.length === 0) {
    usersContainer.innerHTML = '<div style="padding: 15px; color: #6c757d;">No users found</div>';
    return;
  }

  usersContainer.innerHTML = '';

  users.forEach(user => {
    const userRow = $('div', {
      css: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 15px',
        borderBottom: '1px solid #dee2e6',
        ':hover': {
          backgroundColor: '#f8f9fa'
        }
      },
      parent: usersContainer
    });

    const userInfo = $('div', {
      css: {
        flex: '1'
      },
      parent: userRow
    });

    $('div', {
      text: `👤 ${user.name}`,
      css: {
        fontWeight: 'bold',
        marginBottom: '4px'
      },
      parent: userInfo
    });

    $('div', {
      text: `ID: ${user.id} | Role: ${user.autorisation} | Created: ${new Date(user.created_at).toLocaleDateString()}`,
      css: {
        fontSize: '12px',
        color: '#6c757d'
      },
      parent: userInfo
    });

    const actionsDiv = $('div', {
      css: {
        display: 'flex',
        gap: '8px'
      },
      parent: userRow
    });

    $('button', {
      text: '🗑️ Delete',
      css: {
        backgroundColor: 'transparent',
        color: 'white',
        border: 'none',
        padding: '6px 12px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px'
      },
      onclick: () => deleteUser(user.id, user.name),
      parent: actionsDiv
    });
  });
}

function updateUserStatus(message, type = 'info') {
  const colors = {
    success: '#28a745',
    error: '#dc3545',
    info: '#17a2b8',
    warning: '#ffc107'
  };

  const timestamp = new Date().toLocaleTimeString();

  statusDisplay2.innerHTML = `
    <div style="color: ${colors[type]}; font-weight: bold;">
      [${timestamp}] ${message}
    </div>
  `;

  // Auto clear after 5 seconds for non-error messages
  if (type !== 'error') {
    setTimeout(() => {
      if (statusDisplay2.innerHTML.includes(message)) {
        statusDisplay2.innerHTML = 'Ready to manage users...';
      }
    }, 5000);
  }
}

// Event listener pour Enter dans l'input
messageInputElement.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// Auto-load users list when page loads
setTimeout(() => {
  loadUsersList();
}, 2000);

// Add Enter key support for form inputs
nameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addNewUser();
});

passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addNewUser();
});

// Auto-test du serveur au chargement
setTimeout(checkHealth, 1000);
