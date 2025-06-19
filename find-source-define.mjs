import fs from 'fs';
import path from 'path';

function searchInFile(filePath, searchTerm) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const matches = [];
        
        lines.forEach((line, index) => {
            if (line.includes(searchTerm)) {
                matches.push({
                    file: filePath,
                    line: index + 1,
                    content: line.trim()
                });
            }
        });
        
        return matches;
    } catch (error) {
        return [];
    }
}

function searchInDirectory(dir, searchTerm) {
    const results = [];
    
    function scan(currentDir) {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules' && item !== 'dist') {
                scan(fullPath);
            } else if (stat.isFile() && (item.endsWith('.js') || item.endsWith('.mjs'))) {
                const matches = searchInFile(fullPath, searchTerm);
                results.push(...matches);
            }
        }
    }
    
    scan(dir);
    return results;
}

console.log('🔍 Recherche de define(\'view\' dans les sources...');
const matches = searchInDirectory('./src', 'define(\'view\'');

if (matches.length > 0) {
    console.log(`✅ Trouvé ${matches.length} occurrence(s):`);
    matches.forEach(match => {
        console.log(`📁 ${match.file}:${match.line}`);
        console.log(`   ${match.content}`);
    });
} else {
    console.log('❌ Aucune occurrence trouvée');
    console.log('🔍 Recherche de define("view" ...');
    const matches2 = searchInDirectory('./src', 'define("view"');
    if (matches2.length > 0) {
        matches2.forEach(match => {
            console.log(`📁 ${match.file}:${match.line}`);
            console.log(`   ${match.content}`);
        });
    }
}
