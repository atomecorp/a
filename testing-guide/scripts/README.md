# 🛠️ Testing Scripts

This folder contains utility scripts to help you manage testing for your thermal application database.

## 📁 Scripts in this folder:

### 1. `test-runner.js`
**Purpose**: Convenient test execution with color-coded output  
**Usage**: `node testing-guide/scripts/test-runner.js [command]`

**Available commands**:
- `all` - Run all tests
- `watch` - Run tests in watch mode (re-run on file changes)
- `coverage` - Generate test coverage report
- `database` - Run only database schema tests
- `integration` - Run only integration tests
- `examples-basic` - Run basic example tests
- `examples-advanced` - Run advanced example tests
- `examples-thermal` - Run thermal-specific example tests
- `clean` - Clear Jest cache
- `debug` - Run tests with verbose debugging
- `setup-check` - Verify test setup is working

**Examples**:
```bash
# Run all tests
node testing-guide/scripts/test-runner.js all

# Run tests in watch mode
node testing-guide/scripts/test-runner.js watch

# Generate coverage report
node testing-guide/scripts/test-runner.js coverage

# Run specific test category
node testing-guide/scripts/test-runner.js database
```

### 2. `database-setup.js`
**Purpose**: Database setup, validation, and management utilities  
**Usage**: `node testing-guide/scripts/database-setup.js [command]`

**Available commands**:
- `setup` - Initialize and check database setup
- `create-migration <name>` - Create a new database migration
- `seed` - Create seed data script for testing
- `validate` - Validate database schema
- `help` - Show help message

**Examples**:
```bash
# Check database setup
node testing-guide/scripts/database-setup.js setup

# Create a new migration
node testing-guide/scripts/database-setup.js create-migration add_sensor_calibration

# Create seed data script
node testing-guide/scripts/database-setup.js seed

# Validate schema
node testing-guide/scripts/database-setup.js validate
```

## 🚀 Quick Start:

### 1. First-time setup:
```bash
# Check if everything is set up correctly
node testing-guide/scripts/database-setup.js setup

# Run a quick test to verify
node testing-guide/scripts/test-runner.js setup-check
```

### 2. Daily development workflow:
```bash
# Start watch mode for continuous testing
node testing-guide/scripts/test-runner.js watch

# In another terminal, run your development server
npm run dev
```

### 3. Before committing code:
```bash
# Run all tests
node testing-guide/scripts/test-runner.js all

# Generate coverage report
node testing-guide/scripts/test-runner.js coverage

# Check coverage in browser
# Open: coverage/lcov-report/index.html
```

## 🎨 Features:

### Color-coded output:
- ✅ **Green**: Success messages
- ❌ **Red**: Error messages  
- ℹ️ **Blue**: Information
- ⚠️ **Yellow**: Warnings
- 🔧 **Magenta**: Commands being executed
- 📋 **Cyan**: Code examples and paths

### Smart error handling:
- Descriptive error messages
- Helpful suggestions for fixing issues
- Graceful failure with appropriate exit codes

### Cross-platform compatibility:
- Works on Windows, macOS, and Linux
- Uses Node.js built-in modules for portability
- ANSI color codes for terminal styling

## 🔧 Customization:

### Add new test runner commands:
Edit `test-runner.js` and add to the `commands` object:

```javascript
const commands = {
  // ... existing commands ...
  
  'my-custom-test': {
    description: 'Run my custom test suite',
    command: 'npm test -- --testPathPattern=my-custom'
  }
};
```

### Add new database setup commands:
Edit `database-setup.js` and add a new case to the switch statement:

```javascript
switch (command) {
  // ... existing cases ...
  
  case 'my-custom-setup':
    myCustomSetupFunction();
    break;
}
```

### Modify color scheme:
Update the `colors` object in either script:

```javascript
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  // ... add your custom colors
};
```

## 🐛 Troubleshooting:

### "Command not found" errors:
- Make sure you're in the project root directory
- Verify Node.js is installed: `node --version`
- Check file permissions: `ls -la testing-guide/scripts/`

### "Cannot find module" errors:
- Run: `npm install` to install dependencies
- Check that required files exist in `src/database/` and `tests/`

### Color codes not working:
- Your terminal might not support ANSI colors
- Try running with: `NO_COLOR=1 node testing-guide/scripts/test-runner.js all`

### Jest cache issues:
- Clear cache: `node testing-guide/scripts/test-runner.js clean`
- Or manually: `npx jest --clearCache`

## 📊 Performance Tips:

### Faster test execution:
```bash
# Run only changed tests (in CI)
npm test -- --onlyChanged

# Run tests in parallel
npm test -- --maxWorkers=4

# Skip coverage for faster runs
npm test -- --skipCoverage
```

### Memory optimization:
```bash
# Limit memory usage
npm test -- --maxWorkers=2 --logHeapUsage

# Force garbage collection
node --expose-gc testing-guide/scripts/test-runner.js all
```

## 🔄 Integration with CI/CD:

### GitHub Actions example:
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: node testing-guide/scripts/database-setup.js setup
      - run: node testing-guide/scripts/test-runner.js all
      - run: node testing-guide/scripts/test-runner.js coverage
```

### NPM scripts integration:
Add to your `package.json`:

```json
{
  "scripts": {
    "test:setup": "node testing-guide/scripts/database-setup.js setup",
    "test:runner": "node testing-guide/scripts/test-runner.js",
    "test:db": "node testing-guide/scripts/test-runner.js database",
    "test:thermal": "node testing-guide/scripts/test-runner.js examples-thermal"
  }
}
```

Then use: `npm run test:setup`, `npm run test:db`, etc.

---

Happy Testing! 🚀
