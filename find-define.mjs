import fs from 'fs';

const bundleContent = fs.readFileSync('./dist/squirrel.js', 'utf8');
const lines = bundleContent.split('\n');

// Trouver toutes les lignes contenant 'define'
lines.forEach((line, index) => {
    if (line.includes('define')) {
        console.log(`Ligne ${index + 1}: ${line.trim()}`);
        // Montrer le contexte (3 lignes avant et après)
        for (let i = Math.max(0, index - 3); i <= Math.min(lines.length - 1, index + 3); i++) {
            const marker = i === index ? '>>> ' : '    ';
            console.log(`${marker}${i + 1}: ${lines[i]}`);
        }
        console.log('---');
    }
});
