#!/usr/bin/env node

/**
 * Enhanced Test Runner for Thermal App
 * Provides colored output and additional test management features
 */

const { execSync } = require('child_process');
const path = require('path');

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

function colorLog(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description) {
  colorLog(`\n🔄 ${description}`, 'cyan');
  try {
    const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    return output;
  } catch (error) {
    colorLog(`❌ Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  colorLog('🌡️  Thermal App Test Runner', 'bright');
  colorLog('=' .repeat(50), 'blue');

  switch (command) {
    case 'all':
      colorLog('\n📋 Running all tests...', 'green');
      const allOutput = runCommand('npm test', 'Executing Jest test suite');
      console.log(allOutput);
      break;

    case 'watch':
      colorLog('\n👀 Starting watch mode...', 'yellow');
      colorLog('Press Ctrl+C to stop', 'white');
      try {
        execSync('npm run test:watch', { stdio: 'inherit' });
      } catch (error) {
        // User cancelled with Ctrl+C
        colorLog('\n✋ Watch mode stopped', 'yellow');
      }
      break;

    case 'coverage':
      colorLog('\n📊 Generating coverage report...', 'magenta');
      const coverageOutput = runCommand('npm run test:coverage', 'Running tests with coverage');
      console.log(coverageOutput);
      break;

    case 'database':
      colorLog('\n🗄️  Running database-specific tests...', 'blue');
      const dbOutput = runCommand('npx jest tests/database.test.js --verbose', 'Testing database models');
      console.log(dbOutput);
      break;

    case 'integration':
      colorLog('\n🔗 Running integration tests...', 'green');
      const integrationOutput = runCommand('npx jest tests/thermal-integration.test.js --verbose', 'Testing thermal workflow');
      console.log(integrationOutput);
      break;

    case 'help':
    default:
      colorLog('\n📖 Available Commands:', 'bright');
      colorLog('  all         - Run all tests', 'white');
      colorLog('  watch       - Run tests in watch mode', 'white');
      colorLog('  coverage    - Run tests with coverage report', 'white');
      colorLog('  database    - Run only database tests', 'white');
      colorLog('  integration - Run only integration tests', 'white');
      colorLog('  help        - Show this help message', 'white');
      
      colorLog('\n💡 Examples:', 'yellow');
      colorLog('  node scripts/test-runner.js all', 'cyan');
      colorLog('  node scripts/test-runner.js watch', 'cyan');
      colorLog('  node scripts/test-runner.js coverage', 'cyan');
      break;
  }

  colorLog('\n✅ Test runner finished', 'green');
}

main();
