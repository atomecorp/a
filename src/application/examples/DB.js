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
    marginBottom: '15px',
    marginRight: '10px'
  },
  onclick: loadUsersList,
  parent: usersManagement
});

// Database stats button
const dbStatsBtn = $('button', {
  text: '📊 DB Stats',
  css: {
    backgroundColor: '#6f42c1',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    marginBottom: '15px'
  },
  onclick: getDatabaseStats,
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

// === FONCTIONS ===

function checkHealth() {
  fetch('http://localhost:3001/health')
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
        <div>Serveur inaccessible sur localhost:3001</div>
      `;
    });
}

function connectWS() {
  if (isConnected) return;
  
  websocket = new WebSocket('ws://localhost:3001/ws');
  
  websocket.onopen = () => {
    isConnected = true;
    updateStatus(true);
    logMessage('🔗 Connexion', 'WebSocket connecté !');
  };
    websocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Handle database operation responses
      switch (data.type) {
        case 'add_user_response':
          if (data.success) {
            updateUserStatus(`✅ User "${data.data.name}" created successfully!`, 'success');
            loadUsersList(); // Refresh the list
          } else {
            updateUserStatus(`❌ Error creating user: ${data.error}`, 'error');
          }
          break;
          
        case 'delete_user_response':
          if (data.success) {
            updateUserStatus(`✅ User deleted successfully!`, 'success');
            loadUsersList(); // Refresh the list
          } else {
            updateUserStatus(`❌ Error deleting user: ${data.error}`, 'error');
          }
          break;
          
        case 'users_response':
          if (data.success) {
            displayUsers(data.data);
            updateUserStatus(`✅ Loaded ${data.data.length} users via WebSocket`, 'success');
          } else {
            updateUserStatus(`❌ Error loading users: ${data.error}`, 'error');
            usersContainer.innerHTML = '<div style="padding: 15px; color: #dc3545;">Failed to load users</div>';
          }
          break;
          
        case 'db_stats_response':
          if (data.success) {
            updateUserStatus(`✅ Database Stats: ${data.data.users} users, ${data.data.projects} projects`, 'success');
          } else {
            updateUserStatus(`❌ Error getting stats: ${data.error}`, 'error');
          }
          break;
          
        default:
          // Log other messages as before
          logMessage('📥 Reçu', JSON.stringify(data, null, 2));
          break;
      }
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
// User Management Functions (WebSocket-based)
async function addNewUser() {
  const name = nameInput.value.trim();
  const password = passwordInput.value.trim();
  const role = roleSelect.value;
  
  if (!name || !password) {
    updateUserStatus('❌ Please fill in both name and password', 'error');
    return;
  }
  
  if (!isConnected || !websocket) {
    updateUserStatus('❌ WebSocket not connected. Please connect first.', 'error');
    return;
  }
  
  try {
    updateUserStatus('⏳ Creating user via WebSocket...', 'info');
    
    // Send via WebSocket instead of HTTP
    websocket.send(JSON.stringify({
      type: 'add_user',
      userData: {
        name: name,
        password: password,
        autorisation: role
      },
      timestamp: new Date().toISOString()
    }));
    
    // Clear form immediately (response will be handled in WebSocket message handler)
    nameInput.value = '';
    passwordInput.value = '';
    roleSelect.value = 'read';
    
  } catch (error) {    updateUserStatus(`❌ WebSocket Error: ${error.message}`, 'error');
  }
}

async function deleteUser(userId, userName) {
  if (!confirm(`Are you sure you want to delete user "${userName}"?`)) {
    return;
  }
  
  if (!isConnected || !websocket) {
    updateUserStatus('❌ WebSocket not connected. Please connect first.', 'error');
    return;
  }
  
  try {
    updateUserStatus(`⏳ Deleting user "${userName}" via WebSocket...`, 'info');
    
    // Send via WebSocket instead of HTTP
    websocket.send(JSON.stringify({
      type: 'delete_user',
      userId: userId,
      userName: userName,
      timestamp: new Date().toISOString()
    }));    
  } catch (error) {
    updateUserStatus(`❌ WebSocket Error: ${error.message}`, 'error');
  }
}

async function loadUsersList() {
  if (!isConnected || !websocket) {
    updateUserStatus('❌ WebSocket not connected. Please connect first.', 'error');
    usersContainer.innerHTML = '<div style="padding: 15px; color: #dc3545;">WebSocket not connected</div>';
    return;
  }
  
  try {
    updateUserStatus('⏳ Loading users via WebSocket...', 'info');
    
    // Send via WebSocket instead of HTTP
    websocket.send(JSON.stringify({
      type: 'get_users',
      timestamp: new Date().toISOString()
    }));
    
  } catch (error) {
    updateUserStatus(`❌ WebSocket Error: ${error.message}`, 'error');    usersContainer.innerHTML = '<div style="padding: 15px; color: #dc3545;">WebSocket error</div>';
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
        backgroundColor: '#dc3545',
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

function getDatabaseStats() {
  if (!isConnected || !websocket) {
    updateUserStatus('❌ WebSocket not connected. Please connect first.', 'error');
    return;
  }
  
  try {
    updateUserStatus('⏳ Getting database stats via WebSocket...', 'info');
    
    // Send via WebSocket instead of HTTP
    websocket.send(JSON.stringify({
      type: 'get_db_stats',
      timestamp: new Date().toISOString()
    }));
    
  } catch (error) {
    updateUserStatus(`❌ WebSocket Error: ${error.message}`, 'error');
  }
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
