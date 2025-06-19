import fs from 'fs';
import path from 'path';

function analyzeDirectory(dir, level = 0) {
    const indent = '  '.repeat(level);
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
        if (item.startsWith('.')) continue;
        
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            console.log(`${indent}📁 ${item}/`);
            if (level < 3 && !['node_modules', 'dist'].includes(item)) {
                analyzeDirectory(fullPath, level + 1);
            }
        } else if (item.endsWith('.js') || item.endsWith('.mjs')) {
            console.log(`${indent}📄 ${item}`);
        }
    }
}

console.log('🏗️ STRUCTURE DU PROJET SQUIRREL');
console.log('================================');
analyzeDirectory('./src');

console.log('\n🔍 ANALYSE DES IMPORTS DANS bundle-entry.js');
console.log('============================================');
const bundleEntry = fs.readFileSync('./scripts_utils/bundle-entry.js', 'utf8');
const importLines = bundleEntry.split('\n').filter(line => line.trim().startsWith('import'));
importLines.forEach(line => {
    console.log(`📦 ${line.trim()}`);
});
