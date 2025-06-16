#!/usr/bin/env node

/**
 * Database Setup and Validation Utilities
 * For thermal app testing infrastructure
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

function colorLog(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkDependencies() {
  colorLog('📦 Checking Dependencies...', 'cyan');
  
  const requiredDeps = [
    'jest',
    '@babel/core',
    '@babel/preset-env',
    'babel-jest',
    'objection',
    'knex',
    'sqlite3'
  ];

  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    const missing = requiredDeps.filter(dep => !allDeps[dep]);
    
    if (missing.length > 0) {
      colorLog('❌ Missing dependencies:', 'red');
      missing.forEach(dep => colorLog(`  - ${dep}`, 'red'));
      colorLog('\n💡 Install with:', 'yellow');
      colorLog(`npm install ${missing.join(' ')} --save-dev`, 'cyan');
      return false;
    } else {
      colorLog('✅ All dependencies found', 'green');
      return true;
    }
  } catch (error) {
    colorLog('❌ Error reading package.json', 'red');
    return false;
  }
}

function checkConfigFiles() {
  colorLog('\n⚙️  Checking Configuration Files...', 'cyan');
  
  const configFiles = [
    'jest.config.cjs',
    'babel.config.cjs'
  ];

  let allPresent = true;
  
  configFiles.forEach(file => {
    if (fs.existsSync(file)) {
      colorLog(`✅ ${file} found`, 'green');
    } else {
      colorLog(`❌ ${file} missing`, 'red');
      allPresent = false;
    }
  });

  return allPresent;
}

function checkDatabaseModels() {
  colorLog('\n🗄️  Checking Database Models...', 'cyan');
  
  const modelFiles = [
    'src/database/User.js',
    'src/database/Project.js',
    'src/database/Atome.js',
    'src/database/db.js'
  ];

  let allPresent = true;
  
  modelFiles.forEach(file => {
    if (fs.existsSync(file)) {
      colorLog(`✅ ${file} found`, 'green');
    } else {
      colorLog(`❌ ${file} missing`, 'red');
      allPresent = false;
    }
  });

  return allPresent;
}

function checkTestFiles() {
  colorLog('\n🧪 Checking Test Files...', 'cyan');
  
  const testFiles = [
    'tests/setup.js',
    'tests/database.test.js'
  ];

  let allPresent = true;
  
  testFiles.forEach(file => {
    if (fs.existsSync(file)) {
      colorLog(`✅ ${file} found`, 'green');
    } else {
      colorLog(`❌ ${file} missing`, 'red');
      allPresent = false;
    }
  });

  return allPresent;
}

function validateDatabaseSchema() {
  colorLog('\n🔍 Validating Database Schema...', 'cyan');
  
  try {
    // Import and test models
    const User = require('../database/models/User');
    const Project = require('../database/models/Project');
    const Atome = require('../database/models/Atome');
    
    colorLog('✅ User model loads correctly', 'green');
    colorLog('✅ Project model loads correctly', 'green');
    colorLog('✅ Atome model loads correctly', 'green');
    
    // Check model schemas
    const userSchema = User.jsonSchema;
    const projectSchema = Project.jsonSchema;
    const atomeSchema = Atome.jsonSchema;
    
    if (userSchema && projectSchema && atomeSchema) {
      colorLog('✅ All model schemas are defined', 'green');
      return true;
    } else {
      colorLog('❌ Some model schemas are missing', 'red');
      return false;
    }
  } catch (error) {
    colorLog(`❌ Model validation error: ${error.message}`, 'red');
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'setup';

  colorLog('🌡️  Thermal App Database Setup Utility', 'bright');
  colorLog('=' .repeat(50), 'blue');

  switch (command) {
    case 'setup':
      colorLog('\n🚀 Checking Complete Setup...', 'yellow');
      
      const depsOk = checkDependencies();
      const configOk = checkConfigFiles();
      const modelsOk = checkDatabaseModels();
      const testsOk = checkTestFiles();
      
      if (depsOk && configOk && modelsOk && testsOk) {
        colorLog('\n🎉 Setup is complete!', 'green');
        colorLog('Run: npm test', 'cyan');
      } else {
        colorLog('\n⚠️  Setup incomplete. Please fix the issues above.', 'yellow');
      }
      break;

    case 'validate':
      colorLog('\n🔍 Validating Schema Only...', 'yellow');
      if (validateDatabaseSchema()) {
        colorLog('\n✅ Database schema validation passed!', 'green');
      } else {
        colorLog('\n❌ Database schema validation failed!', 'red');
      }
      break;

    case 'deps':
      checkDependencies();
      break;

    case 'help':
    default:
      colorLog('\n📖 Available Commands:', 'bright');
      colorLog('  setup    - Check complete setup', 'white');
      colorLog('  validate - Validate database schema only', 'white');
      colorLog('  deps     - Check dependencies only', 'white');
      colorLog('  help     - Show this help message', 'white');
      break;
  }
}

main();
