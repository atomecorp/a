import fs from 'fs';

const kickstartPath = './src/squirrel/kickstart.js';
if (fs.existsSync(kickstartPath)) {
    const content = fs.readFileSync(kickstartPath, 'utf8');
    console.log('📄 Contenu de kickstart.js:');
    console.log(content.substring(0, 1000) + '...');
    
    // Chercher les define problématiques
    const lines = content.split('\n');
    lines.forEach((line, index) => {
        if (line.includes('define(')) {
            console.log(`⚠️ Ligne ${index + 1}: ${line.trim()}`);
        }
    });
} else {
    console.log('❌ kickstart.js non trouvé');
}
