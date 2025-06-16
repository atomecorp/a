# 🔌 WebSocket Module

This directory contains a complete WebSocket implementation using Socket.IO for the Squirrel Framework.

## 📁 Directory Structure

```
websocket/
├── server/                 # WebSocket server files
│   ├── server.js          # Main WebSocket server
│   ├── handlers.js        # Socket event handlers
│   └── mock-database.js   # Mock database for testing
├── client/                # WebSocket client files
│   └── websocket-client.js # Browser WebSocket client
└── tests/                 # Test files and demos
    ├── websocket-test.html         # Full-featured test page
    ├── websocket-test-simple.html  # Simple test with inline client
    ├── minimal-websocket-test.html # Minimal test using Socket.IO directly
    └── basic-test.html             # Basic HTML/JS test
```

## 🚀 Quick Start

### 1. Start the WebSocket Server

```bash
# From the websocket/server directory
node server.js
```

The server will start on `http://localhost:3001` by default.

### 2. Open Test Pages

Start the Fastify HTTP server to serve the test pages:

```bash
# From the project root
node fastify-server.mjs
```

Then open any of the test pages in your browser:
- http://localhost:7001/websocket/tests/websocket-test.html
- http://localhost:7001/websocket/tests/websocket-test-simple.html
- http://localhost:7001/websocket/tests/minimal-websocket-test.html
- http://localhost:7001/websocket/tests/basic-test.html

## 📋 Features

### Server Features
- ✅ Socket.IO integration
- ✅ JWT-based authentication
- ✅ Message handling (ping/pong)
- ✅ User connection management
- ✅ Error handling
- ✅ Mock database for testing

### Client Features
- ✅ Dynamic Socket.IO loading
- ✅ Connection management
- ✅ Authentication with test tokens
- ✅ Event-based messaging
- ✅ Ping/pong testing
- ✅ Error handling and logging

### Test Pages
- **websocket-test.html**: Full-featured test with UI and our custom client
- **websocket-test-simple.html**: Simple test with inline WebSocket client
- **minimal-websocket-test.html**: Minimal test using Socket.IO directly
- **basic-test.html**: Basic HTML/JS functionality test

## 🔧 API Reference

### WebSocket Client (SquirrelWebSocket)

```javascript
// Create instance
const ws = new SquirrelWebSocket('http://localhost:3001');

// Setup event handlers
ws.on('connect', () => console.log('Connected'));
ws.on('authenticated', (data) => console.log('Authenticated:', data));
ws.on('message', (data) => console.log('Message:', data));
ws.on('error', (error) => console.log('Error:', error));

// Connect and authenticate
await ws.connect();
ws.authenticate('test-user');

// Send messages
ws.ping();
ws.send('message', { data: 'hello' });
```

### Server Events

- `connect_request`: Client authentication request
- `message`: General message handling
- `disconnect`: Client disconnection

### Client Events

- `connection_success`: Authentication successful
- `connection_error`: Authentication failed
- `message_success`: Message processed successfully
- `message_error`: Message processing failed

## 🧪 Testing

1. **Start the server**: `node websocket/server/server.js`
2. **Start HTTP server**: `python -m http.server 8000`
3. **Open test page**: Navigate to http://localhost:8000/websocket/tests/websocket-test.html
4. **Test sequence**:
   - Click "Connect" to establish WebSocket connection
   - Click "Authenticate" to test JWT authentication
   - Click "Ping Test" to send test messages
   - Monitor the log for all events

## 🔍 Troubleshooting

### Common Issues

1. **Connection failed**: Make sure the WebSocket server is running on port 3001
2. **Script loading errors**: Ensure you're serving the files through HTTP (not file://)
3. **Authentication errors**: Check the server logs for JWT token validation issues

### Server Logs

The server provides detailed logging for:
- Connection attempts
- Authentication requests
- Message processing
- Errors and warnings

### Client Logs

The test pages provide real-time logging for:
- Connection status
- Authentication results
- Message exchanges
- Error messages

## 🔧 Development

To modify or extend the WebSocket functionality:

1. **Server changes**: Edit files in `websocket/server/`
2. **Client changes**: Edit `websocket/client/websocket-client.js`
3. **Testing**: Add new test pages to `websocket/tests/`

## 📦 Dependencies

- **Socket.IO**: WebSocket implementation
- **jsonwebtoken**: JWT authentication (server)
- **cors**: Cross-origin resource sharing (server)

All dependencies are automatically loaded or can be installed via the main `package.json` file.
