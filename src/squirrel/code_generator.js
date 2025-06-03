/**
 * 🏗️ CODE GENERATOR
 * Génération de code JavaScript spécialisée
 */

class CodeGenerator {
    constructor() {
        // console.log('🏗️ Code Generator initialized');
    }

    /**
     * 🎯 GENERATE A.new() CALL FROM RUBY SOURCE
     */
    generateANewCall(variableName, rubyCode) {
        // console.log(`🎯 Generating A.new() call for: ${variableName}`);
        
        // Extraire le contenu du hash Ruby
        const hashMatch = rubyCode.match(/A\.new\s*\(\s*\{([\s\S]*?)\}\s*\)/);
        if (hashMatch) {
            const hashContent = hashMatch[1];
            const jsConfig = this.convertRubyHashToJS(hashContent);
            return `const ${variableName} = new A(${jsConfig});`;
        }
        
        // Fallback simple
        return `const ${variableName} = new A({});`;
    }

    /**
     * 📦 CONVERT RUBY HASH TO JAVASCRIPT OBJECT
     */
    convertRubyHashToJS(rubyHashContent) {
        // console.log('📦 Converting Ruby hash to JavaScript object');
        
        if (!rubyHashContent || !rubyHashContent.trim()) {
            return '{}';
        }
        
        // Split par lignes et nettoyer
        const lines = rubyHashContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
        
        const properties = [];
        let currentProperty = '';
        let braceLevel = 0;
        let bracketLevel = 0;
        let inMultilineArray = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Compter les niveaux d'imbrication
            for (const char of line) {
                if (char === '{') braceLevel++;
                if (char === '}') braceLevel--;
                if (char === '[') {
                    bracketLevel++;
                    if (bracketLevel === 1 && braceLevel === 0) {
                        inMultilineArray = true;
                    }
                }
                if (char === ']') {
                    bracketLevel--;
                    if (bracketLevel === 0) {
                        inMultilineArray = false;
                    }
                }
            }
            
            currentProperty += line + (inMultilineArray ? ' ' : '\n');
            
            // Si on est au niveau 0 et qu'on a une virgule ou qu'on est à la fin
            if (braceLevel === 0 && bracketLevel === 0 && !inMultilineArray && 
                (line.endsWith(',') || i === lines.length - 1)) {
                
                const cleanProperty = currentProperty.trim().replace(/,$/, '');
                if (cleanProperty.includes(':')) {
                    const jsProperty = this.convertRubyPropertyToJS(cleanProperty);
                    if (jsProperty) {
                        properties.push(jsProperty);
                    }
                }
                currentProperty = '';
            }
        }
        
        if (properties.length === 0) {
            return '{}';
        }
        
        return `{\n  ${properties.join(',\n  ')}\n}`;
    }

    /**
     * 🔧 CONVERT SINGLE RUBY PROPERTY TO JS
     */
    convertRubyPropertyToJS(rubyProperty) {
        if (!rubyProperty.includes(':')) return null;
        
        const colonIndex = rubyProperty.indexOf(':');
        const key = rubyProperty.substring(0, colonIndex).trim();
        let value = rubyProperty.substring(colonIndex + 1).trim();
        
        // Clean up multiline formatting
        value = value.replace(/\n\s*/g, ' ').trim();
        
        const cleanKey = key.replace(/['"]/g, '');
        
        // Special handling for contenteditable
        if (cleanKey === 'contenteditable') {
            const jsValue = this.convertRubyValueToJS(value);
            return `attrContenteditable: ${jsValue}`;
        }
        
        const jsValue = this.convertRubyValueToJS(value);
        
        return `${cleanKey}: ${jsValue}`;
    }

    /**
     * 🔄 CONVERT RUBY VALUE TO JAVASCRIPT
     */
    convertRubyValueToJS(rubyValue) {
        const trimmed = rubyValue.trim();
        
        // String literals
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            return trimmed;
        }
        if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
            return `"${trimmed.slice(1, -1)}"`;
        }
        
        // Numbers
        if (/^\d+(\.\d+)?$/.test(trimmed)) {
            return trimmed;
        }
        
        // Booleans
        if (trimmed === 'true' || trimmed === 'false') {
            return trimmed;
        }
        
        // Nil
        if (trimmed === 'nil') {
            return 'null';
        }
        
        // Arrays (including complex nested arrays)
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            return this.convertRubyArrayToJS(trimmed);
        }
        
        // Hashes
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            const innerContent = trimmed.slice(1, -1);
            return this.convertRubyHashToJS(innerContent);
        }
        
        // CSS selectors or identifiers
        if (trimmed.startsWith('#') || trimmed.startsWith('.') || /^[a-zA-Z_]\w*$/.test(trimmed)) {
            return `"${trimmed}"`;
        }
        
        // Default: treat as string
        return `"${trimmed}"`;
    }

    /**
     * 📚 CONVERT RUBY ARRAY TO JAVASCRIPT (IMPROVED)
     */
    convertRubyArrayToJS(rubyArray) {
        const content = rubyArray.slice(1, -1).trim();
        if (!content) return '[]';
        
        // For complex arrays with objects, use a more sophisticated parser
        if (content.includes('{') && content.includes('}')) {
            return this.parseComplexRubyArray(content);
        }
        
        // Simple split by comma for basic arrays
        const elements = this.splitRubyArrayElements(content);
        const jsElements = elements.map(el => this.convertRubyValueToJS(el.trim()));
        return `[${jsElements.join(', ')}]`;
    }

    /**
     * 🧩 PARSE COMPLEX RUBY ARRAY WITH OBJECTS (FIXED)
     */
    parseComplexRubyArray(content) {
        // console.log('🧩 Parsing complex Ruby array:', content);
        
        const elements = [];
        let current = '';
        let braceLevel = 0;
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const prevChar = i > 0 ? content[i - 1] : '';
            
            // Handle strings
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                    stringChar = '';
                }
            }
            
            if (!inString) {
                if (char === '{') {
                    braceLevel++;
                } else if (char === '}') {
                    braceLevel--;
                    
                    // When we close the last brace of an object
                    if (braceLevel === 0) {
                        current += char;
                        
                        // Look ahead for comma or end
                        let nextNonSpace = i + 1;
                        while (nextNonSpace < content.length && /\s/.test(content[nextNonSpace])) {
                            nextNonSpace++;
                        }
                        
                        if (nextNonSpace >= content.length || content[nextNonSpace] === ',') {
                            // End of element
                            if (current.trim()) {
                                elements.push(current.trim());
                            }
                            current = '';
                            
                            // Skip the comma
                            if (nextNonSpace < content.length && content[nextNonSpace] === ',') {
                                i = nextNonSpace;
                            }
                            continue;
                        }
                    }
                } else if (char === ',' && braceLevel === 0) {
                    // End of element (for non-object elements)
                    if (current.trim()) {
                        elements.push(current.trim());
                    }
                    current = '';
                    continue;
                }
            }
            
            current += char;
        }
        
        // Add the last element
        if (current.trim()) {
            elements.push(current.trim());
        }
        
        // console.log('🔍 Extracted elements:', elements);
        
        // Convert each element
        const jsElements = elements.map(element => {
            const trimmedElement = element.trim();
            // console.log('🔄 Converting element:', trimmedElement);
            
            if (trimmedElement.startsWith('{') && trimmedElement.endsWith('}')) {
                // It's an object - convert to proper JavaScript object
                const objectContent = trimmedElement.slice(1, -1);
                const jsObjectContent = this.convertRubyObjectContent(objectContent);
                const result = `{ ${jsObjectContent} }`;
                // console.log('✅ Converted object:', result);
                return result;
            } else {
                // It's a simple value
                const result = this.convertRubyValueToJS(trimmedElement);
                // console.log('✅ Converted value:', result);
                return result;
            }
        });
        
        const finalResult = `[${jsElements.join(', ')}]`;
        // console.log('🎯 Final array result:', finalResult);
        return finalResult;
    }

    /**
     * 🔧 CONVERT RUBY OBJECT CONTENT TO JS
     */
    convertRubyObjectContent(content) {
        // console.log('🔧 Converting Ruby object content:', content);
        
        const properties = [];
        const lines = content.split(/[,\n]/).map(line => line.trim()).filter(line => line);
        
        for (const line of lines) {
            if (line.includes(':')) {
                const colonIndex = line.indexOf(':');
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 1).trim();
                
                const cleanKey = key.replace(/['"]/g, '');
                
                // Handle nested objects
                if (value.startsWith('{') && value.endsWith('}')) {
                    const nestedContent = value.slice(1, -1);
                    const nestedObject = this.convertRubyObjectContent(nestedContent);
                    properties.push(`${cleanKey}: { ${nestedObject} }`);
                } else {
                    const jsValue = this.convertRubyValueToJS(value);
                    properties.push(`${cleanKey}: ${jsValue}`);
                }
            }
        }
        
        const result = properties.join(', ');
        // console.log('🔧 Object content result:', result);
        return result;
    }

    /**
     * ✂️ SPLIT RUBY ARRAY ELEMENTS PROPERLY
     */
    splitRubyArrayElements(content) {
        const elements = [];
        let current = '';
        let parenLevel = 0;
        let braceLevel = 0;
        let bracketLevel = 0;
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const prevChar = i > 0 ? content[i - 1] : '';
            
            // Handle strings
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                    stringChar = '';
                }
            }
            
            if (!inString) {
                if (char === '(') parenLevel++;
                else if (char === ')') parenLevel--;
                else if (char === '{') braceLevel++;
                else if (char === '}') braceLevel--;
                else if (char === '[') bracketLevel++;
                else if (char === ']') bracketLevel--;
                else if (char === ',' && parenLevel === 0 && braceLevel === 0 && bracketLevel === 0) {
                    elements.push(current.trim());
                    current = '';
                    continue;
                }
            }
            
            current += char;
        }
        
        if (current.trim()) {
            elements.push(current.trim());
        }
        
        return elements;
    }

    /**
     * 🔧 FIX JAVASCRIPT SYNTAX ERRORS
     */
    fixJavaScriptSyntax(jsCode) {
        // console.log('🔧 Fixing JavaScript syntax errors...');
        
        let fixed = jsCode;
        
        // Fix: A.new({ → A.new({})
        fixed = fixed.replace(/A\.new\(\{\s*;/g, 'A.new({});');
        
        // Fix: trailing semicolons in object literals
        fixed = fixed.replace(/;\s*}/g, '}');
        
        // Fix: missing closing braces
        fixed = fixed.replace(/A\.new\(\{[^}]*$/gm, match => {
            if (!match.includes('}')) {
                return match.replace('A.new({', 'A.new({})');
            }
            return match;
        });
        
        // Remove standalone method calls without context (comme attach();)
        const lines = fixed.split('\n');
        const validLines = [];
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip standalone method calls that look like hash properties
            if (this.isStandalonePropertyCall(trimmed)) {
                // console.log(`🗑️ Removing standalone call: ${trimmed}`);
                continue;
            }
            
            validLines.push(line);
        }
        
        const result = validLines.join('\n');
        // console.log('✅ JavaScript syntax fixed');
        return result;
    }

    /**
     * 🔍 CHECK IF LINE IS A STANDALONE PROPERTY CALL
     */
    isStandalonePropertyCall(line) {
        const propertyMethods = [
            'attach', 'id', 'markup', 'role', 'x', 'y', 'width', 'height',
            'color', 'text', 'display', 'contenteditable', 'attrContenteditable', 
            'smooth', 'shadow', 'blur', 'invert', 'overflow', 'font_size', 'font_weight'
        ];
        
        for (const method of propertyMethods) {
            if (line === `${method}();`) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 🧹 CLEAN GENERATED CODE
     */
    cleanGeneratedCode(jsCode) {
        // console.log('🧹 Cleaning generated code...');
        
        let cleaned = jsCode;
        
        // Remove empty lines
        cleaned = cleaned.replace(/^\s*$/gm, '');
        
        // Remove comment lines that are just structural
        cleaned = cleaned.replace(/^\/\/ Call from source: [{}(),\[\]]+$/gm, '');
        
        // Compact multiple newlines
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        
        return cleaned.trim();
    }

    /**
     * 🎯 GENERATE COMPLETE RUBY TO JS CONVERSION
     */
    generateCompleteRubyConversion(rubyCode) {
        // console.log('🎯 Generating complete Ruby to JS conversion...');
        
        // Extract variable assignments
        const assignments = this.extractRubyAssignments(rubyCode);
        const jsStatements = [];
        
        for (const assignment of assignments) {
            if (assignment.value.includes('A.new')) {
                const jsStatement = this.generateANewCall(assignment.variable, assignment.value);
                jsStatements.push(jsStatement);
            } else {
                // Simple assignment
                const jsValue = this.convertRubyValueToJS(assignment.value);
                jsStatements.push(`const ${assignment.variable} = ${jsValue};`);
            }
        }
        
        return jsStatements.join('\n');
    }

    /**
     * 📝 EXTRACT RUBY ASSIGNMENTS
     */
    extractRubyAssignments(rubyCode) {
        const assignments = [];
        const lines = rubyCode.split('\n');
        let currentAssignment = null;
        let braceLevel = 0;
        let bracketLevel = 0;
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip comments and empty lines
            if (!trimmed || trimmed.startsWith('#')) continue;
            
            // Check for variable assignment
            if (trimmed.includes('=') && !trimmed.includes('==') && braceLevel === 0 && bracketLevel === 0) {
                const equalIndex = trimmed.indexOf('=');
                const variable = trimmed.substring(0, equalIndex).trim();
                const value = trimmed.substring(equalIndex + 1).trim();
                
                currentAssignment = { variable, value: value };
                
                // Count braces and brackets in the value
                for (const char of value) {
                    if (char === '{') braceLevel++;
                    if (char === '}') braceLevel--;
                    if (char === '[') bracketLevel++;
                    if (char === ']') bracketLevel--;
                }
                
                // If complete assignment, add it
                if (braceLevel === 0 && bracketLevel === 0) {
                    assignments.push(currentAssignment);
                    currentAssignment = null;
                }
            } else if (currentAssignment) {
                // Continue multiline assignment
                currentAssignment.value += '\n' + trimmed;
                
                // Count braces and brackets
                for (const char of trimmed) {
                    if (char === '{') braceLevel++;
                    if (char === '}') braceLevel--;
                    if (char === '[') bracketLevel++;
                    if (char === ']') bracketLevel--;
                }
                
                // If complete, add it
                if (braceLevel === 0 && bracketLevel === 0) {
                    assignments.push(currentAssignment);
                    currentAssignment = null;
                }
            }
        }
        
        return assignments;
    }
}

// Global export
if (typeof window !== 'undefined') {
    window.CodeGenerator = CodeGenerator;
    // console.log('✅ Code Generator ready');
}