// src/server/handlers/socketHandlers.js
import jwt from 'jsonwebtoken';
import { DatabaseOperations } from '../database.js';

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

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.log('JWT verification failed:', jwtError.message);
      
      if (jwtError.name === 'TokenExpiredError') {
        socket.emit('connection_error', {
          message: 'Token has expired'
        });
      } else {
        socket.emit('connection_error', {
          message: 'Invalid token'
        });
      }
      return;
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

    // Security validation - check for injection attempts
    if (typeof data.action !== 'string') {
      socket.emit('message_error', { 
        message: 'Invalid action type' 
      });
      return;
    }

    // Check for common injection patterns
    const injectionPatterns = [
      /'; DROP TABLE/i,
      /UNION SELECT/i,
      /<script>/i,
      /javascript:/i,
      /eval\(/i,
      /exec\(/i
    ];

    const checkForInjection = (value) => {
      if (typeof value === 'string') {
        return injectionPatterns.some(pattern => pattern.test(value));
      }
      if (typeof value === 'object' && value !== null) {
        return Object.values(value).some(checkForInjection);
      }
      return false;
    };

    if (checkForInjection(data)) {
      socket.emit('security_violation', {
        message: 'Potential injection attempt detected',
        code: 'INJECTION_DETECTED',
        timestamp: new Date().toISOString()
      });
      return;
    }

    console.log(`🎯 Processing action: ${data.action}`);
    
    // Route to appropriate handler based on action
    switch (data.action) {
      case 'create_document':
        await handleCreateDocument(data, socket, socketData);
        break;
        
      case 'get_document':
        await handleGetDocument(data, socket, socketData);
        break;
        
      case 'update_document':
        await handleUpdateDocument(data, socket, socketData);
        break;
        
      case 'delete_document':
        await handleDeleteDocument(data, socket, socketData);
        break;
        
      case 'backup_data':
        await handleBackupData(data, socket, socketData);
        break;
        
      case 'restore_data':
        await handleRestoreData(data, socket, socketData);
        break;
        
      case 'corrupt_data':
        await handleCorruptData(data, socket, socketData);
        break;

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

// Database operation handlers using real DatabaseOperations
async function handleCreateDocument(data, socket, socketData) {
  if (!data.data || !data.data.title) {
    socket.emit('db_error', { 
      message: 'Title required for document creation',
      code: 'MISSING_REQUIRED_FIELD'
    });
    return;
  }

  try {
    const result = await DatabaseOperations.createDocument(data.data, socketData.userId);
    
    if (result.success) {
      socket.emit('db_success', {
        action: 'create_document',
        success: true,
        data: result.data
      });
    } else {
      socket.emit('db_error', result.error);
    }
  } catch (error) {
    socket.emit('db_error', {
      message: 'Database operation failed',
      code: 'DATABASE_ERROR',
      details: error.message
    });
  }
}

async function handleGetDocument(data, socket, socketData) {
  if (!data.data || !data.data.doc_id) {
    socket.emit('db_error', { 
      message: 'Document ID required',
      code: 'MISSING_REQUIRED_FIELD'
    });
    return;
  }

  try {
    const result = await DatabaseOperations.getDocument(data.data.doc_id, socketData.userId);
    
    if (result.success) {
      socket.emit('db_success', {
        action: 'get_document',
        success: true,
        data: result.data
      });
    } else {
      socket.emit('db_error', result.error);
    }
  } catch (error) {
    socket.emit('db_error', {
      message: 'Database operation failed',
      code: 'DATABASE_ERROR',
      details: error.message
    });
  }
}

async function handleUpdateDocument(data, socket, socketData) {
  if (!data.data || !data.data.doc_id) {
    socket.emit('db_error', { 
      message: 'Document ID required for update',
      code: 'MISSING_REQUIRED_FIELD'
    });
    return;
  }

  try {
    const result = await DatabaseOperations.updateDocument(
      data.data.doc_id, 
      data.data, 
      socketData.userId
    );
    
    if (result.success) {
      socket.emit('db_success', {
        action: 'update_document',
        success: true,
        data: result.data
      });
    } else {
      socket.emit('db_error', result.error);
    }
  } catch (error) {
    socket.emit('db_error', {
      message: 'Database operation failed',
      code: 'DATABASE_ERROR',
      details: error.message
    });
  }
}

async function handleDeleteDocument(data, socket, socketData) {
  if (!data.data || !data.data.doc_id) {
    socket.emit('db_error', { 
      message: 'Document ID required for deletion',
      code: 'MISSING_REQUIRED_FIELD'
    });
    return;
  }

  try {
    const result = await DatabaseOperations.deleteDocument(data.data.doc_id, socketData.userId);
    
    if (result.success) {
      socket.emit('db_success', {
        action: 'delete_document',
        success: true,
        data: result.data
      });
    } else {
      socket.emit('db_error', result.error);
    }
  } catch (error) {
    socket.emit('db_error', {
      message: 'Database operation failed',
      code: 'DATABASE_ERROR',
      details: error.message
    });
  }
}

async function handleBackupData(data, socket, socketData) {
  try {
    const result = await DatabaseOperations.backupData(socketData.userId);
    
    if (result.success) {
      socket.emit('db_success', {
        action: 'backup_data',
        success: true,
        data: result.data
      });
    } else {
      socket.emit('db_error', result.error);
    }
  } catch (error) {
    socket.emit('db_error', {
      message: 'Backup operation failed',
      code: 'BACKUP_ERROR',
      details: error.message
    });
  }
}

async function handleRestoreData(data, socket, socketData) {
  if (!data.data || !data.data.backup_id) {
    socket.emit('db_error', { 
      message: 'Backup ID required for restore',
      code: 'MISSING_REQUIRED_FIELD'
    });
    return;
  }

  try {
    const result = await DatabaseOperations.restoreData(data.data.backup_id, socketData.userId);
    
    if (result.success) {
      socket.emit('db_success', {
        action: 'restore_data',
        success: true,
        data: result.data
      });
    } else {
      socket.emit('db_error', result.error);
    }
  } catch (error) {
    socket.emit('db_error', {
      message: 'Restore operation failed',
      code: 'RESTORE_ERROR',
      details: error.message
    });
  }
}

async function handleCorruptData(data, socket, socketData) {
  if (!data.data || !data.data.doc_id) {
    socket.emit('db_error', { 
      message: 'Document ID required',
      code: 'MISSING_REQUIRED_FIELD'
    });
    return;
  }

  try {
    const result = await DatabaseOperations.corruptDocument(data.data.doc_id, socketData.userId);
    
    if (result.success) {
      socket.emit('db_success', {
        action: 'corrupt_data',
        success: true,
        data: result.data
      });
    } else {
      socket.emit('db_error', result.error);
    }
  } catch (error) {
    socket.emit('db_error', {
      message: 'Corruption operation failed',
      code: 'CORRUPTION_ERROR',
      details: error.message
    });
  }
}

// Helper functions for backwards compatibility
function validateConnectionData(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  if (!data.auth || typeof data.auth !== 'object') {
    return false;
  }
  
  if (!data.auth.id || !data.auth.token) {
    return false;
  }
  
  return true;
}

function authenticateToken(auth) {
  try {
    const decoded = jwt.verify(auth.token, JWT_SECRET);
    
    if (decoded.userId !== auth.id) {
      return {
        success: false,
        message: 'Token user ID mismatch'
      };
    }
    
    return {
      success: true,
      decoded: decoded
    };
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return {
        success: false,
        message: 'Token has expired'
      };
    } else if (error.name === 'JsonWebTokenError') {
      return {
        success: false,
        message: 'Invalid token'
      };
    } else {
      return {
        success: false,
        message: 'Token verification failed'
      };
    }
  }
}

export { 
  connect, 
  handleMessage, 
  authenticatedSockets,
  validateConnectionData,
  authenticateToken
};