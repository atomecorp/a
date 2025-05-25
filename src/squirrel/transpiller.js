// 🚀 Simplified Ruby to JavaScript Transpiler
// Focus on core functionality with zero errors

function transpiler(rubyCode) {
    if (!rubyCode || typeof rubyCode !== 'string') {
        console.warn('⚠️ Invalid input for transpiler');
        return '';
    }

    // Clean the input first
    let js = rubyCode
        .trim()
        .split('\n')
        .filter(line => {
            const trimmed = line.trim();
            return trimmed && !trimmed.startsWith('####') && !trimmed.startsWith('#');
        })
        .join('\n');

    // Step 1: Convert A.new to new A (IMPROVED to handle complex objects)
    js = js.replace(/(\w+)\s*=\s*A\.new\s*\(\s*\{([\s\S]*?)\}\s*\)/g, (match, varName, props) => {
        // Don't modify the props content, just wrap it properly
        return `const ${varName} = new A({\n${props}\n});`;
    });

    // Step 2: Convert event handlers with proper syntax
    js = js.replace(/(\w+)\.(onclick|onmouseover|onmouseout|onkeydown)\s+do\s*([\s\S]*?)end/g, (match, obj, event, body) => {
        const cleanBody = body
            .trim()
            .split('\n')
            .map(line => '    ' + line.trim())
            .join('\n');
        return `${obj}.${event}(() => {\n${cleanBody}\n});`;
    });

    // Step 3: Convert wait blocks to setTimeout
    js = js.replace(/wait\s+(\d+)\s+do\s*([\s\S]*?)end/g, (match, delay, body) => {
        const cleanBody = body
            .trim()
            .split('\n')
            .map(line => '    ' + line.trim())
            .join('\n');
        return `setTimeout(() => {\n${cleanBody}\n}, ${delay});`;
    });

    // Step 4: Handle puts statements
    js = js.replace(/puts\s*\(\s*(.+)\s*\)/g, 'puts($1);');
    js = js.replace(/puts\s+(.+)/g, 'puts($1);');

    // Step 5: Handle grab calls
    js = js.replace(/grab\("([^"]+)"\)\.(\w+)\("([^"]+)"\)/g, 'grab("$1").$2("$3");');
    js = js.replace(/grab\('([^']+)'\)\.(\w+)\("([^"]+)"\)/g, 'grab("$1").$2("$3");');

    // Step 6: Clean up and format
    js = js
        .replace(/^\s*#.*$/gm, '') // Remove any remaining comments
        .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean multiple newlines
        .trim();

    console.log('🔍 Transpiled result:', js); // Debug log
    return js;
}

// Simple and reliable execution function
function executeTranspiledCode(jsCode) {
    if (!jsCode || typeof jsCode !== 'string') {
        console.warn('⚠️ No code to execute');
        return;
    }
    
    console.log('🔍 About to execute:');
    console.log(jsCode);
    
    try {
        // Execute the complete code
        eval(jsCode);
        console.log('✅ Code executed successfully');
    } catch (error) {
        console.error('❌ Execution error:', error);
        
        // Try to identify the problematic line
        const lines = jsCode.split('\n');
        console.log('📝 Code breakdown:');
        lines.forEach((line, index) => {
            console.log(`${index + 1}: ${line}`);
        });
    }
}

// Export for global use
window.transpiler = transpiler;
window.executeTranspiledCode = executeTranspiledCode;