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

// Créer l'input directement avec DOM natif car Squirrel crée des DIV
messageInputElement = document.createElement('input');
messageInputElement.type = 'text';
messageInputElement.placeholder = 'Message à envoyer...';
messageInputElement.id = 'message-input';
messageInputElement.style.cssText = `
  width: 60%;
  padding: 10px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  margin-top: 15px;
  margin-right: 10px;
`;
wsSection.appendChild(messageInputElement);

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

// Event listener pour Enter dans l'input
messageInputElement.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// Auto-test du serveur au chargement
setTimeout(checkHealth, 1000);
