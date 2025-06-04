import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Mock user storage (since we're not using database yet)
const mockUsers = new Map();

function registerRoutes(fastify) {
  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    return { 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      service: 'Atome WebSocket Server'
    };
  });
  
  // Mock user registration (without database)
  fastify.post('/register', async (request, reply) => {
    try {
      const { username, email } = request.body;
      
      if (!username) {
        return reply.code(400).send({ error: 'Username required' });
      }
      
      // Check if user already exists (mock check)
      for (const [id, user] of mockUsers) {
        if (user.username === username) {
          return reply.code(409).send({ error: 'Username already exists' });
        }
      }
      
      // Create mock user
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const userData = {
        id: userId,
        username,
        email: email || '',
        created_at: new Date().toISOString()
      };
      
      mockUsers.set(userId, userData);
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: userData.id, username: userData.username },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      return {
        user: {
          id: userData.id,
          username: userData.username,
          email: userData.email
        },
        token
      };
      
    } catch (error) {
      console.error('Registration error:', error);
      return reply.code(500).send({ error: 'Registration failed' });
    }
  });
  
  // Mock user login
  fastify.post('/login', async (request, reply) => {
    try {
      const { username } = request.body;
      
      if (!username) {
        return reply.code(400).send({ error: 'Username required' });
      }
      
      // Find user by username (mock search)
      let foundUser = null;
      for (const [id, user] of mockUsers) {
        if (user.username === username) {
          foundUser = user;
          break;
        }
      }
      
      if (!foundUser) {
        return reply.code(401).send({ error: 'User not found' });
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: foundUser.id, username: foundUser.username },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      return {
        user: {
          id: foundUser.id,
          username: foundUser.username,
          email: foundUser.email
        },
        token
      };
      
    } catch (error) {
      console.error('Login error:', error);
      return reply.code(500).send({ error: 'Login failed' });
    }
  });
  
  // Get current user info (protected route)
  fastify.get('/user', {
    preHandler: async (request, reply) => {
      try {
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          return reply.code(401).send({ error: 'Token required' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        request.userId = decoded.userId;
      } catch (error) {
        return reply.code(401).send({ error: 'Invalid token' });
      }
    }
  }, async (request, reply) => {
    try {
      const user = mockUsers.get(request.userId);
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }
      
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to fetch user info' });
    }
  });
}

export { registerRoutes };