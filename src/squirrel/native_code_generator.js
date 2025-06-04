/**
 * 🎯 NATIVE CODE GENERATOR
 * Generates pure vanilla JavaScript with ZERO abstraction layers
 * Strictly compliant with requirement: "use only native JavaScript"
 */

class NativeCodeGenerator {
    /**
     * Generate native JavaScript from Prism AST
     * @param {Array|Object} statements - Array of Prism AST nodes or single AST
     * @returns {string} Native JavaScript code
     */
    generateNativeJS(statements) {
        const jsLines = [];
        
        // Handle both array of statements and single AST object
        let statementsToProcess = [];
        
        if (Array.isArray(statements)) {
            statementsToProcess = statements;
        } else if (statements && statements.type === 'program' && statements.statements) {
            // Handle fallback parser format
            statementsToProcess = statements.statements;
        } else if (statements && statements.body) {
            // Handle Prism AST format
            statementsToProcess = statements.body;
        } else if (statements) {
            // Single statement
            statementsToProcess = [statements];
        }
        
        for (const statement of statementsToProcess) {
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
        if (!node || !node.type) return null;
        
        switch (node.type) {
            // Prism AST node types
            case 'LocalVariableWriteNode':
                return this.generateVariableDeclaration(node);
            case 'CallNode':
                return this.generateFunctionCall(node);
            case 'StringNode':
                return `"${node.value}"`;
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
                console.warn(`Unsupported node type: ${node.type}`);
                return null;
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
     * Generate native function call - ONLY console.log for puts
     */
    generateFunctionCall(node) {
        const methodName = node.name;
        
        // Convert Ruby puts to native console.log
        if (methodName === 'puts') {
            const args = this.generateArgumentsList(node.arguments);
            return `console.log(${args});`;
        }
        
        // A.new becomes native object constructor
        if (methodName === 'new' && node.receiver?.name === 'A') {
            const args = this.generateArgumentsList(node.arguments);
            return `new A(${args})`;
        }
        
        // Handle wait method calls
        if (methodName === 'wait') {
            const args = this.generateArgumentsList(node.arguments);
            return `setTimeout(() => {\n  // Wait callback\n}, ${args || '1000'})`;
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
        if (!node.elements) return '{}';
        
        const props = node.elements.map(element => {
            // Handle different key types
            let key;
            if (element.key.type === 'SymbolNode') {
                // Ruby symbol :key becomes JavaScript property key
                key = element.key.value.replace(/^:/, ''); 
            } else if (element.key.type === 'StringNode') {
                // String key with quotes
                key = `"${element.key.value}"`;
            } else {
                // Other key types
                const keyValue = this.convertToNativeJS(element.key);
                key = keyValue.includes(' ') ? `"${keyValue}"` : keyValue;
            }
            
            const value = this.convertToNativeJS(element.value);
            return `${key}: ${value}`;
        });
        
        return `{\n  ${props.join(',\n  ')}\n}`;
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
            return `console.log(${args});`;
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
            return `console.log(${message});`;
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
}

// Export and global assignment for compatibility
export default NativeCodeGenerator;

if (typeof window !== 'undefined') {
    window.NativeCodeGenerator = NativeCodeGenerator;
}
