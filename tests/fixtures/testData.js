import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const testUsers = {
  validUser: {
    id: 'test_user_123',
    username: 'testuser',
    email: 'test@example.com'
  },
  invalidUser: {
    id: 'invalid_user_456',
    username: 'invaliduser'
  }
};

const tokens = {
  valid: jwt.sign(
    { userId: testUsers.validUser.id, username: testUsers.validUser.username },
    JWT_SECRET,
    { expiresIn: '1h' }
  ),
  expired: jwt.sign(
    { userId: testUsers.validUser.id, username: testUsers.validUser.username },
    JWT_SECRET,
    { expiresIn: '-1h' }
  ),
  invalidFormat: 'invalid.jwt.token.format',
  wrongUserId: jwt.sign(
    { userId: 'wrong_user_789', username: testUsers.validUser.username },
    JWT_SECRET,
    { expiresIn: '1h' }
  )
};

const connectionData = {
  valid: {
    auth: {
      id: testUsers.validUser.id,
      token: tokens.valid
    }
  },
  withoutToken: {
    auth: {
      id: testUsers.validUser.id
      // token missing
    }
  },
  withoutAuth: {
    // auth object missing
    data: { some: 'data' }
  },
  invalidId: {
    auth: {
      id: testUsers.invalidUser.id,
      token: tokens.valid // Token for different user
    }
  },
  expiredToken: {
    auth: {
      id: testUsers.validUser.id,
      token: tokens.expired
    }
  },
  invalidToken: {
    auth: {
      id: testUsers.validUser.id,
      token: tokens.invalidFormat
    }
  },
  wrongUserIdInToken: {
    auth: {
      id: testUsers.validUser.id,
      token: tokens.wrongUserId
    }
  }
};

export {
  testUsers,
  tokens,
  connectionData,
  JWT_SECRET
};