#!/usr/bin/env node

/**
 * Database Setup Utility
 * 
 * This script helps initialize and manage the test database for your thermal app.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
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

function printHeader(title) {
  console.log('\n' + colorize('='.repeat(60), 'cyan'));
  console.log(colorize(`🗄️  ${title}`, 'bright'));
  console.log(colorize('='.repeat(60), 'cyan') + '\n');
}

function checkFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    printSuccess(`${description} exists: ${filePath}`);
    return true;
  } else {
    printError(`${description} missing: ${filePath}`);
    return false;
  }
}

function checkDependency(packageName) {
  try {
    require.resolve(packageName);
    printSuccess(`${packageName} is installed`);
    return true;
  } catch (error) {
    printError(`${packageName} is not installed`);
    return false;
  }
}

function setupDatabase() {
  printHeader('Database Setup for Thermal App');
  
  let allGood = true;
  
  // Check required files
  printInfo('Checking required files...');
  allGood &= checkFile('src/database/User.js', 'User model');
  allGood &= checkFile('src/database/Project.js', 'Project model');
  allGood &= checkFile('src/database/Atome.js', 'Atome model');
  allGood &= checkFile('src/database/db.js', 'Database configuration');
  allGood &= checkFile('tests/setup.js', 'Test setup');
  allGood &= checkFile('jest.config.cjs', 'Jest configuration');
  
  console.log();
  
  // Check dependencies
  printInfo('Checking dependencies...');
  allGood &= checkDependency('objection');
  allGood &= checkDependency('knex');
  allGood &= checkDependency('sqlite3');
  allGood &= checkDependency('jest');
  
  console.log();
  
  if (!allGood) {
    printWarning('Some required files or dependencies are missing.');
    printInfo('Run the following commands to install missing dependencies:');
    console.log(colorize('npm install --save-dev objection knex sqlite3 jest', 'cyan'));
    return false;
  }
  
  // Test database connection
  printInfo('Testing database setup...');
  try {
    require('../tests/setup.js');
    printSuccess('Database setup is working correctly');
  } catch (error) {
    printError('Database setup failed:');
    console.error(error.message);
    return false;
  }
  
  console.log();
  printSuccess('Database setup complete! ✨');
  printInfo('You can now run tests with: npm test');
  
  return true;
}

function createMigration() {
  printHeader('Create New Migration');
  
  const migrationName = process.argv[3];
  if (!migrationName) {
    printError('Migration name is required');
    console.log('Usage: node database-setup.js create-migration <name>');
    return;
  }
  
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
  const fileName = `${timestamp}_${migrationName}.js`;
  const filePath = path.join('src/database/migrations', fileName);
  
  const migrationTemplate = `exports.up = function(knex) {
  return knex.schema
    // Add your schema changes here
    // Example:
    // .createTable('new_table', function(table) {
    //   table.increments('id').primary();
    //   table.string('name').notNullable();
    //   table.timestamps(true, true);
    // });
};

exports.down = function(knex) {
  return knex.schema
    // Add rollback changes here
    // Example:
    // .dropTableIfExists('new_table');
};`;

  try {
    if (!fs.existsSync('src/database/migrations')) {
      fs.mkdirSync('src/database/migrations', { recursive: true });
    }
    
    fs.writeFileSync(filePath, migrationTemplate);
    printSuccess(`Migration created: ${filePath}`);
    printInfo('Edit the migration file to add your schema changes');
  } catch (error) {
    printError('Failed to create migration:');
    console.error(error.message);
  }
}

function seedDatabase() {
  printHeader('Seed Test Database');
  
  printInfo('Creating sample thermal data for testing...');
  
  const seedTemplate = `const { User, Project, Atome } = require('../tests/setup');

async function seedTestData() {
  console.log('🌱 Seeding thermal test data...');
  
  // Create admin user
  const admin = await User.query().insert({
    name: 'Thermal System Admin',
    password: 'admin_password',
    autorisation: 'admin'
  });
  
  // Create thermal project
  const project = await Project.query().insert({
    name_project: 'Industrial Furnace Monitoring',
    history_action: '[]',
    autorisation: 'restricted',
    user_id: admin.id
  });
  
  // Create engineer user
  const engineer = await User.query().insert({
    name: 'Thermal Engineer',
    password: 'engineer_password',
    autorisation: 'edit',
    project_id: project.id
  });
  
  // Create thermal sensors
  const sensors = await Atome.query().insert([
    {
      user_id: engineer.id,
      project_id: project.id,
      name_project: 'Main Furnace Thermocouple'
    },
    {
      user_id: engineer.id,
      project_id: project.id,
      name_project: 'Cooling System Monitor'
    },
    {
      user_id: admin.id,
      project_id: project.id,
      name_project: 'Emergency Shutdown System'
    }
  ]);
  
  console.log('✅ Test data seeded successfully!');
  console.log(\`   - Users: \${[admin, engineer].length}\`);
  console.log(\`   - Projects: 1\`);
  console.log(\`   - Sensors: \${sensors.length}\`);
  
  return { admin, engineer, project, sensors };
}

if (require.main === module) {
  seedTestData().catch(console.error);
}

module.exports = { seedTestData };`;

  const seedPath = 'testing-guide/scripts/seed-data.js';
  
  try {
    fs.writeFileSync(seedPath, seedTemplate);
    printSuccess(`Seed script created: ${seedPath}`);
    printInfo('Run the seed script with: node testing-guide/scripts/seed-data.js');
  } catch (error) {
    printError('Failed to create seed script:');
    console.error(error.message);
  }
}

function validateSchema() {
  printHeader('Validate Database Schema');
  
  try {
    const User = require('../src/database/User');
    const Project = require('../src/database/Project');
    const Atome = require('../src/database/Atome');
    
    printInfo('Validating model schemas...');
    
    // Check User schema
    const userSchema = User.jsonSchema;
    if (userSchema && userSchema.properties) {
      printSuccess('User model schema is valid');
    } else {
      printWarning('User model schema might be incomplete');
    }
    
    // Check Project schema
    const projectSchema = Project.jsonSchema;
    if (projectSchema && projectSchema.properties) {
      printSuccess('Project model schema is valid');
    } else {
      printWarning('Project model schema might be incomplete');
    }
    
    // Check Atome schema
    const atomeSchema = Atome.jsonSchema;
    if (atomeSchema && atomeSchema.properties) {
      printSuccess('Atome model schema is valid');
    } else {
      printWarning('Atome model schema might be incomplete');
    }
    
    printInfo('Schema validation complete');
    
  } catch (error) {
    printError('Schema validation failed:');
    console.error(error.message);
  }
}

function showHelp() {
  printHeader('Database Setup Utility');
  
  console.log('Available commands:\n');
  
  const commands = [
    ['setup', 'Initialize and check database setup'],
    ['create-migration <name>', 'Create a new database migration'],
    ['seed', 'Create seed data script for testing'],
    ['validate', 'Validate database schema'],
    ['help', 'Show this help message']
  ];
  
  commands.forEach(([cmd, desc]) => {
    console.log(`  ${colorize(cmd.padEnd(25), 'green')} ${desc}`);
  });
  
  console.log('\nUsage:');
  console.log(`  ${colorize('node testing-guide/scripts/database-setup.js <command>', 'cyan')}`);
  
  console.log('\nExamples:');
  console.log(`  ${colorize('node testing-guide/scripts/database-setup.js setup', 'cyan')}`);
  console.log(`  ${colorize('node testing-guide/scripts/database-setup.js create-migration add_sensor_calibration', 'cyan')}`);
  console.log(`  ${colorize('node testing-guide/scripts/database-setup.js seed', 'cyan')}`);
  
  console.log('\n');
}

function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'setup':
      setupDatabase();
      break;
    case 'create-migration':
      createMigration();
      break;
    case 'seed':
      seedDatabase();
      break;
    case 'validate':
      validateSchema();
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showHelp();
      break;
    default:
      printError(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  setupDatabase,
  createMigration,
  seedDatabase,
  validateSchema
};
