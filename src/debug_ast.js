// Debug script to examine the Prism AST structure
const fs = require('fs');
const path = require('path');

// Import the parser components
const PrismParser = require('./squirrel/prism_parser.js').PrismParser;

async function debugAST() {
    try {
        // Read the Ruby source file
        const rubyFile = './application/index.sqr';
        const rubySource = fs.readFileSync(rubyFile, 'utf8');
        
        // Parse with Prism
        const parser = new PrismParser();
        const ast = await parser.parseRuby(rubySource);
        
    } catch (error) {
        console.error('❌ Debug error:', error);
    }
}

debugAST();
