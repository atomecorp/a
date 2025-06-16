// WebSocket Socket Handlers
import jwt from 'jsonwebtoken';
import { DatabaseOperations } from './database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const authenticatedSockets = new Map();

// Authentication handler
function connect(data, socket) {
  try {
    console.log(`🔐 Connection attempt from socket ${socket.id}:`, data);
    
    // Validate connection data structure
    if (!data || !data.auth || !data.auth.id || !data.auth.token) {
      console.log('Invalid connection data structure');
      socket.emit('connection_error', {
        message: 'Invalid connection data structure - auth.id and auth.token required'
      });
      return;
    }

    const { id: userId, token } = data.auth;

    // Verify token (JWT or test token)
    let decoded;
    try {
      // First try JWT verification
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.log('JWT verification failed, trying test token format...');
      
      // For testing: try to decode base64 test token
      try {
        const testTokenData = JSON.parse(atob(token));
        if (testTokenData.userId && testTokenData.username) {
          decoded = testTokenData;
          console.log('✅ Test token accepted for development');
        } else {
          throw new Error('Invalid test token format');
        }
      } catch (testError) {
        console.log('Test token verification also failed:', testError.message);
        
        if (jwtError.name === 'TokenExpiredError') {
          socket.emit('connection_error', {
            message: 'Token has expired'
          });
        } else {
          socket.emit('connection_error', {
            message: 'Invalid token - neither JWT nor test token format'
          });
        }
        return;
      }
    }

    // Verify user ID matches token
    if (decoded.userId !== userId) {
      console.log('Token user ID mismatch');
      socket.emit('connection_error', {
        message: 'Token user ID mismatch'
      });
      return;
    }

    // Store authenticated socket
    authenticatedSockets.set(socket.id, {
      userId: decoded.userId,
      username: decoded.username,
      authenticatedAt: new Date().toISOString()
    });

    console.log(`✅ Socket ${socket.id} authenticated for user ${decoded.userId}`);
    
    socket.emit('connection_success', {
      message: 'Successfully authenticated',
      userId: decoded.userId,
      socketId: socket.id
    });

    // Handle disconnection cleanup
    socket.on('disconnect', () => {
      authenticatedSockets.delete(socket.id);
      console.log(`🔌 Socket ${socket.id} disconnected and cleaned up`);
    });

  } catch (error) {
    console.error('❌ Connection error:', error);
    socket.emit('connection_error', {
      message: 'Connection failed'
    });
  }
}

// Enhanced message handler with database operations
async function handleMessage(data, socket) {
  try {
    console.log(`📨 Processing message from socket ${socket.id}:`, data);

    // Validate message structure
    if (!data || !data.action) {
      socket.emit('message_error', { 
        message: 'Invalid message format - action required' 
      });
      return;
    }

    // Check if socket is authenticated
    const socketData = authenticatedSockets.get(socket.id);
    if (!socketData) {
      socket.emit('message_error', { 
        message: 'Socket not authenticated' 
      });
      return;
    }

    console.log(`🎯 Processing action: ${data.action}`);
    
    // Route to appropriate handler based on action
    switch (data.action) {
      case 'ping':
        socket.emit('message_success', {
          action: 'ping',
          success: true,
          data: { 
            message: 'pong', 
            timestamp: new Date().toISOString(),
            userId: socketData.userId
          }
        });
        break;
        
      default:
        socket.emit('message_error', { 
          message: `Unknown action: ${data.action}` 
        });
    }
  } catch (error) {
    console.error('❌ Message handling error:', error);
    socket.emit('message_error', { 
      message: 'Message processing failed',
      error: error.message 
    });
  }
}

export { 
  connect, 
  handleMessage, 
  authenticatedSockets
};
