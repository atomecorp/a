// src/server/database.js
import { Sequelize, DataTypes } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Sequelize with SQLite for Tauri
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../database.sqlite'),
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  define: {
    timestamps: true,
    underscored: true
  }
});

// Document Model
const Document = sequelize.define('Document', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(1000),
    allowNull: false,
    validate: {
      len: [1, 1000],
      notEmpty: true
    }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: ''
  },
  owner: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {}
  },
  is_corrupted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  corruption_type: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'documents',
  indexes: [
    {
      fields: ['owner']
    },
    {
      fields: ['title']
    }
  ]
});

// Backup Model
const Backup = sequelize.define('Backup', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  backup_data: {
    type: DataTypes.TEXT, // JSON string
    allowNull: false
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  records_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  backup_timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'backups',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['backup_timestamp']
    }
  ]
});

// Database Operations Class
class DatabaseOperations {
  
  static async initialize() {
    try {
      await sequelize.authenticate();
      console.log('Database connection established successfully.');
      
      // Sync models (create tables if they don't exist)
      await sequelize.sync({ alter: true });
      console.log('Database models synchronized.');
      
      return true;
    } catch (error) {
      console.error('Unable to connect to the database:', error);
      throw error;
    }
  }

  // Document Operations
  static async createDocument(data, userId) {
    try {
      const document = await Document.create({
        title: data.title,
        content: data.content || '',
        owner: userId,
        metadata: data.metadata || {}
      });
      
      return {
        success: true,
        data: document.toJSON()
      };
    } catch (error) {
      if (error.name === 'SequelizeValidationError') {
        return {
          success: false,
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: error.errors.map(e => e.message)
          }
        };
      }
      
      return {
        success: false,
        error: {
          message: 'Database write failed',
          code: 'WRITE_ERROR',
          details: error.message
        }
      };
    }
  }

  static async getDocument(docId, userId) {
    try {
      const document = await Document.findOne({
        where: {
          id: docId,
          owner: userId
        }
      });
      
      if (!document) {
        return {
          success: false,
          error: {
            message: 'Document not found',
            code: 'NOT_FOUND'
          }
        };
      }

      if (document.is_corrupted) {
        return {
          success: false,
          error: {
            message: 'Document data is corrupted',
            code: 'CORRUPTED_DATA'
          }
        };
      }
      
      return {
        success: true,
        data: document.toJSON()
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Database read failed',
          code: 'READ_ERROR',
          details: error.message
        }
      };
    }
  }

  static async updateDocument(docId, data, userId) {
    const transaction = await sequelize.transaction();
    
    try {
      const document = await Document.findOne({
        where: {
          id: docId,
          owner: userId
        },
        transaction
      });
      
      if (!document) {
        await transaction.rollback();
        return {
          success: false,
          error: {
            message: 'Document not found for update',
            code: 'NOT_FOUND'
          }
        };
      }

      // Update document
      await document.update({
        title: data.title || document.title,
        content: data.content !== undefined ? data.content : document.content,
        metadata: data.metadata || document.metadata
      }, { transaction });

      await transaction.commit();
      
      return {
        success: true,
        data: document.toJSON()
      };
    } catch (error) {
      await transaction.rollback();
      
      if (error.name === 'SequelizeValidationError') {
        return {
          success: false,
          error: {
            message: 'Invalid updated data',
            code: 'VALIDATION_ERROR',
            details: error.errors.map(e => e.message)
          }
        };
      }
      
      return {
        success: false,
        error: {
          message: 'Database update failed',
          code: 'UPDATE_ERROR',
          details: error.message
        }
      };
    }
  }

  static async deleteDocument(docId, userId) {
    try {
      const document = await Document.findOne({
        where: {
          id: docId,
          owner: userId
        }
      });
      
      if (!document) {
        return {
          success: false,
          error: {
            message: 'Document not found for deletion',
            code: 'NOT_FOUND'
          }
        };
      }

      await document.destroy();
      
      return {
        success: true,
        data: {
          doc_id: docId,
          deleted: true,
          deleted_at: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Database deletion failed',
          code: 'DELETE_ERROR',
          details: error.message
        }
      };
    }
  }

  // Backup Operations
  static async backupData(userId) {
    try {
      const documents = await Document.findAll({
        where: { owner: userId }
      });
      
      const backupData = JSON.stringify(documents.map(doc => doc.toJSON()));
      
      const backup = await Backup.create({
        backup_data: backupData,
        user_id: userId,
        records_count: documents.length
      });
      
      return {
        success: true,
        data: {
          backup_id: backup.id,
          timestamp: backup.backup_timestamp,
          records_count: backup.records_count
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Backup failed',
          code: 'BACKUP_ERROR',
          details: error.message
        }
      };
    }
  }

  static async restoreData(backupId, userId) {
    const transaction = await sequelize.transaction();
    
    try {
      const backup = await Backup.findOne({
        where: {
          id: backupId,
          user_id: userId
        }
      });
      
      if (!backup) {
        await transaction.rollback();
        return {
          success: false,
          error: {
            message: 'Backup not found',
            code: 'BACKUP_NOT_FOUND'
          }
        };
      }

      let backupData;
      try {
        backupData = JSON.parse(backup.backup_data);
      } catch (parseError) {
        await transaction.rollback();
        return {
          success: false,
          error: {
            message: 'Backup data is corrupted',
            code: 'CORRUPTED_BACKUP'
          }
        };
      }

      // Clear existing documents for user
      await Document.destroy({
        where: { owner: userId },
        transaction
      });

      // Restore documents
      for (const docData of backupData) {
        await Document.create({
          id: docData.id,
          title: docData.title,
          content: docData.content,
          owner: docData.owner,
          metadata: docData.metadata || {}
        }, { transaction });
      }

      await transaction.commit();
      
      return {
        success: true,
        data: {
          backup_id: backupId,
          restored_at: new Date().toISOString(),
          records_restored: backupData.length
        }
      };
    } catch (error) {
      await transaction.rollback();
      return {
        success: false,
        error: {
          message: 'Restore failed',
          code: 'RESTORE_ERROR',
          details: error.message
        }
      };
    }
  }

  // Test/Debug Operations
  static async corruptDocument(docId, userId) {
    try {
      const document = await Document.findOne({
        where: {
          id: docId,
          owner: userId
        }
      });
      
      if (!document) {
        return {
          success: false,
          error: {
            message: 'Document not found',
            code: 'NOT_FOUND'
          }
        };
      }

      await document.update({
        is_corrupted: true,
        corruption_type: 'INTENTIONAL_TEST_CORRUPTION'
      });
      
      return {
        success: true,
        data: {
          doc_id: docId,
          corrupted: true,
          corrupted_at: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Corruption simulation failed',
          code: 'CORRUPTION_ERROR',
          details: error.message
        }
      };
    }
  }

  // Database health check
  static async healthCheck() {
    try {
      await sequelize.authenticate();
      return { healthy: true, timestamp: new Date().toISOString() };
    } catch (error) {
      return { healthy: false, error: error.message, timestamp: new Date().toISOString() };
    }
  }

  // Close database connection
  static async close() {
    await sequelize.close();
  }
}

export {
  sequelize,
  Document,
  Backup,
  DatabaseOperations
};