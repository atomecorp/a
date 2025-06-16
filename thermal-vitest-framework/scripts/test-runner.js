#!/usr/bin/env node

/**
 * Enhanced Test Runner for Thermal App (Vitest)
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

  colorLog('🌡️  Thermal App Vitest Runner', 'bright');
  colorLog('=' .repeat(50), 'blue');

  switch (command) {
    case 'all':
      colorLog('\n📋 Running all tests with Vitest...', 'green');
      const allOutput = runCommand('npm test', 'Executing Vitest test suite');
      console.log(allOutput);
      break;

    case 'watch':
      colorLog('\n👀 Starting Vitest watch mode...', 'yellow');
      colorLog('Press Ctrl+C to stop', 'white');
      try {
        execSync('npm run test:watch', { stdio: 'inherit' });
      } catch (error) {
        // User cancelled with Ctrl+C
        colorLog('\n✋ Watch mode stopped', 'yellow');
      }
      break;

    case 'ui':
      colorLog('\n🎨 Launching Vitest UI interface...', 'magenta');
      colorLog('Opening browser interface...', 'white');
      try {
        execSync('npm run test:ui', { stdio: 'inherit' });
      } catch (error) {
        colorLog('\n✋ UI interface closed', 'yellow');
      }
      break;

    case 'coverage':
      colorLog('\n📊 Generating coverage report with Vitest...', 'magenta');
      const coverageOutput = runCommand('npm run test:coverage', 'Running tests with coverage');
      console.log(coverageOutput);
      break;

    case 'database':
      colorLog('\n🗄️  Running database-specific tests...', 'blue');
      const dbOutput = runCommand('npx vitest run tests/database.test.js', 'Testing database models');
      console.log(dbOutput);
      break;

    case 'integration':
      colorLog('\n🔗 Running integration tests...', 'green');
      const integrationOutput = runCommand('npx vitest run tests/thermal-integration.test.js', 'Testing thermal workflow');
      console.log(integrationOutput);
      break;

    case 'browser':
      colorLog('\n🌐 Running tests in browser mode...', 'cyan');
      try {
        execSync('npx vitest --browser', { stdio: 'inherit' });
      } catch (error) {
        colorLog('\n✋ Browser testing stopped', 'yellow');
      }
      break;

    case 'help':
    default:
      colorLog('\n📖 Available Commands:', 'bright');
      colorLog('  all         - Run all tests', 'white');
      colorLog('  watch       - Run tests in watch mode', 'white');
      colorLog('  ui          - Launch Vitest UI interface', 'white');
      colorLog('  coverage    - Run tests with coverage report', 'white');
      colorLog('  database    - Run only database tests', 'white');
      colorLog('  integration - Run only integration tests', 'white');
      colorLog('  browser     - Run tests in browser mode', 'white');
      colorLog('  help        - Show this help message', 'white');
      
      colorLog('\n💡 Examples:', 'yellow');
      colorLog('  node scripts/test-runner.js all', 'cyan');
      colorLog('  node scripts/test-runner.js watch', 'cyan');
      colorLog('  node scripts/test-runner.js ui', 'cyan');
      colorLog('  node scripts/test-runner.js coverage', 'cyan');
      
      colorLog('\n⚡ Vitest Advantages:', 'green');
      colorLog('  - Lightning fast execution', 'white');
      colorLog('  - Native ES modules support', 'white');
      colorLog('  - Built-in watch mode', 'white');
      colorLog('  - Interactive UI interface', 'white');
      colorLog('  - Browser testing support', 'white');
      break;
  }

  colorLog('\n✅ Vitest runner finished', 'green');
}

main();
