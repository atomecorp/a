#!/usr/bin/env node

// Client WebSocket Node.js pour tester le serveur Fastify v5
import WebSocket from 'ws';

const SERVER_URL = 'ws://localhost:3000/ws';

console.log('🧪 Test du WebSocket Fastify v5...');
console.log(`🔗 Connexion à: ${SERVER_URL}`);

const ws = new WebSocket(SERVER_URL);

ws.on('open', () => {
    console.log('✅ Connexion WebSocket établie');
    
    // Test 1: Message simple
    console.log('📤 Envoi du message de test...');
    ws.send(JSON.stringify({
        type: 'test',
        message: 'Hello from Node.js client!',
        timestamp: new Date().toISOString()
    }));
    
    // Test 2: Message avec données
    setTimeout(() => {
        console.log('📤 Envoi de données complexes...');
        ws.send(JSON.stringify({
            type: 'data',
            payload: {
                user: 'test_user',
                action: 'ping',
                data: [1, 2, 3, 4, 5]
            }
        }));
    }, 1000);
    
    // Fermeture après 5 secondes
    setTimeout(() => {
        console.log('👋 Fermeture de la connexion...');
        ws.close();
    }, 5000);
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        console.log('📨 Message reçu:');
        console.log(JSON.stringify(message, null, 2));
    } catch (error) {
        console.log('📨 Message brut:', data.toString());
    }
});

ws.on('close', (code, reason) => {
    console.log(`👋 Connexion fermée - Code: ${code}, Raison: ${reason || 'N/A'}`);
    process.exit(0);
});

ws.on('error', (error) => {
    console.error('❌ Erreur WebSocket:', error.message);
    process.exit(1);
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
    console.log('\n⚠️ Interruption détectée, fermeture...');
    ws.close();
});
