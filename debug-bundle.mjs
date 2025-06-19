import fs from 'fs';

// Lire le bundle généré
const bundleContent = fs.readFileSync('./dist/squirrel.js', 'utf8');

console.log('=== ANALYSE DU BUNDLE ===');
console.log('Taille:', bundleContent.length);

// Chercher les références problématiques
const problematicPatterns = [
    /define\s*\(/g,
    /typeof define/g,
    /define\.amd/g,
    /module\.exports/g,
    /require\s*\(/g
];

problematicPatterns.forEach((pattern, index) => {
    const matches = bundleContent.match(pattern);
    if (matches) {
        console.log(`Pattern ${index + 1} (${pattern.source}):`, matches.length, 'occurrences');
        
        // Montrer le contexte autour de la ligne 7035
        const lines = bundleContent.split('\n');
        if (lines[7034]) {
            console.log(`Ligne 7035: ${lines[7034]}`);
        }
    }
});

// Vérifier le début et la fin du bundle
console.log('\n=== DÉBUT DU BUNDLE ===');
console.log(bundleContent.substring(0, 500));

console.log('\n=== FIN DU BUNDLE ===');
console.log(bundleContent.substring(bundleContent.length - 500));
