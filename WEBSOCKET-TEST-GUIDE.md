# 🔌 WebSocket Test Guide

## Quick Start

Your WebSocket implementation is now complete and ready for testing!

### 1. Start the WebSocket Server

```bash
# Using npm script
npm run start:websocket

# Or directly
node src/server/server.js

# Or using the batch file (Windows)
start-websocket-test.bat
```

The server will start on **http://localhost:3001**

### 2. Open the Test Page

Open `websocket-test.html` in your browser or click the link above.

### 3. Test the Connection

1. **Connect**: Click the "🔌 Connect" button
2. **Authenticate**: Click the "🔐 Authenticate" button  
3. **Test**: Click the "🏓 Ping Test" button
4. **Disconnect**: Click the "❌ Disconnect" button when done

## What's Working

✅ **WebSocket Server** - Fastify + Socket.IO  
✅ **JWT Authentication** - With test token support  
✅ **Message Routing** - Action-based commands  
✅ **Database Integration** - SQLite with Sequelize  
✅ **Security Features** - Injection protection  
✅ **Client Library** - Simple WebSocket wrapper  
✅ **Test Interface** - HTML test page  

## Available WebSocket Actions

- `ping` - Simple connectivity test
- `create_document` - Create a new document
- `get_document` - Retrieve a document
- `update_document` - Update a document  
- `delete_document` - Delete a document
- `backup_data` - Backup user data
- `restore_data` - Restore from backup

## Test Messages

Once authenticated, you can send test messages:

```javascript
// Ping test
ws.sendMessage('ping');

// Create document
ws.sendMessage('create_document', {
  title: 'Test Document',
  content: 'Hello WebSocket!'
});
```

## Architecture

```
Browser (websocket-test.html)
    ↓ Socket.IO Client
WebSocket Server (src/server/server.js)
    ↓ Fastify + Socket.IO
Socket Handlers (src/server/handlers/socketHandlers.js)
    ↓ JWT Auth + Message Routing  
Database (src/server/database.js)
    ↓ Sequelize + SQLite
```

## Files Created

- `src/js/websocket-client.js` - Client WebSocket wrapper
- `websocket-test.html` - Test interface
- `start-websocket-test.bat` - Windows startup script
- `start-websocket-test.sh` - Unix startup script

## Next Steps

1. **Integrate into your app** - Import `SquirrelWebSocket` class
2. **Add real authentication** - Replace test tokens with JWT
3. **Build UI features** - Connect to your components
4. **Add more actions** - Extend the message handlers

## Troubleshooting

- **Port in use**: Server uses port 3001 (configurable via PORT env var)
- **CORS issues**: Server has CORS enabled for all origins
- **Auth fails**: Using test tokens - check console for JWT errors
- **Connection fails**: Ensure server is running and port is accessible

🎉 **Your WebSocket system is ready!**
