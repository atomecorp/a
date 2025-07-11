import User from '../../database/User.js';
import emailService from '../services/emailService.js';
import { authenticateToken, createRateLimiter } from '../middleware/auth.js';

// Rate limiters
const authRateLimit = createRateLimiter(15 * 60 * 1000, 5); // 5 attempts per 15 minutes
const resetRateLimit = createRateLimiter(60 * 60 * 1000, 3); // 3 reset requests per hour

export default function authRoutes(fastify, options) {
  
  // Apply rate limiting to auth routes
  fastify.addHook('preHandler', async (request, reply) => {
    const protectedRoutes = ['/login', '/register', '/request-reset'];
    if (protectedRoutes.includes(request.url.split('?')[0])) {
      await authRateLimit(request, reply);
    }
    if (request.url.startsWith('/request-reset')) {
      await resetRateLimit(request, reply);
    }
  });

  // Input validation schemas
  const registerSchema = {
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 255 },
        email: { type: 'string', format: 'email', maxLength: 255 },
        phone: { type: 'string', pattern: '^[+]?[0-9\\s\\-\\(\\)]+$', maxLength: 20 },
        password: { type: 'string', minLength: 8, maxLength: 255 }
      },
      additionalProperties: false
    }
  };

  const loginSchema = {
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 1 }
      },
      additionalProperties: false
    }
  };

  // Register new user
  fastify.post('/register', { schema: registerSchema }, async (request, reply) => {
    try {
      const { name, email, phone, password } = request.body;

      // Check if user already exists
      const existingUserQuery = User.query().where('email', email);
      
      if (phone) {
        existingUserQuery.orWhere('phone', phone);
      }
      
      const existingUser = await existingUserQuery.first();

      if (existingUser) {
        return reply.status(409).send({
          error: 'User already exists with this email or phone number',
          code: 'USER_EXISTS'
        });
      }

      // Create new user
      const user = await User.query().insert({
        name: name || '',
        email: email.toLowerCase(),
        phone: phone || null,
        password, // Will be hashed by the model's $beforeInsert hook
        autorisation: 'read'
      });

      // Generate auth token
      const token = user.generateAuthToken();

      // Send welcome email (non-blocking)
      emailService.sendWelcomeEmail(user.email, user.name)
        .catch(error => console.error('Failed to send welcome email:', error));

      reply.status(201).send({
        message: 'Account created successfully',
        user: user,
        token,
        expires: '24h'
      });

    } catch (error) {
      console.error('Registration error:', error);
      
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return reply.status(409).send({
          error: 'Email or phone already registered',
          code: 'DUPLICATE_ENTRY'
        });
      }

      reply.status(500).send({
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR'
      });
    }
  });

  // Login user
  fastify.post('/login', { schema: loginSchema }, async (request, reply) => {
    try {
      const { email, password } = request.body;

      // Find user by email
      const user = await User.query()
        .where('email', email.toLowerCase())
        .first();

      if (!user) {
        return reply.status(401).send({
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Check if account is locked
      if (user.isLocked()) {
        return reply.status(423).send({
          error: 'Account temporarily locked due to multiple failed attempts',
          code: 'ACCOUNT_LOCKED'
        });
      }

      // Verify password
      const isValidPassword = await user.verifyPassword(password);

      if (!isValidPassword) {
        await user.incrementFailedAttempts();
        return reply.status(401).send({
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Reset failed attempts on successful login
      await user.resetFailedAttempts();

      // Generate auth token
      const token = user.generateAuthToken();

      reply.send({
        message: 'Login successful',
        user: user,
        token,
        expires: '24h'
      });

    } catch (error) {
      console.error('Login error:', error);
      reply.status(500).send({
        error: 'Login failed',
        code: 'LOGIN_ERROR'
      });
    }
  });

  // Request password reset
  fastify.post('/request-reset', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { email } = request.body;

      const user = await User.query()
        .where('email', email.toLowerCase())
        .first();

      // Always return success to prevent email enumeration
      const successMessage = {
        message: 'If an account exists with this email, a password reset link has been sent',
        code: 'RESET_SENT'
      };

      if (!user) {
        return reply.send(successMessage);
      }

      // Generate reset token
      const resetToken = user.generateResetToken();
      await user.$query().patch({
        reset_token: user.reset_token,
        reset_token_expires: user.reset_token_expires
      });

      // Send reset email
      await emailService.sendPasswordResetEmail(user.email, resetToken, user.name);

      reply.send(successMessage);

    } catch (error) {
      console.error('Password reset request error:', error);
      reply.status(500).send({
        error: 'Failed to process password reset request',
        code: 'RESET_REQUEST_ERROR'
      });
    }
  });

  // Reset password with token
  fastify.post('/reset/:token', {
    schema: {
      params: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 10 }
        }
      },
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string', minLength: 8, maxLength: 255 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { token } = request.params;
      const { password } = request.body;

      const user = await User.query()
        .where('reset_token', token)
        .where('reset_token_expires', '>', new Date().toISOString())
        .first();

      if (!user) {
        return reply.status(400).send({
          error: 'Invalid or expired reset token',
          code: 'INVALID_RESET_TOKEN'
        });
      }

      // Update password and clear reset token
      await user.$query().patch({
        password, // Will be hashed by $beforeUpdate hook
        reset_token: null,
        reset_token_expires: null,
        failed_login_attempts: 0,
        locked_until: null
      });

      reply.send({
        message: 'Password reset successfully',
        code: 'PASSWORD_RESET_SUCCESS'
      });

    } catch (error) {
      console.error('Password reset error:', error);
      reply.status(500).send({
        error: 'Failed to reset password',
        code: 'PASSWORD_RESET_ERROR'
      });
    }
  });

  // Get current user info (protected route)
  fastify.get('/me', { preHandler: authenticateToken }, async (request, reply) => {
    reply.send({
      user: request.user
    });
  });

  // Update user account (protected route)
  fastify.patch('/update', { 
    preHandler: authenticateToken,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 255 },
          email: { type: 'string', format: 'email', maxLength: 255 },
          phone: { type: 'string', pattern: '^[+]?[0-9\\s\\-\\(\\)]+$', maxLength: 20 },
          password: { type: 'string', minLength: 8, maxLength: 255 }
        },
        additionalProperties: false,
        minProperties: 1
      }
    }
  }, async (request, reply) => {
    try {
      const updates = request.body;
      const user = request.user;

      // If email is being updated, check for duplicates
      if (updates.email && updates.email.toLowerCase() !== user.email) {
        const existingUser = await User.query()
          .where('email', updates.email.toLowerCase())
          .whereNot('id', user.id)
          .first();

        if (existingUser) {
          return reply.status(409).send({
            error: 'Email already in use by another account',
            code: 'EMAIL_IN_USE'
          });
        }
      }

      // Update user
      const updatedUser = await user.$query().patchAndFetch(updates);

      reply.send({
        message: 'Account updated successfully',
        user: updatedUser
      });

    } catch (error) {
      console.error('Account update error:', error);
      reply.status(500).send({
        error: 'Failed to update account',
        code: 'UPDATE_ERROR'
      });
    }
  });

  // Delete user account (protected route)
  fastify.delete('/delete', { preHandler: authenticateToken }, async (request, reply) => {
    try {
      const user = request.user;

      // Delete user account
      await user.$query().delete();

      reply.send({
        message: 'Account deleted successfully',
        code: 'ACCOUNT_DELETED'
      });

    } catch (error) {
      console.error('Account deletion error:', error);
      reply.status(500).send({
        error: 'Failed to delete account',
        code: 'DELETE_ERROR'
      });
    }
  });

}
