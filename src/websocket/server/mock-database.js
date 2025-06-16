// Simple Database Mock for WebSocket Testing
// This is a simplified version for testing - just returns success responses

export class DatabaseOperations {
  static async initialize() {
    console.log('✅ Mock Database initialized');
    return true;
  }

  static async healthCheck() {
    return { 
      healthy: true, 
      timestamp: new Date().toISOString() 
    };
  }

  static async close() {
    console.log('✅ Mock Database closed');
  }

  static async createDocument(data, userId) {
    return {
      success: true,
      data: {
        id: 'mock-doc-' + Date.now(),
        title: data.title,
        content: data.content || '',
        owner: userId,
        createdAt: new Date().toISOString()
      }
    };
  }

  static async getDocument(docId, userId) {
    return {
      success: true,
      data: {
        id: docId,
        title: 'Mock Document',
        content: 'This is a test document',
        owner: userId,
        createdAt: new Date().toISOString()
      }
    };
  }

  static async updateDocument(docId, data, userId) {
    return {
      success: true,
      data: {
        id: docId,
        title: data.title,
        content: data.content,
        owner: userId,
        updatedAt: new Date().toISOString()
      }
    };
  }

  static async deleteDocument(docId, userId) {
    return {
      success: true,
      data: {
        id: docId,
        deleted: true,
        deletedAt: new Date().toISOString()
      }
    };
  }

  static async backupData(userId) {
    return {
      success: true,
      data: {
        backupId: 'backup-' + Date.now(),
        userId: userId,
        createdAt: new Date().toISOString()
      }
    };
  }

  static async restoreData(backupId, userId) {
    return {
      success: true,
      data: {
        backupId: backupId,
        userId: userId,
        restoredAt: new Date().toISOString()
      }
    };
  }
}
