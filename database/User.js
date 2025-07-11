import { Model } from 'objection';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

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
      required: ['email', 'password'],
      properties: {
        id: { type: 'integer' },
        name: { type: 'string', maxLength: 255 },
        email: { type: 'string', maxLength: 255 },
        phone: { type: ['string', 'null'], maxLength: 20 },
        password: { type: 'string', maxLength: 255 },
        autorisation: { 
          type: 'string', 
          enum: ['read', 'edit', 'admin'],
          default: 'read'
        },
        project_id: { type: ['integer', 'null'] },
        email_verified: { type: 'boolean', default: false },
        phone_verified: { type: 'boolean', default: false },
        reset_token: { type: ['string', 'null'] },
        reset_token_expires: { type: ['string', 'null'] },
        failed_login_attempts: { type: 'integer', default: 0 },
        locked_until: { type: ['string', 'null'] },
        last_login: { type: ['string', 'null'] },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
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

  // Hash password before saving
  async $beforeInsert(context) {
    await super.$beforeInsert(context);
    if (this.password) {
      this.password = await bcrypt.hash(this.password, 12);
    }
  }

  async $beforeUpdate(opt, context) {
    await super.$beforeUpdate(opt, context);
    if (this.password) {
      this.password = await bcrypt.hash(this.password, 12);
    }
  }

  // Hide sensitive data when converting to JSON
  $formatJson(json) {
    json = super.$formatJson(json);
    delete json.password;
    delete json.reset_token;
    delete json.failed_login_attempts;
    delete json.locked_until;
    return json;
  }

  // Password verification
  async verifyPassword(password) {
    return bcrypt.compare(password, this.password);
  }

  // Generate JWT token
  generateAuthToken() {
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    return jwt.sign(
      { 
        id: this.id, 
        email: this.email,
        autorisation: this.autorisation 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
  }

  // Generate password reset token
  generateResetToken() {
    const resetToken = Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 15);
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    
    this.reset_token = resetToken;
    this.reset_token_expires = expires.toISOString();
    
    return resetToken;
  }

  // Check if account is locked
  isLocked() {
    return this.locked_until && this.locked_until > new Date().toISOString();
  }

  // Increment failed login attempts
  async incrementFailedAttempts() {
    const maxAttempts = 5;
    const lockTime = 30 * 60 * 1000; // 30 minutes
    
    this.failed_login_attempts = (this.failed_login_attempts || 0) + 1;
    
    if (this.failed_login_attempts >= maxAttempts) {
      this.locked_until = new Date(Date.now() + lockTime).toISOString();
    }
    
    await this.$query().patch({
      failed_login_attempts: this.failed_login_attempts,
      locked_until: this.locked_until
    });
  }

  // Reset failed login attempts on successful login
  async resetFailedAttempts() {
    if (this.failed_login_attempts || this.locked_until) {
      await this.$query().patch({
        failed_login_attempts: 0,
        locked_until: null,
        last_login: new Date().toISOString()
      });
    }
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
