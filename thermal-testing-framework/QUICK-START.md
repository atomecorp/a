# 🚀 Quick Setup Instructions

## 1. Install Dependencies
```bash
npm install jest @babel/core @babel/preset-env babel-jest objection knex sqlite3 --save-dev
```

## 2. Copy Configuration Files
Copy these files to your project root:
- `config/jest.config.cjs` → `jest.config.cjs`
- `config/babel.config.cjs` → `babel.config.cjs`

## 3. Copy Database Models
Copy the `database/models/` folder to `src/database/` in your project

## 4. Copy Test Files
Copy the `tests/` folder to your project root

## 5. Run Tests
```bash
npm test
```

## 🎯 Expected Result
✅ 24 tests passing - Complete thermal database validation

## 📋 What's Tested
- User authorization system (read/edit/admin)
- Project history tracking and version control
- Thermal component management (Atome model)
- Multi-user collaboration workflows
- Database relationships and constraints
- Complete thermal monitoring integration

## 🛠️ Enhanced Commands
```bash
# Enhanced test runner
node scripts/test-runner.js all        # All tests with colors
node scripts/test-runner.js watch      # Watch mode
node scripts/test-runner.js coverage   # Coverage report

# Database utilities  
node scripts/setup-database.js setup   # Validate setup
node scripts/setup-database.js validate # Check schema
```

Your thermal app database testing is now ready! 🌡️
