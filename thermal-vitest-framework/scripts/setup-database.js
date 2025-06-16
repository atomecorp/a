#!/usr/bin/env node

/**
 * Database Setup and Validation Utilities (Vitest)
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
  colorLog('📦 Checking Vitest Dependencies...', 'cyan');
  
  const requiredDeps = [
    'vitest',
    'vite',
    '@vitest/ui',
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
      colorLog('✅ All Vitest dependencies found', 'green');
      return true;
    }
  } catch (error) {
    colorLog('❌ Error reading package.json', 'red');
    return false;
  }
}

function checkConfigFiles() {
  colorLog('\n⚙️  Checking Vitest Configuration Files...', 'cyan');
  
  const configFiles = [
    'vitest.config.js',
    'vite.config.js'
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
  colorLog('\n🧪 Checking Vitest Test Files...', 'cyan');
  
  const testFiles = [
    'tests/setup.js',
    'tests/database.test.js',
    'tests/thermal-integration.test.js'
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

function validateVitestConfig() {
  colorLog('\n🔍 Validating Vitest Configuration...', 'cyan');
  
  try {
    if (fs.existsSync('vitest.config.js')) {
      const configContent = fs.readFileSync('vitest.config.js', 'utf8');
      
      // Check for essential Vitest configuration
      const hasTestConfig = configContent.includes('test:');
      const hasSetupFiles = configContent.includes('setupFiles');
      const hasEnvironment = configContent.includes('environment');
      
      if (hasTestConfig && hasSetupFiles && hasEnvironment) {
        colorLog('✅ Vitest configuration is valid', 'green');
        return true;
      } else {
        colorLog('❌ Vitest configuration is incomplete', 'red');
        return false;
      }
    } else {
      colorLog('❌ vitest.config.js not found', 'red');
      return false;
    }
  } catch (error) {
    colorLog(`❌ Config validation error: ${error.message}`, 'red');
    return false;
  }
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

function runSampleTest() {
  colorLog('\n🧪 Running Sample Vitest Test...', 'cyan');
  
  try {
    const output = execSync('npx vitest run --reporter=verbose --no-coverage tests/database.test.js', 
      { encoding: 'utf8', stdio: 'pipe' });
    
    if (output.includes('PASS') || output.includes('✓')) {
      colorLog('✅ Sample test passed successfully', 'green');
      return true;
    } else {
      colorLog('❌ Sample test failed', 'red');
      console.log(output);
      return false;
    }
  } catch (error) {
    colorLog(`❌ Test execution error: ${error.message}`, 'red');
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'setup';

  colorLog('🌡️  Thermal App Vitest Setup Utility', 'bright');
  colorLog('=' .repeat(50), 'blue');

  switch (command) {
    case 'setup':
      colorLog('\n🚀 Checking Complete Vitest Setup...', 'yellow');
      
      const depsOk = checkDependencies();
      const configOk = checkConfigFiles();
      const modelsOk = checkDatabaseModels();
      const testsOk = checkTestFiles();
      const vitestConfigOk = validateVitestConfig();
      
      if (depsOk && configOk && modelsOk && testsOk && vitestConfigOk) {
        colorLog('\n🎉 Vitest setup is complete!', 'green');
        colorLog('Run: npm test', 'cyan');
        colorLog('Or: npm run test:ui (for UI interface)', 'cyan');
      } else {
        colorLog('\n⚠️  Vitest setup incomplete. Please fix the issues above.', 'yellow');
      }
      break;

    case 'validate':
      colorLog('\n🔍 Validating Schema and Config...', 'yellow');
      const configValid = validateVitestConfig();
      const schemaValid = validateDatabaseSchema();
      
      if (configValid && schemaValid) {
        colorLog('\n✅ Validation passed!', 'green');
      } else {
        colorLog('\n❌ Validation failed!', 'red');
      }
      break;

    case 'test':
      colorLog('\n🧪 Running Sample Test...', 'yellow');
      if (runSampleTest()) {
        colorLog('\n✅ Sample test execution successful!', 'green');
      } else {
        colorLog('\n❌ Sample test execution failed!', 'red');
      }
      break;

    case 'deps':
      checkDependencies();
      break;

    case 'help':
    default:
      colorLog('\n📖 Available Commands:', 'bright');
      colorLog('  setup    - Check complete Vitest setup', 'white');
      colorLog('  validate - Validate configuration and schema', 'white');
      colorLog('  test     - Run sample test', 'white');
      colorLog('  deps     - Check dependencies only', 'white');
      colorLog('  help     - Show this help message', 'white');
      
      colorLog('\n⚡ Vitest Features:', 'green');
      colorLog('  - Native ES modules support', 'white');
      colorLog('  - Lightning fast execution', 'white');
      colorLog('  - Built-in watch mode', 'white');
      colorLog('  - Interactive UI interface', 'white');
      colorLog('  - Browser testing capability', 'white');
      break;
  }
}

main();
