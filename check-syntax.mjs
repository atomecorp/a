import fs from 'fs';

// Vérifier la syntaxe des fichiers core
const filesToCheck = [
  './src/squirrel/squirrel.js',
  './src/squirrel/apis.js',
  './src/squirrel/components/button_builder.js',
  './src/squirrel/components/badge_builder.js',
  './src/squirrel/components/tooltip_builder.js'
];

for (const file of filesToCheck) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    console.log(`✅ ${file} - syntaxe OK`);
  } catch (error) {
    console.log(`❌ ${file} - ERREUR: ${error.message}`);
  }
}
