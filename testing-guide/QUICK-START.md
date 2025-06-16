# 🚀 Quick Start Guide

This is a condensed guide to get you testing quickly!

## ⚡ Super Quick Start (30 seconds)

```bash
# 1. Run all tests
npm test

# 2. Run tests in watch mode (recommended for development)
npm test:watch

# 3. Generate coverage report
npm test:coverage
```

## 📋 Essential Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Run all tests once |
| `npm test:watch` | Run tests continuously (re-run on file changes) |
| `npm test:coverage` | Generate coverage report |
| `npm test database.test.js` | Run specific test file |
| `npm test -- --testNamePattern="USER"` | Run tests matching pattern |

## 🗂️ File Structure

```
your-project/
├── tests/
│   ├── setup.js                    # Test configuration
│   ├── database.test.js            # Main database tests ✅
│   └── thermal-integration.test.js # Integration example ✅
├── testing-guide/
│   ├── README.md                   # Complete guide 📖
│   ├── examples/                   # Copy these for new tests
│   │   ├── basic-model-tests.js    # Template for CRUD tests
│   │   ├── advanced-testing-patterns.js # Advanced techniques
│   │   └── thermal-specific-tests.js # Domain-specific examples
│   └── scripts/                    # Utility scripts
│       ├── test-runner.js          # Enhanced test runner
│       └── database-setup.js       # Database utilities
└── src/database/                   # Your Objection.js models ✅
    ├── User.js                     # User model with authorization
    ├── Project.js                  # Project with history tracking
    ├── Atome.js                    # Thermal components
    └── db.js                       # Database configuration
```

## 🧪 Test Categories

### 1. **Basic Database Tests** (23 tests ✅)
- User creation and authorization
- Project history tracking  
- Atome relationships
- Permission validation

### 2. **Integration Tests**
- Complete thermal monitoring workflow
- Real-world scenarios

### 3. **Example Tests** (learn from these)
- Basic CRUD patterns
- Advanced testing techniques
- Thermal-specific workflows

## 🎯 Common Testing Patterns

### Create a simple test:
```javascript
test('should create user with valid data', async () => {
  const user = await User.query().insert({
    name: 'Test User',
    password: 'password',
    autorisation: 'read'
  });
  
  expect(user.id).toBeDefined();
  expect(user.name).toBe('Test User');
});
```

### Test relationships:
```javascript
test('should handle user-project relationships', async () => {
  const project = await Project.query().insert({
    name_project: 'Test Project'
  });
  
  const user = await User.query().insert({
    name: 'Test User',
    password: 'password',
    project_id: project.id
  });
  
  const projectWithUsers = await Project.query()
    .findById(project.id)
    .withGraphFetched('users');
    
  expect(projectWithUsers.users).toHaveLength(1);
});
```

### Test business logic:
```javascript
test('should validate authorization levels', async () => {
  const admin = await User.query().insert({
    name: 'Admin',
    autorisation: 'admin'
  });
  
  expect(admin.hasPermission('admin')).toBe(true);
  expect(admin.hasPermission('read')).toBe(true);
});
```

## 🚨 Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| "module is not defined" | Config files need `.cjs` extension |
| "Cannot find module" | Run `npm install` |
| Tests not running | Check file paths in `jest.config.cjs` |
| No tests found | Files must end with `.test.js` or `.spec.js` |

## 📊 Coverage Goals

Run `npm test:coverage` and aim for:
- **Statements**: > 80%
- **Branches**: > 75% 
- **Functions**: > 80%
- **Lines**: > 80%

## 🛠️ Enhanced Scripts

```bash
# Use the enhanced test runner
node testing-guide/scripts/test-runner.js watch

# Check database setup
node testing-guide/scripts/database-setup.js setup

# See all available commands
node testing-guide/scripts/test-runner.js help
```

## 📖 Learn More

- **Complete guide**: `testing-guide/README.md`
- **Copy examples**: `testing-guide/examples/`
- **Database help**: `testing-guide/scripts/database-setup.js help`

---

## 🎉 You're Ready!

Your thermal app database testing is set up and working. Start with:

1. `npm test:watch` - for continuous testing
2. Copy `testing-guide/examples/basic-model-tests.js` for new tests
3. Read `testing-guide/README.md` for advanced techniques

Happy coding! 🚀
