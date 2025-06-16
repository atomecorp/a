#!/usr/bin/env node

/**
 * Test Runner Script for Thermal App Database
 * 
 * This script provides convenient commands for running different types of tests.
 * Usage: node testing-guide/scripts/test-runner.js [command]
 */

const { execSync } = require('child_process');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function printHeader(title) {
  console.log('\n' + colorize('='.repeat(60), 'cyan'));
  console.log(colorize(`🧪 ${title}`, 'bright'));
  console.log(colorize('='.repeat(60), 'cyan') + '\n');
}

function printSuccess(message) {
  console.log(colorize(`✅ ${message}`, 'green'));
}

function printError(message) {
  console.log(colorize(`❌ ${message}`, 'red'));
}

function printInfo(message) {
  console.log(colorize(`ℹ️  ${message}`, 'blue'));
}

function printWarning(message) {
  console.log(colorize(`⚠️  ${message}`, 'yellow'));
}

function runCommand(command, description) {
  try {
    console.log(colorize(`Running: ${description}`, 'magenta'));
    console.log(colorize(`Command: ${command}`, 'cyan'));
    console.log();
    
    const output = execSync(command, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    printSuccess(`Completed: ${description}`);
    return true;
  } catch (error) {
    printError(`Failed: ${description}`);
    console.error(error.message);
    return false;
  }
}

// Available commands
const commands = {
  // Basic test commands
  'all': {
    description: 'Run all tests',
    command: 'npm test'
  },
  
  'watch': {
    description: 'Run tests in watch mode',
    command: 'npm run test:watch'
  },
  
  'coverage': {
    description: 'Run tests with coverage report',
    command: 'npm run test:coverage'
  },
  
  // Specific test files
  'database': {
    description: 'Run database schema tests only',
    command: 'npm test database.test.js'
  },
  
  'integration': {
    description: 'Run thermal integration tests only',
    command: 'npm test thermal-integration.test.js'
  },
  
  // Example tests (from testing-guide/examples)
  'examples-basic': {
    description: 'Run basic model test examples',
    command: 'npm test testing-guide/examples/basic-model-tests.js'
  },
  
  'examples-advanced': {
    description: 'Run advanced testing pattern examples',
    command: 'npm test testing-guide/examples/advanced-testing-patterns.js'
  },
  
  'examples-thermal': {
    description: 'Run thermal-specific test examples',
    command: 'npm test testing-guide/examples/thermal-specific-tests.js'
  },
  
  // Utility commands
  'clean': {
    description: 'Clear Jest cache',
    command: 'npx jest --clearCache'
  },
  
  'debug': {
    description: 'Run tests with debug output',
    command: 'npm test -- --verbose --no-cache'
  },
  
  'setup-check': {
    description: 'Check if test setup is working',
    command: 'node -e "require(\'./tests/setup.js\'); console.log(\'✅ Test setup is working\')"'
  }
};

function showHelp() {
  printHeader('Thermal App Test Runner');
  
  console.log('Available commands:\n');
  
  Object.entries(commands).forEach(([cmd, info]) => {
    console.log(`  ${colorize(cmd.padEnd(20), 'green')} ${info.description}`);
  });
  
  console.log('\nUsage:');
  console.log(`  ${colorize('node testing-guide/scripts/test-runner.js [command]', 'cyan')}`);
  console.log(`  ${colorize('node testing-guide/scripts/test-runner.js all', 'cyan')}`);
  console.log(`  ${colorize('node testing-guide/scripts/test-runner.js watch', 'cyan')}`);
  console.log(`  ${colorize('node testing-guide/scripts/test-runner.js coverage', 'cyan')}`);
  
  console.log('\nExamples:');
  console.log(`  ${colorize('# Run all tests', 'gray')}`);
  console.log(`  ${colorize('node testing-guide/scripts/test-runner.js all', 'cyan')}`);
  console.log(`  ${colorize('# Run specific test file', 'gray')}`);
  console.log(`  ${colorize('node testing-guide/scripts/test-runner.js database', 'cyan')}`);
  console.log(`  ${colorize('# Run tests in watch mode', 'gray')}`);
  console.log(`  ${colorize('node testing-guide/scripts/test-runner.js watch', 'cyan')}`);
  
  console.log('\n');
}

function main() {
  const command = process.argv[2];
  
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }
  
  if (!commands[command]) {
    printError(`Unknown command: ${command}`);
    console.log('\nRun with "help" to see available commands:');
    console.log(colorize('node testing-guide/scripts/test-runner.js help', 'cyan'));
    process.exit(1);
  }
  
  const { description, command: cmd } = commands[command];
  
  printHeader(`Test Runner - ${description}`);
  
  // Special handling for certain commands
  if (command === 'coverage') {
    printInfo('Generating test coverage report...');
    printInfo('Report will be available in coverage/lcov-report/index.html');
  } else if (command === 'watch') {
    printInfo('Starting watch mode. Tests will re-run when files change.');
    printInfo('Press Ctrl+C to exit watch mode.');
  } else if (command === 'setup-check') {
    printInfo('Checking test setup configuration...');
  }
  
  const success = runCommand(cmd, description);
  
  if (success) {
    if (command === 'coverage') {
      console.log('\n');
      printInfo('Coverage report generated! Open the following file in your browser:');
      console.log(colorize('coverage/lcov-report/index.html', 'cyan'));
    }
    
    if (command === 'all') {
      console.log('\n');
      printSuccess('All tests completed successfully!');
      printInfo('Your thermal app database is working correctly.');
    }
  } else {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runCommand, commands };
