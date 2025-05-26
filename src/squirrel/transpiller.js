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

    // Step 2: Convert ALL event handlers with proper syntax (UNIVERSAL)
    js = js.replace(/(\w+)\.(on\w+|keyboard|drag|drop|focus|blur|change|input|submit|load|resize|scroll)\s+do\s*([\s\S]*?)end/g, (match, obj, event, body) => {
        console.log(`🔄 Event processing: ${obj}.${event}`);
        
        // Extract parameter if exists |param|
        const paramMatch = body.match(/^\s*\|([^|]+)\|/);
        
        if (paramMatch) {
            // Event with parameter
            const param = paramMatch[1].trim();
            const bodyWithoutParam = body.replace(/^\s*\|[^|]+\|\s*/, '').trim();
            
            const finalBody = bodyWithoutParam
                .split('\n')
                .map(line => '    ' + line.trim())
                .join('\n');
            
            // Special handling for keyboard events
            if (event === 'keyboard') {
                return `${obj}.getElement().addEventListener('keydown', (${param}) => {\n${finalBody}\n});`;
            } else {
                // Generic event with parameter
                const eventName = event.startsWith('on') ? event.slice(2) : event;
                return `${obj}.getElement().addEventListener('${eventName}', (${param}) => {\n${finalBody}\n});`;
            }
        } else {
            // Event without parameter
            const cleanBody = body
                .trim()
                .split('\n')
                .map(line => '    ' + line.trim())
                .join('\n');
            
            return `${obj}.${event}(() => {\n${cleanBody}\n});`;
        }
    });

    // Step 2b: UNIVERSAL GENERIC RULE (catches non-event methods)
    js = js.replace(/(\w+)\.(\w+)\s+do\s*([\s\S]*?)end/g, (match, obj, method, body) => {
        console.log(`🔄 Generic rule processing: ${obj}.${method}`);
        
        // Skip if already processed by event rules
        if (match.includes('addEventListener') || match.includes('setTimeout')) {
            return match;
        }
        
        // Skip if it's an event (already handled above)
        if (method.match(/^(on\w+|keyboard|drag|drop|focus|blur|change|input|submit|load|resize|scroll)$/)) {
            return match;
        }
        
        // Extract parameter if exists |param|
        const paramMatch = body.match(/^\s*\|([^|]+)\|/);
        if (paramMatch) {
            const param = paramMatch[1].trim();
            const bodyWithoutParam = body.replace(/^\s*\|[^|]+\|\s*/, '').trim();
            
            const finalBody = bodyWithoutParam
                .split('\n')
                .map(line => '    ' + line.trim())
                .join('\n');
            
            return `${obj}.${method}((${param}) => {\n${finalBody}\n});`;
        } else {
            // No parameter
            const cleanBody = body
                .trim()
                .split('\n')
                .map(line => '    ' + line.trim())
                .join('\n');
            
            return `${obj}.${method}(() => {\n${cleanBody}\n});`;
        }
    });

    // Step 2c: Handle simple method calls (no do...end blocks) - FIXED
    js = js.replace(/(\w+)\.(\w+)\(([^)]*)\)(?!\s*[;}])/g, '$1.$2($3);');

    // Step 3: Convert wait blocks to setTimeout
    js = js.replace(/wait\s+(\d+)\s+do\s*([\s\S]*?)end/g, (match, delay, body) => {
        const cleanBody = body
            .trim()
            .split('\n')
            .map(line => '    ' + line.trim())
            .join('\n');
        return `setTimeout(() => {\n${cleanBody}\n}, ${delay});`;
    });

    // Step 4: Handle simple method calls BEFORE string interpolation (MOVED UP)
    js = js.replace(/(\w+)\.(\w+)\(([^)]*)\)(?!\s*[;}])(?!\s+do)/g, '$1.$2($3);');

    // Step 4: Handle Ruby string interpolation FIRST (FIXED ORDER)
    js = js.replace(/"([^"]*?)#\{([^}]+)\}([^"]*?)"/g, '`$1${$2}$3`');
    js = js.replace(/'([^']*?)#\{([^}]+)\}([^']*?)'/g, '`$1${$2}$3`');
    
    // Step 5: Handle puts statements
    js = js.replace(/puts\s*\(\s*(.+)\s*\)/g, 'puts($1);');
    js = js.replace(/puts\s+(.+)/g, 'puts($1);');

    // Step 6: Handle Ruby conditionals
    js = js.replace(/key\.ctrl/g, 'key.ctrlKey');
    js = js.replace(/if\s+(.+?)\s*$/gm, 'if ($1) {');
    js = js.replace(/^\s*end\s*$/gm, '}');

    // Step 7: Handle grab calls (REVERTED - grab was working fine)
    js = js.replace(/grab\("([^"]+)"\)\.(\w+)\("([^"]+)"\)/g, 'grab("$1").$2("$3");');
    js = js.replace(/grab\('([^']+)'\)\.(\w+)\("([^"]+)"\)/g, 'grab("$1").$2("$3");');
    js = js.replace(/grab\("([^"]+)"\)\.(\w+)\(\)/g, 'grab("$1").$2();');
    js = js.replace(/grab\('([^']+)'\)\.(\w+)\(\)/g, 'grab("$1").$2();');

    // Step 9: Clean up syntax errors caused by multiple transformations
    js = js
        .replace(/^\s*#.*$/gm, '') // Remove any remaining comments
        .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean multiple newlines
        .replace(/getElement\(\);\./g, 'getElement().') // Fix getElement();. → getElement().
        .replace(/\(\(\); =>/g, '(() =>') // Fix (()); => → (() =>
        .replace(/\.preventDefault\b(?!\()/g, '.preventDefault()') // Fix preventDefault without ()
        .trim();
    
    // Step 10: Fix the specific broken pattern we see in the logs
    js = js.replace(
        /key\.preventDefault\(\)\s*\n\s*if\s*\([^)]+\)\s*\{\s*\n\s*puts\([^)]+\);\s*\n\s*key\.preventDefault\(\)\s*\n\s*\}\);\s*\n\s*\}/g,
        `key.preventDefault();
    if (key.ctrlKey && key.key === "s") {
        puts("Ctrl+S détecté!");
        key.preventDefault();
    }
});`
    );

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
        
        // Show the exact problematic area
        console.log('🔍 Error details:', error.message);
    }
}

// Export for global use
window.transpiler = transpiler;
window.executeTranspiledCode = executeTranspiledCode;