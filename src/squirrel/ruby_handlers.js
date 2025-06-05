/**
 * 🎯 RUBY HANDLERS
 * Gestionnaires pour la transpilation Ruby vers JavaScript
 * Version optimisée
 */

class RubyHandlers {
    constructor(codeGenerator) {
        this.codeGenerator = codeGenerator;
        this.transpileNodeMethod = null;
    }

    /**
     * 🔧 SET TRANSPILE NODE METHOD
     */
    setTranspileNodeMethod(transpileNodeMethod) {
        this.transpileNodeMethod = transpileNodeMethod;
    }

    /**
     * 🎯 TRANSPILE NODE
     */
    transpileNode(node) {
        if (this.transpileNodeMethod) {
            return this.transpileNodeMethod(node);
        } else {
            return this.transpileNodeLocal(node);
        }
    }

    /**
     * 🎯 LOCAL TRANSPILE NODE METHOD (FALLBACK)
     */
    transpileNodeLocal(node) {
        if (!node || typeof node !== 'object') {
            return null;
        }
        
        const nodeType = node.type || 'UnknownNode';
        
        // Delegate to appropriate handler
        switch (nodeType) {
            case 'ProgramNode':
                return this.transpileProgramNode(node);
            case 'StatementsNode':
                return this.transpileStatementsNode(node);
            case 'LocalVariableWriteNode':
                return this.transpileLocalVariableWrite(node);
            case 'LocalVariableReadNode':
                return this.transpileLocalVariableRead(node);
            case 'CallNode':
                return this.transpileCallNode(node);
            case 'StringNode':
                return this.transpileStringNode(node);
            case 'IntegerNode':
                return this.transpileIntegerNode(node);
            case 'FloatNode':
                return this.transpileFloatNode(node);
            case 'HashNode':
                return this.transpileHashNode(node);
            case 'ArrayNode':
                return this.transpileArrayNode(node);
            case 'ArgumentsNode':
                return this.transpileArgumentsNode(node);
            case 'BlockNode':
                return this.transpileBlockNode(node);
            case 'IfNode':
                return this.transpileIfNode(node);
            case 'ConstantReadNode':
                return this.transpileConstantReadNode(node);
            case 'SymbolNode':
                return this.transpileSymbolNode(node);
            case 'TrueNode':
                return 'true';
            case 'FalseNode':
                return 'false';
            case 'NilNode':
                return 'null';
            case 'AssocNode':
                return this.transpileAssocNode(node);
            case 'BeginNode':
                return this.transpileBeginNode(node);
            default:
                console.warn(`⚠️ Unknown node type: ${nodeType}`, node);
                return this.transpileUnknownNode(node);
        }
    }

    /**
     * 📋 TRANSPILE PROGRAM NODE
     */
    transpileProgramNode(node) {
        // Transpiling ProgramNode
        
        if (node.body && Array.isArray(node.body)) {
            return node.body.map(child => this.transpileNode(child)).filter(Boolean).join('\n');
        }
        
        return '// Empty program';
    }

    /**
     * 📋 TRANSPILE STATEMENTS NODE
     */
    transpileStatementsNode(node) {
        // Transpiling StatementsNode
        
        if (node.body && Array.isArray(node.body)) {
            return node.body.map(child => this.transpileNode(child)).filter(Boolean).join('\n');
        }
        
        return '';
    }

    /**
     * 📝 TRANSPILE LOCAL VARIABLE WRITE (UPDATED FOR REAL PRISM NODES)
     */
    transpileLocalVariableWrite(node) {
        // Transpiling LocalVariableWriteNode with Real Prism properties
        
        // With real Prism nodes, we should have the 'name' property directly
        let varName = node.name;
        
        if (!varName) {
            // Fallback for mock nodes
            if (node.source_line) {
                const match = node.source_line.match(/^\s*(\w+)\s*=/);
                if (match) {
                    varName = match[1];
                }
            }
        }
        
        if (!varName) {
            console.warn('❌ Could not extract variable name from LocalVariableWriteNode');
            return `// Could not extract variable name from: ${JSON.stringify(node)}`;
        }
        
        // Found variable name
        
        // Handle the value with real Prism nodes
        if (node.value) {
            const valueJS = this.transpileNode(node.value);
            if (valueJS && !valueJS.startsWith('//')) {
                const result = `const ${varName} = ${valueJS};`;
                // Generated assignment
                return result;
            }
        }
        
        // Fallback
        const fallback = `const ${varName} = undefined; // Could not transpile value`;
        // Using fallback assignment
        return fallback;
    }

    /**
     * 📖 TRANSPILE LOCAL VARIABLE READ
     */
    transpileLocalVariableRead(node) {
        // Transpiling LocalVariableReadNode
        
        if (node.name) {
            return String(node.name);
        }
        
        if (node.source_line) {
            return node.source_line.trim();
        }
        
        return 'undefined';
    }

    /**
     * 📞 TRANSPILE CALL NODE (UPDATED FOR REAL PRISM NODES)
     */
    transpileCallNode(node) {
        // Transpiling CallNode with Real Prism properties
        
        // With real Prism nodes, we should have the 'name' property directly
        let methodName = node.name;
        
        if (!methodName) {
            // Fallback for mock nodes
            if (node.source_line) {
                const line = node.source_line.trim();
                const methodMatch = line.match(/^(\w+)/) || line.match(/\.(\w+)/);
                if (methodMatch) {
                    methodName = methodMatch[1];
                }
            }
        }
        
        if (!methodName) {
            console.warn('❌ Could not extract method name from CallNode');
            if (node.source_line) {
                return `// Call from source: ${node.source_line}`;
            }
            return null;
        }
        

        
        // PUTS STATEMENTS
        if (methodName === 'puts') {
            return this.handlePutsStatement(node);
        }
        
        // WAIT STATEMENTS
        if (methodName === 'wait') {
            return this.handleWaitStatement(node);
        }
        
        // A.new CALLS
        if (methodName === 'new' && node.receiver?.name === 'A') {
            return this.handleANewCall(node);
        }
        
        // METHOD CALLS WITH RECEIVER
        if (node.receiver) {
            return this.handleMethodCallWithReceiver(node, methodName);
        }
        
        // STANDALONE METHOD CALLS
        return this.handleStandaloneMethodCall(node, methodName);
    }

    /**
     * 🆕 HANDLE A.new CALL (NEW)
     */
    handleANewCall(node) {

        
        let args = '';
        if (node.arguments && node.arguments.arguments) {
            const argList = node.arguments.arguments.map(arg => this.transpileNode(arg)).filter(Boolean);
            args = argList.join(', ');
        }
        
        const result = `new A(${args})`;

        return result;
    }

    /**
     * 🎯 HANDLE PUTS STATEMENT
     */
    handlePutsStatement(node) {

        
        let args = [];
        if (node.arguments && node.arguments.arguments) {
            args = node.arguments.arguments.map(arg => this.transpileNode(arg)).filter(Boolean);
        } else if (node.source_line) {
            // Extract arguments from source line
            const match = node.source_line.match(/puts\s+(.+)/);
            if (match) {
                args = [this.convertRubyValueToJS(match[1].trim())];
            }
        }
        
        const result = `puts(${args.join(', ')});`;

        return result;
    }

    /**
     * ⏰ HANDLE WAIT STATEMENT
     */
    handleWaitStatement(node) {

        let delay = '1000';
        
        if (node.arguments && node.arguments.arguments && node.arguments.arguments.length > 0) {
            const delayArg = node.arguments.arguments[0];
            delay = this.transpileNode(delayArg) || '1000';
        }
        
        if (node.block) {
            const blockCode = this.transpileBlockNode(node.block);
            const result = `wait(${delay}, function() {\n${blockCode}\n});`;

            return result;
        } else {
            const result = `setTimeout(function() {\n  // Empty wait block\n}, ${delay});`;

            return result;
        }
    }

    /**
     * 🎯 HANDLE METHOD CALL WITH RECEIVER
     */
    handleMethodCallWithReceiver(node, methodName) {

        
        const receiver = this.transpileNode(node.receiver) || 'this';
        
        // Method calls with blocks
        if (node.block) {
            const blockCode = this.transpileBlockNode(node.block);
            
            let blockParams = '';
            if (node.block.parameters && node.block.parameters.length > 0) {
                blockParams = node.block.parameters.join(', ');
            } else if (methodName === 'keyboard') {
                blockParams = 'key';
            } else if (['onclick', 'onmouseover', 'onmouseout'].includes(methodName)) {
                blockParams = 'event';
            }
            
            const result = `${receiver}.${methodName}(function(${blockParams}) {\n${blockCode}\n});`;

            return result;
        }
        
        // Arguments for methods
        let args = '';
        if (node.arguments && node.arguments.arguments) {
            const argList = node.arguments.arguments.map(arg => this.transpileNode(arg)).filter(Boolean);
            args = argList.join(', ');
        }
        
        const result = `${receiver}.${methodName}(${args});`;

        return result;
    }

    /**
     * 🎯 HANDLE STANDALONE METHOD CALL
     */
    handleStandaloneMethodCall(node, methodName) {

        
        let args = '';
        if (node.arguments && node.arguments.arguments) {
            const argList = node.arguments.arguments.map(arg => this.transpileNode(arg)).filter(Boolean);
            args = argList.join(', ');
        }
        
        const result = `${methodName}(${args});`;

        return result;
    }

    /**
     * 📄 TRANSPILE STRING NODE
     */
    transpileStringNode(node) {

        
        let value = '';
        
        // Try different ways to get string value
        if (node.value !== undefined) {
            value = node.value;
        } else if (node.unescaped !== undefined) {
            value = node.unescaped;
        } else if (node.content !== undefined) {
            value = node.content;
        } else if (node.source_line) {
            // Extract string from source line
            const match = node.source_line.match(/["']([^"']*)["']/);
            if (match) {
                value = match[1];
            }
        }
        

        
        // Handle Ruby string interpolation #{...} → ${...}
        if (value.includes('#{')) {
            value = value.replace(/#{([^}]+)}/g, '${$1}');
            return `\`${value}\``;
        }
        
        return `"${value}"`;
    }

    /**
     * 🔢 TRANSPILE INTEGER NODE
     */
    transpileIntegerNode(node) {

        
        if (node.value !== undefined) {
            return String(node.value);
        }
        
        if (node.source_line) {
            const match = node.source_line.match(/\d+/);
            if (match) {
                return match[0];
            }
        }
        
        return '0';
    }

    /**
     * 🔢 TRANSPILE FLOAT NODE
     */
    transpileFloatNode(node) {
        return String(node.value || 0.0);
    }

    /**
     * 📦 TRANSPILE ARGUMENTS NODE
     */
    transpileArgumentsNode(node) {

        
        if (node.arguments && Array.isArray(node.arguments)) {
            return node.arguments.map(arg => this.transpileNode(arg)).filter(Boolean).join(', ');
        }
        
        return '';
    }

    /**
     * 📦 TRANSPILE HASH NODE
     */
    transpileHashNode(node) {

        
        // For hash nodes, try to find elements/pairs/content
        let elements = null;
        
        if (node.elements) {
            elements = node.elements;
        } else if (node.pairs) {
            elements = node.pairs;
        } else if (node.content) {
            elements = node.content;
        }
        
        if (elements && Array.isArray(elements)) {
            const properties = elements.map(element => {
                if (element.key && element.value) {
                    const key = this.transpileNode(element.key);
                    const value = this.transpileNode(element.value);
                    return `  ${key}: ${value}`;
                }
                return null;
            }).filter(Boolean);
            
            return `{\n${properties.join(',\n')}\n}`;
        }
        
        return '{}';
    }

    /**
     * 📚 TRANSPILE ARRAY NODE
     */
    transpileArrayNode(node) {

        
        if (node.elements && Array.isArray(node.elements)) {
            const elements = node.elements.map(el => this.transpileNode(el)).filter(Boolean);
            return `[${elements.join(', ')}]`;
        }
        
        return '[]';
    }

    /**
     * 📋 TRANSPILE CONSTANT READ NODE
     */
    transpileConstantReadNode(node) {
        return node.name || 'UnknownConstant';
    }

    /**
     * 🔣 TRANSPILE SYMBOL NODE
     */
    transpileSymbolNode(node) {
        // Ruby symbols become strings in JavaScript
        return `"${node.value || node.name || ''}"`;
    }

    /**
     * 🔗 TRANSPILE ASSOC NODE (for hash key-value pairs)
     */
    transpileAssocNode(node) {
        const key = node.key ? this.transpileNode(node.key) : 'null';
        const value = node.value ? this.transpileNode(node.value) : 'null';
        return `${key}: ${value}`;
    }

    /**
     * 🎯 TRANSPILE BEGIN NODE
     */
    transpileBeginNode(node) {
        if (node.statements) {
            return this.transpileNode(node.statements);
        }
        return '';
    }

    /**
     * 🧱 TRANSPILE BLOCK NODE
     */
    transpileBlockNode(node) {
        if (!node) {
            return '';
        }
        
        // Handle block body
        if (node.body) {
            // If body is a StatementsNode or has body array
            if (node.body.body && Array.isArray(node.body.body)) {
                return node.body.body.map(stmt => this.transpileNode(stmt)).filter(Boolean).join('\n');
            }
            // If body is directly an array
            else if (Array.isArray(node.body)) {
                return node.body.map(stmt => this.transpileNode(stmt)).filter(Boolean).join('\n');
            }
            // Single statement
            else {
                return this.transpileNode(node.body);
            }
        }
        
        return '';
    }

    /**
     * ❓ TRANSPILE UNKNOWN NODE
     */
    transpileUnknownNode(node) {

        
        if (node.source_line) {
            const line = node.source_line.trim();
            
            // Try to handle some common Ruby patterns
            if (line.includes('=') && !line.includes('==')) {
                // Variable assignment
                return this.convertRubyAssignmentToJS(line);
            } else if (line.match(/^\w+\s*\(/)) {
                // Method call
                return this.convertRubyMethodCallToJS(line);
            }
            
            return `// Unknown Ruby: ${line}`;
        }
        
        return `// Unknown node type: ${node.type || 'undefined'}`;
    }

    /**
     * 🧹 HELPER METHODS
     */
    cleanCondition(condition) {
        let cleaned = String(condition).trim();
        
        // Replace Ruby operators
        cleaned = cleaned.replace(/\band\b/g, '&&');
        cleaned = cleaned.replace(/\bor\b/g, '||');
        cleaned = cleaned.replace(/\bnot\b/g, '!');
        
        // Fix key.ctrl to key.ctrlKey
        cleaned = cleaned.replace(/key\.ctrl/g, 'key.ctrlKey');
        
        // Ensure comparisons use ===
        cleaned = cleaned.replace(/([^=!])={1}([^=])/g, '$1===$2');
        
        return cleaned;
    }

    convertRubyAssignmentToJS(line) {
        let jsLine = line
            .replace(/(\w+)\s*=/, 'const $1 =')
            .replace(/=>/g, ':')
            .replace(/\btrue\b/g, 'true')
            .replace(/\bfalse\b/g, 'false')
            .replace(/\bnil\b/g, 'null');
        
        if (!jsLine.endsWith(';')) {
            jsLine += ';';
        }
        
        return jsLine;
    }

    convertRubyMethodCallToJS(line) {
        let jsLine = line
            .replace(/\bputs\s+/, 'puts(')
            .replace(/\bprint\s+/, 'print(');
        
        if (!jsLine.endsWith(')')) {
            jsLine += ')';
        }
        
        if (!jsLine.endsWith(';')) {
            jsLine += ';';
        }
        
        return jsLine;
    }
}

// Export and global assignment for compatibility
export default RubyHandlers;

if (typeof window !== 'undefined') {
    window.RubyHandlers = RubyHandlers;
}