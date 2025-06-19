import fs from 'fs';

console.log('🔍 Analyse de bundle-entry.js...');

const bundleEntryPath = './scripts_utils/bundle-entry.js';
if (fs.existsSync(bundleEntryPath)) {
    const content = fs.readFileSync(bundleEntryPath, 'utf8');
    const lines = content.split('\n');
    
    console.log('📄 Contenu de bundle-entry.js:');
    lines.forEach((line, index) => {
        if (line.includes('define')) {
            console.log(`>>> ${index + 1}: ${line}`);
        } else {
            console.log(`    ${index + 1}: ${line}`);
        }
    });
} else {
    console.log('❌ bundle-entry.js non trouvé');
}
