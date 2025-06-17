import { Model } from 'objection';

class Project extends Model {
  static get tableName() {
    return 'project';
  }

  static get idColumn() {
    return 'id';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name_project'],
      properties: {
        id: { type: 'integer' },
        name_project: { type: 'string', maxLength: 255 },
        history_action: { 
          type: 'string',
          description: 'JSON string containing action history for version control'
        },
        autorisation: { 
          type: 'string', 
          enum: ['private', 'public', 'restricted'],
          default: 'private'
        },
        user_id: { type: ['integer', 'null'] }
      }
    };
  }  static get relationMappings() {
    // Use dynamic imports to avoid circular dependencies
    return {
      users: {
        relation: Model.HasManyRelation,
        modelClass: () => require('./User.js'),
        join: {
          from: 'project.id',
          to: 'user.project_id'
        }
      },
      owner: {
        relation: Model.BelongsToOneRelation,
        modelClass: () => require('./User.js'),
        join: {
          from: 'project.user_id',
          to: 'user.id'
        }
      },
      atomes: {
        relation: Model.HasManyRelation,
        modelClass: () => require('./Atome.js'),
        join: {
          from: 'project.id',
          to: 'atome.project_id'
        }
      }
    };
  }

  // Method to add action to history
  addToHistory(action, userId, changes) {
    const history = this.getHistory();
    const historyEntry = {
      id: history.length + 1,
      timestamp: new Date().toISOString(),
      user_id: userId,
      action: action,
      changes: changes,
      version: history.length + 1
    };
    
    history.push(historyEntry);
    this.history_action = JSON.stringify(history);
    return historyEntry;
  }

  // Method to get parsed history
  getHistory() {
    try {
      return this.history_action ? JSON.parse(this.history_action) : [];
    } catch (error) {
      console.error('Error parsing history_action:', error);
      return [];
    }
  }

  // Method to get specific version
  getVersion(versionNumber) {
    const history = this.getHistory();
    return history.find(entry => entry.version === versionNumber);
  }

  // Method to rollback to version
  canRollback(targetVersion, userId) {
    const user = this.users?.find(u => u.id === userId);    if (!user || !user.hasPermission('edit')) {
      return false;
    }
    
    const history = this.getHistory();
    return history.some(entry => entry.version === targetVersion);
  }

  // Method to check if user has access based on authorization
  hasAccess(user) {
    if (this.autorisation === 'public') return true;
    if (this.autorisation === 'private') return this.user_id === user.id;
    if (this.autorisation === 'restricted') return user.hasPermission('admin');
    return false;
  }
}

export default Project;
