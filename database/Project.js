import { EntitySchema } from 'typeorm';

export class Project {
  constructor(id, name_project, history_action, autorisation, user_id) {
    this.id = id;
    this.name_project = name_project;
    this.history_action = history_action;
    this.autorisation = autorisation;
    this.user_id = user_id;
  }

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

  getHistory() {
    try {
      return this.history_action ? JSON.parse(this.history_action) : [];
    } catch (error) {
      console.error('Error parsing history_action:', error);
      return [];
    }
  }

  getVersion(versionNumber) {
    const history = this.getHistory();
    return history.find(entry => entry.version === versionNumber);
  }

  canRollback(targetVersion, userId) {
    const user = this.users?.find(u => u.id === userId);
    if (!user || !user.hasPermission('edit')) {
      return false;
    }
    const history = this.getHistory();
    return history.some(entry => entry.version === targetVersion);
  }

  hasAccess(user) {
    if (this.autorisation === 'public') return true;
    if (this.autorisation === 'private') return this.user_id === user.id;
    if (this.autorisation === 'restricted') return user.hasPermission('admin');
    return false;
  }
}

export const ProjectEntity = new EntitySchema({
  name: 'Project',
  target: Project,
  tableName: 'project',
  columns: {
    id: {
      primary: true,
      type: 'int',
      generated: true,
    },
    name_project: {
      type: 'varchar',
      length: 255,
    },
    history_action: {
      type: 'text',
      nullable: true,
    },
    autorisation: {
      type: 'varchar',
      default: 'private',
    },
    user_id: {
      type: 'int',
      nullable: true,
    },
  },
  relations: {
    owner: {
      target: 'User',
      type: 'many-to-one',
      joinColumn: { name: 'user_id' },
      inverseSide: 'projects',
    },
    users: {
      target: 'User',
      type: 'one-to-many',
      inverseSide: 'project',
    },
    atomes: {
      target: 'Atome',
      type: 'one-to-many',
      inverseSide: 'project',
    },
  },
});
