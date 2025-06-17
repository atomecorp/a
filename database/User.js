import { Model } from 'objection';

class User extends Model {
  static get tableName() {
    return 'user';
  }

  static get idColumn() {
    return 'id';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name', 'password'],
      properties: {
        id: { type: 'integer' },
        name: { type: 'string', maxLength: 255 },
        password: { type: 'string', maxLength: 255 },
        autorisation: { 
          type: 'string', 
          enum: ['read', 'edit', 'admin'],
          default: 'read'
        },
        project_id: { type: ['integer', 'null'] }
      }
    };
  }
  static get relationMappings() {
    // Use function factories to avoid circular dependencies
    return {
      project: {
        relation: Model.BelongsToOneRelation,
        modelClass: () => require('./Project.js'),
        join: {
          from: 'user.project_id',
          to: 'project.id'
        }
      },
      atomes: {
        relation: Model.HasManyRelation,
        modelClass: () => require('./Atome.js'),
        join: {
          from: 'user.id',
          to: 'atome.user_id'
        }
      }
    };
  }

  // Method to check authorization level
  hasPermission(requiredLevel) {
    const levels = { read: 1, edit: 2, admin: 3 };
    return levels[this.autorisation] >= levels[requiredLevel];
  }
  // Method to check if user can access project
  canAccessProject(project) {
    return this.project_id === project.id;
  }
}

export default User;
