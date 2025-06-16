module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // Force CommonJS for database models and tests
  testPathIgnorePatterns: ['/node_modules/'],
  moduleFileExtensions: ['js', 'json'],
  verbose: true
};
