// Exemple d'utilisation du WebSocket natif côté client
class WebSocketClient {
  constructor(url = 'ws://localhost:3001/ws') {
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = (event) => {
        console.log('✅ WebSocket connecté:', this.url);
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Message reçu:', data);
          this.handleMessage(data);
        } catch (error) {
          console.error('❌ Erreur parsing message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('👋 WebSocket fermé:', event.code, event.reason);
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('❌ Erreur WebSocket:', error);
      };

    } catch (error) {
      console.error('❌ Erreur connexion WebSocket:', error);
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('⚠️ WebSocket non connecté');
    }
  }

  handleMessage(data) {
    switch (data.type) {
      case 'welcome':
        console.log('🎉', data.message);
        break;
      case 'echo':
        console.log('🔄 Echo reçu:', data.original);
        break;
      case 'event':
        console.log('📡 Événement:', data.data);
        break;
      case 'error':
        console.error('❌ Erreur serveur:', data.message);
        break;
      default:
        console.log('📦 Message non géré:', data);
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
      setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
    } else {
      console.error('❌ Impossible de se reconnecter après', this.maxReconnectAttempts, 'tentatives');
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// ===========================
// UTILISATION
// ===========================

// Créer une instance du client
const client = new WebSocketClient();

// Se connecter
client.connect();

// Envoyer des messages de test
setTimeout(() => {
  client.send({
    type: 'test',
    message: 'Hello depuis le client!',
    timestamp: new Date().toISOString()
  });
}, 1000);

// Client pour les événements
const eventsClient = new WebSocketClient('ws://localhost:3001/ws/events');
eventsClient.connect();

// Exposer globalement pour les tests
window.wsClient = client;
window.wsEvents = eventsClient;

console.log('🔌 Clients WebSocket initialisés');
console.log('📝 Utilisez wsClient.send({...}) pour envoyer des messages');
