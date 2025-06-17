import { Model } from 'objection';

class Atome extends Model {
  static get tableName() {
    return 'atome';
  }

  static get idColumn() {
    return 'id';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['user_id', 'project_id', 'name_project'],
      properties: {
        id: { type: 'integer' },
        user_id: { type: 'integer' },
        project_id: { type: 'integer' },
        name_project: { type: 'string', maxLength: 255 }
      }
    };
  }
  static get relationMappings() {
    // Use function factories to avoid circular dependencies
    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: () => require('./User.js'),
        join: {
          from: 'atome.user_id',
          to: 'user.id'
        }
      },
      project: {
        relation: Model.BelongsToOneRelation,
        modelClass: () => require('./Project.js'),
        join: {
          from: 'atome.project_id',
          to: 'project.id'
        }
      }
    };
  }

  // Method to check if user can use this atome
  canBeUsedBy(user) {
    return this.user_id === user.id || user.hasPermission('admin');
  }
  // Method to check if atome belongs to project
  belongsToProject(projectId) {
    return this.project_id === projectId;
  }
}

export default Atome;
