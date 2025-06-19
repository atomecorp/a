/**
 * 🔍 SCAN AUTOMATIQUE DES COMPOSANTS SQUIRREL
 * Script qui scanne le dossier components/ et met à jour plugin-manager.js
 */

import fs from 'fs';
import path from 'path';

const COMPONENTS_DIR = './src/squirrel/components';
const PLUGIN_MANAGER_FILE = './src/squirrel/plugin-manager.js';

function scanComponents() {
  console.log('🔍 Scan des composants dans', COMPONENTS_DIR);
  
  // Lire le contenu du dossier components
  const files = fs.readdirSync(COMPONENTS_DIR);
  
  // Filtrer les fichiers JS (exclure les dossiers et autres fichiers)
  const componentFiles = files
    .filter(file => file.endsWith('.js'))
    .map(file => path.basename(file, '.js'))
    .sort();
  
  console.log(`✅ ${componentFiles.length} composants trouvés:`, componentFiles);
  
  return componentFiles;
}

function updatePluginManager(components) {
  console.log('📝 Mise à jour de plugin-manager.js');
  
  // Lire le fichier plugin-manager.js
  let content = fs.readFileSync(PLUGIN_MANAGER_FILE, 'utf8');
  
  // Générer la nouvelle liste des composants
  const componentsList = components.map(comp => `      '${comp}'`).join(',\n');
  
  // Pattern pour remplacer la liste existante (plus robuste)
  const pattern = /(\/\/ Liste des composants disponibles \(générée automatiquement\)\s*const availableComponents = \[)[^}]*(\];)/s;
  const replacement = `$1
${componentsList}
    $2`;
  
  // Effectuer le remplacement
  if (pattern.test(content)) {
    content = content.replace(pattern, replacement);
  } else {
    console.warn('⚠️ Pattern non trouvé, recherche alternative...');
    // Pattern alternatif plus simple
    const altPattern = /(const availableComponents = \[)[^}]*(\];)/s;
    content = content.replace(altPattern, replacement);
  }
  
  // Écrire le fichier mis à jour
  fs.writeFileSync(PLUGIN_MANAGER_FILE, content, 'utf8');
  console.log('✅ plugin-manager.js mis à jour');
}

// Exécution du scan
const components = scanComponents();
updatePluginManager(components);

console.log('🎉 Scan terminé ! Les composants sont prêts à être utilisés.');
