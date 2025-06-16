# 🧪 Jest Testing Guide for Thermal App Database

This guide explains how to set up and run Jest tests for your thermal application database using Objection.js ORM.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Project Structure](#project-structure)
3. [Installation & Setup](#installation--setup)
4. [Running Tests](#running-tests)
5. [Understanding the Tests](#understanding-the-tests)
6. [Creating New Tests](#creating-new-tests)
7. [Troubleshooting](#troubleshooting)

## 🚀 Quick Start

```bash
# Install dependencies (if not already done)
npm install

# Run all tests
npm test

# Run tests in watch mode (automatically re-run on changes)
npm test:watch

# Run tests with coverage report
npm test:coverage
```

## 📁 Project Structure

```
your-project/
├── jest.config.cjs          # Jest configuration file
├── babel.config.cjs         # Babel configuration for ES6 support
├── package.json             # Contains test scripts
├── src/
│   └── database/           # Database models
│       ├── User.js         # User model with authorization
│       ├── Project.js      # Project model with history tracking
│       ├── Atome.js        # Atome model for thermal components
│       └── db.js           # Database configuration
├── tests/
│   ├── setup.js            # Test setup and database configuration
│   ├── database.test.js    # Main database schema tests
│   └── thermal-integration.test.js  # Integration example
└── testing-guide/          # This documentation folder
    ├── README.md           # This file
    ├── examples/           # Example test files
    └── scripts/            # Utility scripts
```

## 🔧 Installation & Setup

### 1. Dependencies

The following packages are required for testing:

```json
{
  "devDependencies": {
    "jest": "^29.0.0",
    "@babel/core": "^7.27.4",
    "@babel/preset-env": "^7.27.2",
    "babel-jest": "^29.0.0",
    "objection": "latest",
    "knex": "latest",
    "sqlite3": "latest"
  }
}
```

### 2. Configuration Files

**jest.config.cjs** (CommonJS format for ES6 project):
```javascript
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleFileExtensions: ['js', 'json'],
  verbose: true
};
```

**babel.config.cjs**:
```javascript
module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: 'current'
      }
    }]
  ]
};
```

### 3. Package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "test": "jest --config jest.config.cjs",
    "test:watch": "jest --config jest.config.cjs --watch",
    "test:coverage": "jest --config jest.config.cjs --coverage"
  }
}
```

## 🏃‍♂️ Running Tests

### Basic Commands

```bash
# Run all tests once
npm test

# Run specific test file
npm test database.test.js

# Run tests in watch mode (re-run on file changes)
npm test:watch

# Run tests with coverage report
npm test:coverage

# Run tests with verbose output
npm test -- --verbose

# Run tests matching a pattern
npm test -- --testNamePattern="USER"
```

### Watch Mode

Watch mode is particularly useful during development:

```bash
npm test:watch
```

This will:
- Re-run tests automatically when files change
- Show only failed tests after the first run
- Allow you to filter tests by pattern
- Press `a` to run all tests
- Press `f` to run only failed tests
- Press `q` to quit

## 🔍 Understanding the Tests

### Test Categories

Our test suite covers these areas:

1. **Model Validation Tests**
   - User creation and authorization levels
   - Project creation with history tracking
   - Atome component validation

2. **Relationship Tests**
   - Multiple users per project
   - Project-atome associations
   - Access control across relationships

3. **Business Logic Tests**
   - Authorization system (read/edit/admin)
   - History tracking for compliance
   - Version control and rollback

4. **Integration Tests**
   - Complete thermal monitoring workflow
   - Real-world scenarios

### Example Test Structure

```javascript
describe('USER Model Tests', () => {
  test('should create user with valid data', async () => {
    const userData = {
      name: 'John Doe',
      password: 'hashed_password_123',
      autorisation: 'edit'
    };

    const user = await User.query().insert(userData);
    
    expect(user.id).toBeDefined();
    expect(user.name).toBe('John Doe');
    expect(user.autorisation).toBe('edit');
  });
});
```

## ✏️ Creating New Tests

### 1. Basic Test Template

```javascript
const { User, Project, Atome } = require('./setup');

describe('Your Feature Tests', () => {
  test('should do something specific', async () => {
    // Arrange - Set up test data
    const testData = { /* your test data */ };
    
    // Act - Perform the action
    const result = await SomeModel.query().insert(testData);
    
    // Assert - Check the results
    expect(result.someProperty).toBe(expectedValue);
  });
});
```

### 2. Testing Database Operations

```javascript
// CREATE operation
test('should create record', async () => {
  const data = { name: 'Test Name', /* other fields */ };
  const record = await Model.query().insert(data);
  expect(record.id).toBeDefined();
});

// READ operation
test('should find record', async () => {
  const record = await Model.query().findById(1);
  expect(record).toBeDefined();
});

// UPDATE operation
test('should update record', async () => {
  const updated = await Model.query()
    .patchAndFetchById(1, { name: 'New Name' });
  expect(updated.name).toBe('New Name');
});

// DELETE operation
test('should delete record', async () => {
  await Model.query().deleteById(1);
  const deleted = await Model.query().findById(1);
  expect(deleted).toBeUndefined();
});
```

### 3. Testing Relationships

```javascript
test('should handle relationships', async () => {
  // Create parent record
  const project = await Project.query().insert({
    name_project: 'Test Project'
  });
  
  // Create child record with relationship
  const user = await User.query().insert({
    name: 'Test User',
    password: 'test',
    project_id: project.id
  });
  
  // Test the relationship
  const projectWithUsers = await Project.query()
    .findById(project.id)
    .withGraphFetched('users');
    
  expect(projectWithUsers.users).toHaveLength(1);
  expect(projectWithUsers.users[0].name).toBe('Test User');
});
```

### 4. Testing Business Logic

```javascript
test('should validate authorization levels', async () => {
  const adminUser = await User.query().insert({
    name: 'Admin',
    password: 'admin',
    autorisation: 'admin'
  });
  
  const readUser = await User.query().insert({
    name: 'Reader',
    password: 'reader', 
    autorisation: 'read'
  });
  
  expect(adminUser.hasPermission('admin')).toBe(true);
  expect(readUser.hasPermission('admin')).toBe(false);
  expect(readUser.hasPermission('read')).toBe(true);
});
```

## 🐛 Troubleshooting

### Common Issues

1. **"module is not defined" Error**
   - Make sure you're using `.cjs` extensions for config files
   - Your project is ES6 but Jest needs CommonJS configs

2. **"Your test suite must contain at least one test"**
   - Check that your test files have `describe()` and `test()` blocks
   - Verify file paths in Jest configuration

3. **Database Connection Issues**
   - Tests use in-memory SQLite, no external database needed
   - Check that `setup.js` is properly configured

4. **Import/Export Issues**
   - Database models use CommonJS (`module.exports`)
   - Test files use CommonJS (`require()`)
   - Main app can still use ES6 modules

### Debug Commands

```bash
# Run tests with debug output
npm test -- --verbose --no-cache

# Run specific test with detailed output
npm test -- --testNamePattern="specific test name" --verbose

# Clear Jest cache
npx jest --clearCache
```

### Environment Variables

You can set environment variables for testing:

```bash
# Windows PowerShell
$env:NODE_ENV="test"; npm test

# Add to package.json for cross-platform
"test": "cross-env NODE_ENV=test jest --config jest.config.cjs"
```

## 📊 Test Coverage

Generate coverage reports to see how much of your code is tested:

```bash
npm test:coverage
```

This creates a `coverage/` folder with:
- HTML report (open `coverage/lcov-report/index.html`)
- Text summary in terminal
- Machine-readable formats for CI/CD

### Coverage Goals

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 80%
- **Lines**: > 80%

## 🎯 Best Practices

1. **Test Naming**
   - Use descriptive test names: "should create user with valid data"
   - Group related tests with `describe()` blocks

2. **Test Organization**
   - One test file per model/feature
   - Keep integration tests separate
   - Use setup/teardown appropriately

3. **Data Management**
   - Use fresh test data for each test
   - Clean up after each test (done automatically in setup.js)
   - Don't depend on test execution order

4. **Assertions**
   - Test one thing per test
   - Use specific matchers (`toBe`, `toEqual`, `toHaveLength`)
   - Test both success and error cases

5. **Async Testing**
   - Always use `async/await` for database operations
   - Handle promise rejections properly
   - Test timeout scenarios when needed

## 🔄 Continuous Integration

For CI/CD pipelines, add this to your workflow:

```yaml
# .github/workflows/test.yml
- name: Run Tests
  run: |
    npm install
    npm test
    npm run test:coverage
```

## 📝 Next Steps

1. **Add More Test Cases**
   - Edge cases and error conditions
   - Performance tests for large datasets
   - Security tests for authorization

2. **Integration with Your App**
   - Test API endpoints that use these models
   - Test UI components that interact with database
   - End-to-end tests with Playwright

3. **Database Migrations**
   - Test migration scripts
   - Test data integrity during schema changes
   - Test rollback procedures

---

Happy Testing! 🚀

For questions or issues, check the troubleshooting section or create an issue in your project repository.
