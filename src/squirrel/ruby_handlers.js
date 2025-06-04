/**
 * 🎯 RUBY HANDLERS
 * Now compatible with CleanCodeGenerator and Real Prism nodes
 * Version 3.0 - Real Prism Integration
 */

class RubyHandlers {
    constructor(codeGenerator) {
        this.codeGenerator = codeGenerator; // Can be CleanCodeGenerator or null
        this.transpileNodeMethod = null; // Will be set by TranspilerCore
        console.log('🎯 Ruby Handlers v3.0 initialized for Real Prism nodes');
    }

    /**
     * 🔧 SET TRANSPILE NODE METHOD (CALLED BY TRANSPILER CORE)
     */
    setTranspileNodeMethod(transpileNodeMethod) {
        this.transpileNodeMethod = transpileNodeMethod;
        console.log('✅ TranspileNode method set in RubyHandlers v3.0');
    }

    /**
     * 🎯 TRANSPILE NODE (USES INJECTED METHOD)
     */
    transpileNode(node) {
        if (this.transpileNodeMethod) {
            return this.transpileNodeMethod(node);
        } else {
            // Fallback to local method if not set yet
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
            default:
                return this.transpileUnknownNode(node);
        }
    }

    /**
     * 📋 TRANSPILE PROGRAM NODE
     */
    transpileProgramNode(node) {
        console.log('📋 Transpiling ProgramNode');
        
        if (node.body && Array.isArray(node.body)) {
            return node.body.map(child => this.transpileNode(child)).filter(Boolean).join('\n');
        }
        
        return '// Empty program';
    }

    /**
     * 📋 TRANSPILE STATEMENTS NODE
     */
    transpileStatementsNode(node) {
        console.log('📋 Transpiling StatementsNode');
        
        if (node.body && Array.isArray(node.body)) {
            return node.body.map(child => this.transpileNode(child)).filter(Boolean).join('\n');
        }
        
        return '';
    }

    /**
     * 📝 TRANSPILE LOCAL VARIABLE WRITE (UPDATED FOR REAL PRISM NODES)
     */
    transpileLocalVariableWrite(node) {
        console.log('📝 Transpiling LocalVariableWriteNode with Real Prism properties');
        console.log('📊 Real node structure:', {
            name: node.name,
            hasValue: !!node.value,
            valueType: node.value?.type,
            depth: node.depth,
            allProps: Object.keys(node)
        });
        
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
        
        console.log(`✅ Found variable name: ${varName}`);
        
        // Handle the value with real Prism nodes
        if (node.value) {
            const valueJS = this.transpileNode(node.value);
            if (valueJS && !valueJS.startsWith('//')) {
                const result = `const ${varName} = ${valueJS};`;
                console.log('✅ Generated assignment:', result);
                return result;
            }
        }
        
        // Fallback
        const fallback = `const ${varName} = undefined; // Could not transpile value`;
        console.log('⚠️ Using fallback assignment:', fallback);
        return fallback;
    }

    /**
     * 📖 TRANSPILE LOCAL VARIABLE READ
     */
    transpileLocalVariableRead(node) {
        console.log('📖 Transpiling LocalVariableReadNode');
        
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
        console.log('📞 Transpiling CallNode with Real Prism properties');
        console.log('📊 Real CallNode structure:', {
            name: node.name,
            hasReceiver: !!node.receiver,
            receiver: node.receiver?.name || node.receiver?.type,
            hasArguments: !!node.arguments,
            argumentCount: node.arguments?.arguments?.length || 0,
            hasBlock: !!node.block,
            flags: node.flags
        });
        
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
        
        console.log(`✅ Found method name: ${methodName}`);
        
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
        console.log('🆕 Processing A.new call');
        
        let args = '';
        if (node.arguments && node.arguments.arguments) {
            const argList = node.arguments.arguments.map(arg => this.transpileNode(arg)).filter(Boolean);
            args = argList.join(', ');
        }
        
        const result = `new A(${args})`;
        console.log('✅ Generated A.new:', result);
        return result;
    }

    /**
     * 🎯 HANDLE PUTS STATEMENT
     */
    handlePutsStatement(node) {
        console.log('🎯 Processing puts statement');
        
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
        console.log('✅ Generated puts:', result);
        return result;
    }

    /**
     * ⏰ HANDLE WAIT STATEMENT
     */
    handleWaitStatement(node) {
        console.log('🎯 Processing wait statement');
        let delay = '1000';
        
        if (node.arguments && node.arguments.arguments && node.arguments.arguments.length > 0) {
            const delayArg = node.arguments.arguments[0];
            delay = this.transpileNode(delayArg) || '1000';
        }
        
        if (node.block) {
            const blockCode = this.transpileBlockNode(node.block);
            const result = `wait(${delay}, function() {\n${blockCode}\n});`;
            console.log('✅ Generated wait with block:', result);
            return result;
        } else {
            const result = `setTimeout(function() {\n  // Empty wait block\n}, ${delay});`;
            console.log('✅ Generated empty wait:', result);
            return result;
        }
    }

    /**
     * 🎯 HANDLE METHOD CALL WITH RECEIVER
     */
    handleMethodCallWithReceiver(node, methodName) {
        console.log('🎯 Processing method call with receiver');
        
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
            console.log('✅ Generated method call with block:', result);
            return result;
        }
        
        // Arguments for methods
        let args = '';
        if (node.arguments && node.arguments.arguments) {
            const argList = node.arguments.arguments.map(arg => this.transpileNode(arg)).filter(Boolean);
            args = argList.join(', ');
        }
        
        const result = `${receiver}.${methodName}(${args});`;
        console.log('✅ Generated method call:', result);
        return result;
    }

    /**
     * 🎯 HANDLE STANDALONE METHOD CALL
     */
    handleStandaloneMethodCall(node, methodName) {
        console.log('🎯 Processing standalone method call');
        
        let args = '';
        if (node.arguments && node.arguments.arguments) {
            const argList = node.arguments.arguments.map(arg => this.transpileNode(arg)).filter(Boolean);
            args = argList.join(', ');
        }
        
        const result = `${methodName}(${args});`;
        console.log('✅ Generated standalone call:', result);
        return result;
    }

    /**
     * 📄 TRANSPILE STRING NODE
     */
    transpileStringNode(node) {
        console.log('📄 Transpiling StringNode');
        
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
        
        console.log('📄 String value:', value);
        
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
        console.log('🔢 Transpiling IntegerNode');
        
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
     * 📦 TRANSPILE ARGUMENTS NODE
     */
    transpileArgumentsNode(node) {
        console.log('📦 Transpiling ArgumentsNode');
        
        if (node.arguments && Array.isArray(node.arguments)) {
            return node.arguments.map(arg => this.transpileNode(arg)).filter(Boolean).join(', ');
        }
        
        return '';
    }

    /**
     * 📦 TRANSPILE HASH NODE
     */
    transpileHashNode(node) {
        console.log('📦 Transpiling HashNode');
        
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
        console.log('📚 Transpiling ArrayNode');
        
        if (node.elements && Array.isArray(node.elements)) {
            const elements = node.elements.map(el => this.transpileNode(el)).filter(Boolean);
            return `[${elements.join(', ')}]`;
        }
        
        return '[]';
    }

    /**
     * 🎭 TRANSPILE BLOCK NODE
     */
    transpileBlockNode(node) {
        console.log('🎭 Transpiling BlockNode');
        
        if (node.body && Array.isArray(node.body)) {
            const statements = node.body.map(stmt => {
                const jsLine = this.transpileNode(stmt);
                return jsLine ? `  ${jsLine}` : null;
            }).filter(Boolean);
            
            return statements.length > 0 ? statements.join('\n') : '  // Empty block';
        }
        
        return '  // Empty block';
    }

    /**
     * 🔀 TRANSPILE IF NODE
     */
    transpileIfNode(node) {
        console.log('🔀 Transpiling IfNode');
        
        if (!node.condition) {
            return '// Invalid if node: no condition';
        }
        
        let condition = this.transpileNode(node.condition) || 'true';
        condition = this.cleanCondition(condition);
        
        const thenBody = this.transpileNode(node.then_body) || '  // Empty then body';
        
        let result = `if (${condition}) {\n${thenBody}\n}`;
        
        if (node.else_body) {
            const elseBody = this.transpileNode(node.else_body);
            result += ` else {\n${elseBody}\n}`;
        }
        
        return result;
    }

    /**
     * ❓ TRANSPILE UNKNOWN NODE
     */
    transpileUnknownNode(node) {
        console.log('❓ Transpiling UnknownNode');
        
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
            .replace(/\bprint\s+/, 'console.log(');
        
        if (!jsLine.endsWith(')')) {
            jsLine += ')';
        }
        
        if (!jsLine.endsWith(';')) {
            jsLine += ';';
        }
        
        return jsLine;
    }

    convertRubyValueToJS(rubyValue) {
        const trimmed = rubyValue.trim();
        
        // Numbers
        if (/^\d+(\.\d+)?$/.test(trimmed)) {
            return trimmed;
        }
        
        // Booleans
        if (trimmed === 'true' || trimmed === 'false') {
            return trimmed;
        }
        
        // Default: treat as string
        return `"${trimmed}"`;
    }
}

// Export and global assignment for compatibility
export default RubyHandlers;

// Global export
if (typeof window !== 'undefined') {
    window.RubyHandlers = RubyHandlers;
    console.log('✅ Ruby Handlers ES6 module ready - Real Prism integration');
}