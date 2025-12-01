#!/usr/bin/env node
/**
 * Script pour générer la liste des fichiers pour version.json
 * Usage: node scripts_utils/generate_file_list.js
 * 
 * Ce script scanne le dossier ./src et met à jour src/version.json
 * avec la liste complète des fichiers.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SRC_DIR = path.join(__dirname, '..', 'src');
const VERSION_FILE = path.join(SRC_DIR, 'version.json');

// Paths à ignorer
const IGNORED_PATTERNS = [
    'node_modules',
    '.git',
    '.DS_Store',
    'Thumbs.db'
];

/**
 * Scanne récursivement un dossier et retourne tous les fichiers
 */
function scanDirectory(dir, basePath = '') {
    const files = [];
    
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
            
            // Vérifier si le chemin doit être ignoré
            const shouldIgnore = IGNORED_PATTERNS.some(pattern => 
                entry.name === pattern || relativePath.includes(pattern)
            );
            
            if (shouldIgnore) {
                continue;
            }
            
            if (entry.isDirectory()) {
                // Récursion dans les sous-dossiers
                const subFiles = scanDirectory(fullPath, relativePath);
                files.push(...subFiles);
            } else if (entry.isFile()) {
                // Ajouter le fichier avec le préfixe "src/"
                files.push(`src/${relativePath}`);
            }
        }
    } catch (error) {
        console.error(`Error scanning ${dir}:`, error.message);
    }
    
    return files;
}

/**
 * Met à jour version.json avec la liste des fichiers
 */
function updateVersionJson(fileList) {
    let versionData = {
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
        description: 'Atome/Squirrel core version and update manifest',
        protectedPaths: ['src/application/temp'],
        files: []
    };
    
    // Lire le fichier existant s'il existe
    if (fs.existsSync(VERSION_FILE)) {
        try {
            const existing = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
            versionData = { ...versionData, ...existing };
        } catch (e) {
            console.error('Error reading existing version.json:', e.message);
        }
    }
    
    // Filtrer les paths protégés
    const protectedPaths = versionData.protectedPaths || [];
    const filteredFiles = fileList.filter(filePath => {
        return !protectedPaths.some(prot => filePath.startsWith(prot));
    });
    
    // Mettre à jour la liste des fichiers et la date
    versionData.files = filteredFiles;
    versionData.updatedAt = new Date().toISOString();
    
    // Supprimer scanFolders (plus nécessaire)
    delete versionData.scanFolders;
    
    // Écrire le fichier
    fs.writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2) + '\n', 'utf8');
    
    return versionData;
}

// Exécution principale
console.log('🔍 Scanning src/ directory...');
const fileList = scanDirectory(SRC_DIR);
console.log(`📁 Found ${fileList.length} files`);

console.log('💾 Updating version.json...');
const result = updateVersionJson(fileList);
console.log(`✅ version.json updated with ${result.files.length} files`);
console.log(`   Version: ${result.version}`);
console.log(`   Updated: ${result.updatedAt}`);

// Afficher un aperçu
console.log('\n📋 Sample files (first 10):');
result.files.slice(0, 10).forEach(f => console.log(`   - ${f}`));
if (result.files.length > 10) {
    console.log(`   ... and ${result.files.length - 10} more`);
}

console.log('\n✨ Done! Now commit and push src/version.json to GitHub.');
