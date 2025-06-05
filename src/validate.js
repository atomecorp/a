#!/usr/bin/env node

/**
 * 🔍 VALIDATION DU PROJET OPTIMISÉ
 * Vérifie que toutes les optimisations sont correctement appliquées
 */

const fs = require('fs');
const path = require('path');


// Tests de validation
const tests = [
    {
        name: 'HTML optimisé',
        test: () => {
            const html = fs.readFileSync('index.html', 'utf8');
            return html.includes('<!DOCTYPE html>') && 
                   html.includes('<main id="app">') &&
                   html.includes('lang="fr"');
        }
    },
    {
        name: 'CSS optimisé',
        test: () => {
            const css = fs.readFileSync('css/styles.css', 'utf8');
            return css.includes('/* ===== SQUIRREL STYLES - VERSION OPTIMISÉE =====') &&
                   !css.includes('/*.matrix_element{*/') &&
                   css.includes('inset: 0');
        }
    },
    {
        name: 'JavaScript optimisé',
        test: () => {
            const js = fs.readFileSync('js/app.js', 'utf8');
            return js.includes('OPTIMIZED ES6 MODULE ENTRY POINT') &&
                   !js.includes('Preserves exact loading order');
        }
    },
    {
        name: 'Fichiers supprimés',
        test: () => {
            return !fs.existsSync('debug_ast.js') &&
                   !fs.existsSync('squirrel/code_generator.js') &&
                   !fs.existsSync('squirrel/transpiler_core.js');
        }
    },
    {
        name: 'Structure des modules',
        test: () => {
            const requiredFiles = [
                'squirrel/transpiler_core_compliant.js',
                'squirrel/native_code_generator.js',
                'squirrel/squirrel_orchestrator.js',
                'squirrel/prism_parser.js'
            ];
            return requiredFiles.every(file => fs.existsSync(file));
        }
    },
    {
        name: 'Application Ruby',
        test: () => {
            return fs.existsSync('application/index.sqr') &&
                   fs.readFileSync('application/index.sqr', 'utf8').includes('A.new');
        }
    }
];

// Exécution des tests
let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
    try {
        const result = test.test();
        if (result) {
            passed++;
        } else {
            failed++;
        }
    } catch (error) {
        failed++;
    }
});

// Résumé
console.log(`
📊 Résultats de validation:`);

if (failed === 0) {
} else {
}

console.log('
📋 Pour utiliser le projet:');
console.log('   Puis ouvrir: http://localhost:8081');
