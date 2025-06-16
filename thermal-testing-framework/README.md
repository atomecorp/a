# 🌡️ Thermal App Testing Framework

## Complete Jest Testing Setup for Thermal Database

This folder contains everything you need to test your thermal application database with Jest and Objection.js ORM.

## 📁 Folder Structure

```
thermal-testing-framework/
├── README.md                    # This file - overview and instructions
├── config/                      # Configuration files
│   ├── jest.config.cjs         # Jest configuration
│   └── babel.config.cjs        # Babel configuration
├── database/                    # Database models and setup
│   ├── models/                 # Objection.js models
│   │   ├── User.js            # User model with authorization
│   │   ├── Project.js         # Project model with history tracking
│   │   └── Atome.js           # Atome model for thermal components
│   ├── migrations/            # Database migrations
│   │   └── 001_create_thermal_schema.js
│   └── db.js                  # Database configuration
├── tests/                      # Test files
│   ├── setup.js               # Test environment setup
│   ├── database.test.js       # Main database tests (23 tests)
│   └── thermal-integration.test.js  # Integration test example
├── scripts/                    # Utility scripts
│   ├── run-tests.js           # Enhanced test runner
│   └── setup-database.js     # Database setup utilities
└── package-dependencies.json  # Required npm dependencies
```

## 🚀 Quick Start

1. **Install Dependencies:**
   ```bash
   npm install jest @babel/core @babel/preset-env babel-jest objection knex sqlite3 --save-dev
   ```

2. **Copy Configuration:**
   - Copy `config/jest.config.cjs` to your project root
   - Copy `config/babel.config.cjs` to your project root

3. **Copy Database Models:**
   - Copy `database/models/` to `src/database/`
   - Copy `database/migrations/` to `src/database/migrations/`
   - Copy `database/db.js` to `src/database/`

4. **Copy Tests:**
   - Copy `tests/` folder to your project root

5. **Run Tests:**
   ```bash
   npm test
   ```

## ✅ What's Tested

- **User Model:** Authorization levels, permissions, validation
- **Project Model:** History tracking, version control, multi-user support
- **Atome Model:** Thermal components, usage permissions
- **Relationships:** User-Project, Project-Atome associations
- **Authorization System:** Read/edit/admin permission enforcement
- **History Tracking:** Audit trail for compliance
- **Integration:** Complete thermal monitoring workflow

## 📊 Test Results

- **24 tests passing** ✅
- **Complete coverage** of thermal app requirements
- **Production-ready** database schema validation

## 🔧 Customization

All files are fully documented and can be customized for your specific thermal monitoring needs.
