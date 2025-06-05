/**
 * 🎯 NATIVE CODE GENERATOR
 * Génère du JavaScript vanilla pur sans couches d'abstraction
 */

class NativeCodeGenerator {
    /**
     * Generate native JavaScript from Prism AST
     */
    generateNativeJS(statements) {
        const jsLines = [];
        
        let statementsToProcess = [];
        
        if (Array.isArray(statements)) {
            statementsToProcess = statements;
        } else if (statements && statements.type === 'program' && statements.statements) {
            statementsToProcess = statements.statements;
        } else if (statements && statements.body) {
            statementsToProcess = statements.body;
        } else if (statements) {
            statementsToProcess = [statements];
        }
        
        for (const statement of statementsToProcess) {
            // Filter out comments
            if (statement && 
                (statement.type === 'CommentNode' || 
                 statement.type === 'comment' ||
                 (typeof statement === 'string' && statement.trim().startsWith('#')))) {
                continue;
            }
            
            const nativeJS = this.convertToNativeJS(statement);
            if (nativeJS) {
                jsLines.push(nativeJS);
            }
        }
        
        return jsLines.join('\n');
    }

    /**
     * Convert single Prism node to native JavaScript
     * @param {Object} node - Prism AST node
     * @returns {string} Native JavaScript
     */
    convertToNativeJS(node) {
        if (!node) return null;
        
        // 🔍 Special handling for arrays without type property
        if (Array.isArray(node)) {
            const elements = node.map(element => this.convertToNativeJS(element));
            return `[${elements.join(', ')}]`;
        }
        
        // 🔍 Special handling for plain JavaScript objects (already deserialized from Prism)
        if (typeof node === 'object' && node !== null && !node.type) {
            return this.convertPlainObjectToJS(node);
        }
        
        if (!node.type) return null;
        
        // 🚫 FILTER OUT COMMENTS - Do not transpile comment nodes
        if (node.type === 'CommentNode' || 
            node.type === 'comment' || 
            (typeof node === 'string' && node.trim().startsWith('#'))) {
            return null; // Skip comments entirely
        }
        
        switch (node.type) {
            // Prism AST node types
            case 'LocalVariableWriteNode':
                return this.generateVariableDeclaration(node);
            case 'CallNode':
                return this.generateFunctionCall(node);
            case 'StringNode':
                // Handle Unicode properly - use unescaped property for proper Unicode support
                let stringValue = '';
                if (node.unescaped && node.unescaped.value !== undefined) {
                    stringValue = node.unescaped.value;
                } else if (node.value !== undefined) {
                    stringValue = node.value;
                } else if (node.unescaped) {
                    // Sometimes unescaped is directly the string
                    stringValue = node.unescaped;
                }
                
                // Properly escape the string for JavaScript, preserving Unicode
                const result = JSON.stringify(stringValue);
                return result;
            case 'IntegerNode':
                return String(node.value);
            case 'FloatNode':
                return String(node.value);
            case 'TrueNode':
                return 'true';
            case 'FalseNode':
                return 'false';
            case 'NilNode':
                return 'null';
            case 'SymbolNode':
                return `"${node.value}"`; // Convert Ruby symbol to string
            case 'HashNode':
                return this.generateObjectLiteral(node);
            case 'ArrayNode':
                return this.generateArrayLiteral(node);
            case 'AssocNode':
                return this.generateAssocPair(node);
            case 'LocalVariableReadNode':
                return node.name;
            case 'ConstantReadNode':
                return node.name;
            case 'IfNode':
                return this.generateIfStatement(node);
            case 'WhileNode':
                return this.generateWhileLoop(node);
            case 'ForNode':
                return this.generateForLoop(node);
            case 'DefNode':
                return this.generateFunctionDefinition(node);
            case 'BlockNode':
                return this.generateBlock(node);
            
            // Fallback parser node types
            case 'assignment':
                return this.generateFallbackAssignment(node);
            case 'method_call':
                return this.generateFallbackMethodCall(node);
            case 'method_definition':
                return this.generateFallbackFunctionDefinition(node);
            case 'class_definition':
                return this.generateFallbackClassDefinition(node);
            case 'statement':
                return this.generateFallbackStatement(node);
            
            default:
                console.warn(`❌ Unsupported node type: ${node.type}`);
                console.warn('❌ Node details:', node);
                return `// Unsupported node type: ${node.type}`;
        }
    }

    /**
     * Generate native variable declaration
     */
    generateVariableDeclaration(node) {
        const varName = node.name;
        const value = this.convertToNativeJS(node.value);
        return `const ${varName} = ${value};`;
    }

    /**
     * Generate native function call - ONLY puts from apis.js
     */
    generateFunctionCall(node) {
        const methodName = node.name;
        
        if (methodName === 'puts') {
            const args = this.generateArgumentsList(node.arguments);
            return `puts(${args});`;
        }
        
        // A.new becomes native object constructor
        if (methodName === 'new' && node.receiver?.name === 'A') {
            const args = this.generateArgumentsList(node.arguments);
            return `new A(${args})`;
        }
        
        // Handle wait method calls
        if (methodName === 'wait') {
            const args = this.generateArgumentsList(node.arguments);
            if (node.block) {
                // Generate block content
                const blockContent = this.generateBlockContent(node.block);
                return `wait(${args || '1000'}, function() {\n${blockContent}\n});`;
            } else {
                return `wait(${args || '1000'});`;
            }
        }
        
        // Handle grab method calls  
        if (methodName === 'grab') {
            const args = this.generateArgumentsList(node.arguments);
            return `grab(${args})`;
        }
        
        // All other calls become native function calls
        const args = this.generateArgumentsList(node.arguments);
        if (node.receiver) {
            const receiver = this.convertToNativeJS(node.receiver);
            return `${receiver}.${methodName}(${args})`;
        }
        return `${methodName}(${args})`;
    }

    /**
     * Generate native arguments list
     */
    generateArgumentsList(argsNode) {
        if (!argsNode || !argsNode.arguments) return '';
        
        const args = argsNode.arguments.map(arg => this.convertToNativeJS(arg));
        return args.join(', ');
    }

    /**
     * Generate native object literal
     */
    generateObjectLiteral(node) {
        if (!node.elements || node.elements.length === 0) return '{}';
        
        const props = node.elements.map(element => {
            // Each element should be an AssocNode with key and value
            if (element.type === 'AssocNode') {
                return this.generateAssocPair(element);
            } else {
                console.warn(`❌ Unexpected hash element type: ${element.type}`);
                return 'null: null';
            }
        }).filter(prop => prop !== null); // 🚫 Filter out null values (comments)
        
        return `{\n  ${props.join(',\n  ')}\n}`;
    }

    /**
     * Generate key-value pair from AssocNode
     */
    generateAssocPair(node) {
        // 🚫 FILTER OUT COMMENTS - Skip if key looks like a comment
        if (node.key && (
            (node.key.type === 'StringNode' && node.key.value.startsWith('#')) ||
            (node.key.type === 'SymbolNode' && node.key.value.startsWith('#')) ||
            (typeof node.key === 'string' && node.key.startsWith('#'))
        )) {
            return null; // Skip comment-like keys
        }
        
        // Handle different key types
        let key;
        if (node.key.type === 'SymbolNode') {
            // Ruby symbol :key becomes JavaScript property key
            key = node.key.value.replace(/^:/, ''); 
        } else if (node.key.type === 'StringNode') {
            // String key with quotes
            key = `"${node.key.value}"`;
        } else {
            // Other key types
            const keyValue = this.convertToNativeJS(node.key);
            key = keyValue.includes(' ') ? `"${keyValue}"` : keyValue;
        }
        
        
        const value = this.convertToNativeJS(node.value);
        
        return `${key}: ${value}`;
    }

    /**
     * Generate native array literal
     */
    generateArrayLiteral(node) {
        if (!node.elements) return '[]';
        
        const elements = node.elements.map(element => this.convertToNativeJS(element));
        return `[${elements.join(', ')}]`;
    }

    /**
     * Generate native if statement
     */
    generateIfStatement(node) {
        const condition = this.convertToNativeJS(node.predicate);
        const thenBody = this.generateStatements(node.statements);
        
        let result = `if (${condition}) {\n${thenBody}\n}`;
        
        if (node.consequent) {
            const elseBody = this.generateStatements(node.consequent.statements);
            result += ` else {\n${elseBody}\n}`;
        }
        
        return result;
    }

    /**
     * Generate native while loop
     */
    generateWhileLoop(node) {
        const condition = this.convertToNativeJS(node.predicate);
        const body = this.generateStatements(node.statements);
        return `while (${condition}) {\n${body}\n}`;
    }

    /**
     * Generate native for loop (from Ruby each)
     */
    generateForLoop(node) {
        const iterable = this.convertToNativeJS(node.collection);
        const variable = node.index ? node.index.name : 'item';
        const body = this.generateStatements(node.statements);
        return `for (const ${variable} of ${iterable}) {\n${body}\n}`;
    }

    /**
     * Generate native function definition
     */
    generateFunctionDefinition(node) {
        const name = node.name;
        const params = node.parameters ? node.parameters.map(p => p.name).join(', ') : '';
        const body = this.generateStatements(node.body.statements);
        return `function ${name}(${params}) {\n${body}\n}`;
    }

    /**
     * Generate native block of statements
     */
    generateBlock(node) {
        return this.generateStatements(node.statements);
    }

    /**
     * Generate statements with proper indentation
     */
    generateStatements(statements) {
        if (!statements || statements.length === 0) return '';
        
        const jsLines = [];
        for (const statement of statements) {
            const nativeJS = this.convertToNativeJS(statement);
            if (nativeJS) {
                jsLines.push('  ' + nativeJS); // Add indentation
            }
        }
        return jsLines.join('\n');
    }

    /**
     * Convert plain JavaScript object to JavaScript syntax
     * This handles objects that have already been deserialized from Prism AST
     */
    convertPlainObjectToJS(obj) {
        if (typeof obj === 'string') return `"${obj}"`;
        if (typeof obj === 'number') return String(obj);
        if (typeof obj === 'boolean') return String(obj);
        if (obj === null || obj === undefined) return 'null';
        
        if (Array.isArray(obj)) {
            const elements = obj.map(element => this.convertPlainObjectToJS(element));
            return `[${elements.join(', ')}]`;
        }
        
        if (typeof obj === 'object') {
            const props = Object.keys(obj).map(key => {
                const value = this.convertPlainObjectToJS(obj[key]);
                return `${key}: ${value}`;
            });
            return `{${props.join(', ')}}`;
        }
        
        return String(obj);
    }

    // Fallback parser methods for compatibility
    
    /**
     * Handle fallback assignment format
     */
    generateFallbackAssignment(node) {
        const target = node.target;
        const value = this.parseFallbackValue(node.value);
        return `const ${target} = ${value};`;
    }

    /**
     * Handle fallback method call format
     */
    generateFallbackMethodCall(node) {
        const method = node.method;
        const args = node.arguments;
        
        if (method === 'puts') {
            return `puts(${args});`;
        }
        
        return `${method}(${args});`;
    }

    /**
     * Handle fallback function definition format
     */
    generateFallbackFunctionDefinition(node) {
        const name = node.name;
        const params = node.parameters.replace(/[()]/g, '');
        return `function ${name}(${params}) {`;
    }

    /**
     * Handle fallback class definition format
     */
    generateFallbackClassDefinition(node) {
        const name = node.name;
        const superclass = node.superclass ? ` extends ${node.superclass}` : '';
        return `class ${name}${superclass} {`;
    }

    /**
     * Handle fallback generic statement format
     */
    generateFallbackStatement(node) {
        const content = node.content;
        
        // Handle puts statements
        if (content.startsWith('puts ')) {
            const message = content.substring(5);
            return `puts(${message});`;
        }
        
        // Handle end statements
        if (content === 'end') {
            return '}';
        }
        
        // Return content as-is for now
        return `// ${content}`;
    }

    /**
     * Parse fallback value format
     */
    parseFallbackValue(value) {
        if (!value) return 'null';
        
        // Handle A.new(...) calls
        if (value.includes('A.new(')) {
            return value.replace('A.new(', 'new A(');
        }
        
        // Handle string literals
        if (value.startsWith('"') && value.endsWith('"')) {
            return value;
        }
        
        // Handle numbers
        if (!isNaN(value)) {
            return value;
        }
        
        // Handle boolean values
        if (value === 'true' || value === 'false') {
            return value;
        }
        
        // Handle nil
        if (value === 'nil') {
            return 'null';
        }
        
        // Default: return as-is (might be a variable reference)
        return value;
    }

    /**
     * Generate block content from block node
     */
    generateBlockContent(blockNode) {
        if (!blockNode) {
            return '  // Empty block';
        }

        let statements = [];
        
        // Handle different block body structures
        if (blockNode.body) {
            if (Array.isArray(blockNode.body)) {
                statements = blockNode.body;
            } else if (blockNode.body.body && Array.isArray(blockNode.body.body)) {
                statements = blockNode.body.body;
            } else {
                statements = [blockNode.body];
            }
        }

        // Generate JavaScript for each statement in the block
        const jsLines = statements.map(stmt => {
            const js = this.convertToNativeJS(stmt);
            return js ? `  ${js}` : null;
        }).filter(Boolean);

        return jsLines.length > 0 ? jsLines.join('\n') : '  // Empty block';
    }
}

// Export and global assignment for compatibility
export default NativeCodeGenerator;

if (typeof window !== 'undefined') {
    window.NativeCodeGenerator = NativeCodeGenerator;
}
