/**
 * 🔌 Simple WebSocket Client for Squirrel Framework
 * A basic Socket.IO client implementation for testing
 */

class SquirrelWebSocket {
    constructor(serverUrl = 'http://localhost:3000') {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.isConnected = false;
        this.isAuthenticated = false;
        this.callbacks = {
            onConnect: () => console.log('✅ WebSocket connected'),
            onDisconnect: () => console.log('❌ WebSocket disconnected'),
            onAuthenticated: (data) => console.log('🔐 Authenticated:', data),
            onError: (error) => console.error('💥 WebSocket error:', error),
            onMessage: (data) => console.log('📨 Message received:', data)
        };
    }

    // Load Socket.IO client library dynamically
    async loadSocketIO() {
        if (window.io) {
            return window.io;
        }

        try {
            // Try to load from CDN for simplicity
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
            script.crossOrigin = 'anonymous';
            
            return new Promise((resolve, reject) => {
                script.onload = () => {
                    console.log('📦 Socket.IO client loaded');
                    resolve(window.io);
                };
                script.onerror = () => {
                    reject(new Error('Failed to load Socket.IO client'));
                };
                document.head.appendChild(script);
            });
        } catch (error) {
            throw new Error('Could not load Socket.IO client: ' + error.message);
        }
    }

    // Connect to WebSocket server
    async connect() {
        try {
            const io = await this.loadSocketIO();
            
            this.socket = io(this.serverUrl, {
                autoConnect: false,
                reconnection: true,
                reconnectionAttempts: 3,
                reconnectionDelay: 1000
            });

            this.setupEventHandlers();
            this.socket.connect();
            
            console.log('🚀 Connecting to WebSocket server...');
            
        } catch (error) {
            console.error('Failed to connect:', error);
            this.callbacks.onError(error);
        }
    }

    // Setup event handlers
    setupEventHandlers() {
        this.socket.on('connect', () => {
            this.isConnected = true;
            console.log(`🔌 Connected to server with socket ID: ${this.socket.id}`);
            this.callbacks.onConnect();
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.isAuthenticated = false;
            console.log('🔌 Disconnected from server');
            this.callbacks.onDisconnect();
        });

        this.socket.on('connection_success', (data) => {
            this.isAuthenticated = true;
            console.log('✅ Authentication successful:', data);
            this.callbacks.onAuthenticated(data);
        });

        this.socket.on('connection_error', (error) => {
            console.error('❌ Connection/Auth error:', error);
            this.callbacks.onError(error);
        });

        this.socket.on('message_success', (data) => {
            console.log('✅ Message success:', data);
            this.callbacks.onMessage(data);
        });

        this.socket.on('message_error', (error) => {
            console.error('❌ Message error:', error);
            this.callbacks.onError(error);
        });

        this.socket.on('db_success', (data) => {
            console.log('✅ Database operation successful:', data);
            this.callbacks.onMessage(data);
        });

        this.socket.on('db_error', (error) => {
            console.error('❌ Database error:', error);
            this.callbacks.onError(error);
        });
    }

    // Authenticate with simple test credentials
    authenticate(userId = 'test-user', token = null) {
        if (!this.isConnected) {
            console.error('❌ Not connected to server');
            return;
        }

        // Generate a simple test token if none provided
        if (!token) {
            // For testing, create a simple token (in production, get this from your auth system)
            const testPayload = {
                userId: userId,
                username: userId,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
            };
            
            // For testing only - use a simple base64 encoded token
            // In production, use proper JWT from your auth server
            token = btoa(JSON.stringify(testPayload));
        }

        console.log('🔐 Attempting authentication...');
        this.socket.emit('connect_request', {
            auth: {
                id: userId,
                token: token
            }
        });
    }

    // Send a test message
    sendMessage(action, data = {}) {
        if (!this.isAuthenticated) {
            console.error('❌ Not authenticated');
            return;
        }

        console.log(`📤 Sending message: ${action}`, data);
        this.socket.emit('message', {
            action: action,
            data: data
        });
    }

    // Test ping
    ping() {
        this.sendMessage('ping');
    }

    // Disconnect
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.isAuthenticated = false;
        }
    }

    // Set callbacks
    on(event, callback) {
        if (this.callbacks.hasOwnProperty(`on${event.charAt(0).toUpperCase() + event.slice(1)}`)) {
            this.callbacks[`on${event.charAt(0).toUpperCase() + event.slice(1)}`] = callback;
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.SquirrelWebSocket = SquirrelWebSocket;
}

// Also support CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SquirrelWebSocket;
}
