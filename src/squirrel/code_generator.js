/**
 * 🧹 CLEAN CODE GENERATOR
 * Works with REAL Prism nodes that have proper JavaScript properties
 */

class CleanCodeGenerator {
    constructor() {
        console.log('🧹 Clean Code Generator initialized');
    }

    /**
     * 🎯 GENERATE COMPLETE JAVASCRIPT FROM REAL PRISM NODES
     */
    generateFromRealNodes(statements) {
        const jsStatements = [];
        
        for (const statement of statements) {
            const jsCode = this.convertStatement(statement);
            if (jsCode) {
                jsStatements.push(jsCode);
            }
        }
        
        return jsStatements.join('\n');
    }

    /**
     * 🔄 CONVERT SINGLE STATEMENT
     */
    convertStatement(node) {
        if (!node || !node.type) return null;
        
        switch (node.type) {
            case 'LocalVariableWriteNode':
                return this.convertVariableAssignment(node);
            case 'CallNode':
                return this.convertMethodCall(node);
            default:
                console.log(`⚠️ Unknown node type: ${node.type}`);
                return null;
        }
    }

    /**
     * 📝 CONVERT VARIABLE ASSIGNMENT
     */
    convertVariableAssignment(node) {
        const varName = node.name;
        const valueJS = this.convertNode(node.value);
        
        return `const ${varName} = ${valueJS};`;
    }

    /**
     * 📞 CONVERT METHOD CALL
     */
    convertMethodCall(node) {
        const methodName = node.name;
        
        // Handle puts statements
        if (methodName === 'puts') {
            const args = this.convertArguments(node.arguments);
            return `puts(${args});`;
        }
        
        // Handle A.new calls
        if (methodName === 'new' && node.receiver?.name === 'A') {
            const args = this.convertArguments(node.arguments);
            return `new A(${args})`;
        }
        
        // Handle wait calls with blocks
        if (methodName === 'wait') {
            const args = this.convertArguments(node.arguments);
            if (node.block) {
                const blockCode = this.convertBlock(node.block);
                return `wait(${args}, function() {\n${blockCode}\n});`;
            }
            return `wait(${args});`;
        }
        
        // Generic method call
        const args = this.convertArguments(node.arguments);
        const receiver = node.receiver ? this.convertNode(node.receiver) : '';
        
        if (receiver) {
            return `${receiver}.${methodName}(${args});`;
        } else {
            return `${methodName}(${args});`;
        }
    }

    /**
     * 📦 CONVERT ARGUMENTS
     */
    convertArguments(argsNode) {
        if (!argsNode || !argsNode.arguments) return '';
        
        const argStrings = argsNode.arguments.map(arg => this.convertNode(arg));
        return argStrings.join(', ');
    }

    /**
     * 🎭 CONVERT BLOCK
     */
    convertBlock(blockNode) {
        if (!blockNode || !blockNode.body) return '  // Empty block';
        
        const statements = blockNode.body.map(stmt => {
            const jsLine = this.convertStatement(stmt);
            return jsLine ? `  ${jsLine}` : null;
        }).filter(Boolean);
        
        return statements.join('\n');
    }

    /**
     * 🔄 CONVERT ANY NODE
     */
    convertNode(node) {
        if (!node || !node.type) return 'null';
        
        switch (node.type) {
            case 'StringNode':
                return `"${node.value}"`;
                
            case 'IntegerNode':
                return String(node.value);
                
            case 'TrueNode':
                return 'true';
                
            case 'FalseNode':
                return 'false';
                
            case 'HashNode':
                return this.convertHash(node);
                
            case 'ArrayNode':
                return this.convertArray(node);
                
            case 'ConstantReadNode':
                return node.name;
                
            case 'LocalVariableReadNode':
                return node.name;
                
            case 'CallNode':
                return this.convertMethodCall(node);
                
            default:
                console.log(`⚠️ Unknown node type in convertNode: ${node.type}`);
                return JSON.stringify(node);
        }
    }

    /**
     * 📦 CONVERT HASH NODE
     */
    convertHash(hashNode) {
        if (!hashNode.elements || hashNode.elements.length === 0) {
            return '{}';
        }
        
        const properties = hashNode.elements.map(element => {
            if (element.type === 'AssocNode') {
                const key = this.convertHashKey(element.key);
                const value = this.convertHashValue(element.value);
                
                // Handle special key mappings
                if (key === 'contenteditable') {
                    return `attrContenteditable: ${value}`;
                }
                
                return `${key}: ${value}`;
            }
            return null;
        }).filter(Boolean);
        
        return `{\n  ${properties.join(',\n  ')}\n}`;
    }

    /**
     * 🔑 CONVERT HASH KEY
     */
    convertHashKey(keyNode) {
        if (keyNode.type === 'SymbolNode') {
            return keyNode.value;
        }
        return this.convertNode(keyNode);
    }

    /**
     * 💎 CONVERT HASH VALUE - THE KEY FIX!
     */
    convertHashValue(valueNode) {
        // This is where the magic happens!
        // If the value is already a JavaScript object (from our real parser),
        // convert it properly instead of treating it as a string
        
        if (typeof valueNode === 'object' && valueNode !== null && !valueNode.type) {
            // It's a raw JavaScript object (like color: {red: 0, green: 0, blue: 0})
            return this.convertRawJavaScriptObject(valueNode);
        }
        
        // It's a Prism node, convert normally
        return this.convertNode(valueNode);
    }

    /**
     * 🎨 CONVERT RAW JAVASCRIPT OBJECT
     */
    convertRawJavaScriptObject(obj) {
        if (Array.isArray(obj)) {
            const elements = obj.map(item => this.convertRawJavaScriptObject(item));
            return `[${elements.join(', ')}]`;
        }
        
        if (typeof obj === 'object' && obj !== null) {
            const properties = Object.entries(obj).map(([key, value]) => {
                const jsValue = this.convertRawJavaScriptObject(value);
                return `${key}: ${jsValue}`;
            });
            return `{ ${properties.join(', ')} }`;
        }
        
        if (typeof obj === 'string') {
            return `"${obj}"`;
        }
        
        return String(obj);
    }

    /**
     * 📚 CONVERT ARRAY NODE
     */
    convertArray(arrayNode) {
        if (!arrayNode.elements || arrayNode.elements.length === 0) {
            return '[]';
        }
        
        const elements = arrayNode.elements.map(element => {
            // Handle raw JavaScript objects in arrays (like shadow array)
            if (typeof element === 'object' && element !== null && !element.type) {
                return this.convertRawJavaScriptObject(element);
            }
            return this.convertNode(element);
        });
        
        return `[${elements.join(', ')}]`;
    }
}

// Export and global assignment for compatibility
export default CleanCodeGenerator;

// Global export
if (typeof window !== 'undefined') {
    window.CleanCodeGenerator = CleanCodeGenerator;
    window.CodeGenerator = CleanCodeGenerator; // Alias
    console.log('✅ Code Generator ES6 module ready');
}