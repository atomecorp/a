import jwt from 'jsonwebtoken';
import User from '../../database/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Authentication middleware
export const authenticateToken = async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return reply.status(401).send({ 
        error: 'Access token required',
        code: 'MISSING_TOKEN'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.query().findById(decoded.id);

    if (!user) {
      return reply.status(401).send({ 
        error: 'Invalid token - user not found',
        code: 'INVALID_TOKEN'
      });
    }

    if (user.isLocked()) {
      return reply.status(423).send({ 
        error: 'Account is temporarily locked',
        code: 'ACCOUNT_LOCKED'
      });
    }

    request.user = user;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return reply.status(401).send({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    return reply.status(401).send({ 
      error: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }
};

// Authorization middleware factory
export const requirePermission = (level) => {
  return async (request, reply) => {
    if (!request.user.hasPermission(level)) {
      return reply.status(403).send({ 
        error: `${level} permission required`,
        code: 'INSUFFICIENT_PERMISSION'
      });
    }
  };
};

// Rate limiting configuration
export const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 5) => {
  const attempts = new Map();
  
  return async (request, reply) => {
    const key = request.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean up old attempts
    if (attempts.has(key)) {
      const userAttempts = attempts.get(key).filter(time => time > windowStart);
      attempts.set(key, userAttempts);
    }
    
    const currentAttempts = attempts.get(key) || [];
    
    if (currentAttempts.length >= max) {
      return reply.status(429).send({
        error: 'Too many attempts, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((currentAttempts[0] + windowMs - now) / 1000)
      });
    }
    
    currentAttempts.push(now);
    attempts.set(key, currentAttempts);
  };
};
