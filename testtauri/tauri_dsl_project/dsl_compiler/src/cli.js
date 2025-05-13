const fs = require('fs');
const path = require('path');

// Define paths
const DSL_SOURCE_DIR = path.resolve(__dirname, '../../tauri_app/src/dsl_source');
const JS_OUTPUT_DIR = path.resolve(__dirname, '../../tauri_app/src/dsl_compiled');

console.log('DSL Compiler starting...');
console.log('Source directory:', DSL_SOURCE_DIR);
console.log('Output directory:', JS_OUTPUT_DIR);

// Create output directory if needed
if (!fs.existsSync(JS_OUTPUT_DIR)) {
    fs.mkdirSync(JS_OUTPUT_DIR, { recursive: true });
    console.log('Created output directory');
}

// List DSL files
try {
    const files = fs.readdirSync(DSL_SOURCE_DIR);
    const dslFiles = files.filter(file => file.endsWith('.dsl'));
    console.log(`Found ${dslFiles.length} DSL files: ${dslFiles.join(', ')}`);
    
    // Process each DSL file
    dslFiles.forEach(file => {
        const filePath = path.join(DSL_SOURCE_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        console.log(`Processing ${file} (${content.length} bytes)`);
        
        // Generate JS file
        const jsPath = path.join(JS_OUTPUT_DIR, file.replace('.dsl', '.js'));
        const jsContent = `
// Generated from ${file} by DSL compiler
console.log("DSL file processed: ${file}");

// DOM manipulation to show it works
document.addEventListener('DOMContentLoaded', () => {
    console.log("DSL script running");
    const dslOutput = document.getElementById('dsl-output');
    if (dslOutput) {
        dslOutput.innerHTML += '<h3>DSL Compiler Test Successful!</h3>';
        dslOutput.innerHTML += '<div>Original DSL code:</div>';
        dslOutput.innerHTML += '<pre>' + \`${content.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\` + '</pre>';
    } else {
        console.error("Could not find #dsl-output element");
    }
});`;
        
        fs.writeFileSync(jsPath, jsContent);
        console.log(`Generated JS file: ${jsPath}`);
    });
} catch (error) {
    console.error('Error processing DSL files:', error);
}

console.log('DSL compilation complete!');