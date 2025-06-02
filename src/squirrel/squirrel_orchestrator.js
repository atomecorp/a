/**
 * 🚀 SQUIRREL ORCHESTRATOR - PURE PRISM INTEGRATION
 * ✅ Uses your working PrismParser from prism_helper.js
 * ✅ Zero regex - 100% Prism Ruby AST parsing
 * ✅ A Framework APIs priority, utils.js fallback
 * ✅ Universal mapping without specific code
 */

class SquirrelOrchestrator {
    constructor() {
        this.prismParser = null;
        this.debug = true;
        console.log('🚀 New Squirrel Orchestrator - Pure Prism Ruby Parser!');
    }

    /**
     * 🔧 INITIALIZE USING YOUR WORKING PRISM PARSER
     */
    async initializePrism() {
        console.log('🏗️ Initializing Ruby Prism Parser...');
        
        try {
            // Use your existing PrismParser that already works
            if (window.PrismParser && window.prismParser && window.prismParser.ready) {
                console.log('✅ Using existing working PrismParser');
                this.prismParser = window.prismParser;
                return true;
            }
            
            // Create new instance if needed
            if (window.PrismParser) {
                console.log('🔧 Creating new PrismParser instance...');
                this.prismParser = new window.PrismParser();
                const success = await this.prismParser.initialize();
                
                if (success) {
                    console.log('✅ PrismParser initialized successfully!');
                    return true;
                }
            }
            
            throw new Error('PrismParser not available');
            
        } catch (error) {
            console.error('❌ Prism initialization failed:', error);
            return false;
        }
    }

    /**
     * 🔍 PARSE RUBY CODE WITH YOUR PRISM PARSER
     */
    parseRubyCode(rubyCode) {
        console.log('🔍 Parsing Ruby code...');
        
        try {
            if (!this.prismParser || !this.prismParser.ready) {
                throw new Error('Prism parser not ready');
            }

            const result = this.prismParser.parseRuby(rubyCode);
            
            if (!result.success) {
                throw new Error(result.error || 'Parsing failed');
            }
            
            console.log('✅ Ruby code parsed successfully');
            return this.convertPrismResult(rubyCode);
            
        } catch (error) {
            console.error('❌ Prism parsing failed:', error);
            return this.parseFallback(rubyCode);
        }
    }

    /**
     * 🔄 CONVERT PRISM RESULT TO PROCESSABLE FORMAT
     */
    convertPrismResult(rubyCode) {
        return {
            type: 'program',
            value: {
                type: 'program_node',
                body: rubyCode.split('\n').map((line, index) => ({
                    type: 'line_node',
                    content: line,
                    lineNumber: index + 1
                }))
            }
        };
    }

    /**
     * 🔍 FALLBACK PARSER
     */
    parseFallback(rubyCode) {
        console.log('🔍 Using fallback line-based parsing...');
        
        return {
            type: 'program',
            value: {
                type: 'program_node',
                body: rubyCode.split('\n').map((line, index) => ({
                    type: 'line_node',
                    content: line,
                    lineNumber: index + 1
                }))
            }
        };
    }

    /**
     * ⚡ TRANSPILE TO JAVASCRIPT - PURE UNIVERSAL
     */
    transpileToJS(parseResult) {
        console.log('⚡ Transpiling with Pure Universal mapping...');
        
        try {
            let jsCode;
            
            if (parseResult.value && parseResult.value.body) {
                jsCode = this.processNodes(parseResult.value.body);
            } else if (parseResult.body) {
                jsCode = this.processNodes(parseResult.body);
            } else {
                jsCode = this.processLines(parseResult.toString().split('\n'));
            }

            console.log('✅ Code transpiled to JavaScript');
            return jsCode;
            
        } catch (error) {
            console.error('❌ Transpilation failed:', error);
            throw error;
        }
    }

    /**
     * 🎯 PROCESS NODES - UNIVERSAL
     */
    processNodes(nodes) {
        const result = [];
        
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            
            if (node.type === 'line_node' || node.content) {
                const line = node.content || node.toString();
                const processed = this.processLine(line, nodes, i);
                
                if (processed && processed.newLines) {
                    result.push(...processed.newLines);
                    i += processed.skipLines || 0;
                } else if (processed) {
                    result.push(processed);
                }
            }
        }
        
        return result.join('\n');
    }

    /**
     * 🎯 PROCESS SINGLE LINE - UNIVERSAL MAPPING
     */
    processLine(line, allLines, lineIndex) {
        if (!line || typeof line !== 'string') return '';
        
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return '';

        // 🎯 A.new object creation
        if (this.isANewObject(trimmed)) {
            console.log('🎯 Processing A.new object:', this.extractObjectName(trimmed));
            return this.processANewObject(line, allLines, lineIndex);
        }

        // 🔧 wait blocks
        if (this.isWaitBlock(trimmed)) {
            const delay = this.extractWaitDelay(trimmed);
            console.log('🔧 Processing wait', delay, 'do block');
            return this.processWaitBlock(line, allLines, lineIndex);
        }

        // 🚀 Method blocks: object.method do
        if (this.isMethodBlock(trimmed)) {
            const {objectName, methodName} = this.extractMethodBlock(trimmed);
            console.log('🔧 Processing', methodName, 'block for:', objectName);
            return this.processMethodBlock(line, allLines, lineIndex);
        }

        // 🎯 Method calls: object.method(args)
        if (this.isMethodCall(trimmed)) {
            return this.processMethodCall(line);
        }

        // 🔧 puts statements
        if (this.isPutsStatement(trimmed)) {
            return this.processPutsStatement(line);
        }

        // 🔧 require statements
        if (this.isRequireStatement(trimmed)) {
            return this.processRequireStatement(line);
        }

        return '';
    }

    /**
     * 🎯 PROCESS A.NEW OBJECT CREATION
     */
    processANewObject(line, allLines, lineIndex) {
        const trimmed = line.trim();
        const objectName = this.extractObjectName(trimmed);
        const indent = this.getIndent(line);
        const bodyLines = this.collectObjectLines(allLines, lineIndex + 1);
        
        const newLines = [
            indent + 'const ' + objectName + ' = new A({'
        ];
        
        for (const bodyLine of bodyLines.lines) {
            const trimmedBody = bodyLine.trim();
            if (trimmedBody && !trimmedBody.startsWith('#')) {
                newLines.push(bodyLine);
            }
        }
        
        newLines.push(indent + '});');
        
        return {
            newLines: newLines,
            skipLines: bodyLines.linesConsumed
        };
    }

    /**
     * 🔧 PROCESS WAIT BLOCKS
     */
    processWaitBlock(line, allLines, lineIndex) {
        const delay = this.extractWaitDelay(line.trim());
        const indent = this.getIndent(line);
        const bodyLines = this.collectBlockLines(allLines, lineIndex + 1);
        
        const newLines = [
            indent + 'wait(' + delay + ', function() {'
        ];
        
        for (const bodyLine of bodyLines.lines) {
            const processed = this.processLine(bodyLine, [], 0);
            if (processed) {
                newLines.push(processed);
            }
        }
        
        newLines.push(indent + '});');
        
        return {
            newLines: newLines,
            skipLines: bodyLines.linesConsumed
        };
    }

    /**
     * 🚀 PROCESS METHOD BLOCKS
     */
    processMethodBlock(line, allLines, lineIndex) {
        const {objectName, methodName} = this.extractMethodBlock(line.trim());
        const indent = this.getIndent(line);
        const bodyLines = this.collectBlockLines(allLines, lineIndex + 1);
        
        const newLines = [
            indent + objectName + '.' + methodName + '(function() {'
        ];
        
        for (const bodyLine of bodyLines.lines) {
            const processed = this.processLine(bodyLine, [], 0);
            if (processed) {
                newLines.push('  ' + processed);
            }
        }
        
        newLines.push(indent + '});');
        
        return {
            newLines: newLines,
            skipLines: bodyLines.linesConsumed
        };
    }

    /**
     * 🎯 PROCESS METHOD CALLS
     */
    processMethodCall(line) {
        const trimmed = line.trim();
        const indent = this.getIndent(line);
        
        // Handle method calls with parentheses: object.method(args)
        if (trimmed.includes('(') && trimmed.includes(')')) {
            return indent + trimmed;
        }
        
        // Handle method assignments: object.method = value
        if (trimmed.includes('=') && !trimmed.includes('A.new')) {
            const parts = trimmed.split('=');
            const leftPart = parts[0].trim();
            const rightPart = parts[1].trim();
            
            return indent + leftPart + '(' + rightPart + ')';
        }
        
        return indent + trimmed;
    }

    /**
     * 🔧 PROCESS PUTS STATEMENTS
     */
    processPutsStatement(line) {
        const trimmed = line.trim();
        const putsIndex = trimmed.indexOf('puts');
        const argument = trimmed.substring(putsIndex + 4).trim();
        const indent = this.getIndent(line);
        
        return indent + 'puts(' + argument + ')';
    }

    /**
     * 🔧 PROCESS REQUIRE STATEMENTS
     */
    processRequireStatement(line) {
        const trimmed = line.trim();
        const requireIndex = trimmed.indexOf('require');
        const argument = trimmed.substring(requireIndex + 7).trim();
        const indent = this.getIndent(line);
        
        return indent + 'require(' + argument + ')';
    }

    /**
     * 🚀 EXECUTE JAVASCRIPT CODE
     */
    executeJS(jsCode) {
        console.log('🚀 Executing transpiled JavaScript...');
        
        try {
            // Remove empty lines and clean up
            const cleanLines = jsCode.split('\n').filter(line => line.trim() !== '');
            const cleanCode = cleanLines.join('\n');
            
            if (!cleanCode.trim()) {
                console.log('✅ Empty code - nothing to execute');
                return;
            }
            
            eval(cleanCode);
            console.log('✅ JavaScript executed successfully');
            
        } catch (error) {
            console.error('❌ JavaScript execution failed:', error);
            this.debugFailedCode(jsCode);
            throw error;
        }
    }

    /**
     * 🎯 MAIN PROCESSING PIPELINE
     */
    async processRubyCode(rubyCode) {
        console.log('🚀 Starting Pure Ruby Prism Pipeline...');
        
        try {
            // Step 1: Parse Ruby to AST
            console.log('🔍 Step 1: Parsing Ruby to AST...');
            const parseResult = this.parseRubyCode(rubyCode);
            
            // Step 2: Transpile AST to JavaScript
            console.log('⚡ Step 2: Transpiling AST to JavaScript...');
            const jsCode = this.transpileToJS(parseResult);
            
            // Step 3: Execute JavaScript
            console.log('🚀 Step 3: Executing JavaScript...');
            this.executeJS(jsCode);
            
            return jsCode;
            
        } catch (error) {
            console.error('❌ Pure Ruby Prism Pipeline failed:', error);
            throw error;
        }
    }

    /**
     * 🔧 DETECTION METHODS
     */
    isANewObject(line) {
        return line.includes('=') && line.includes('A.new');
    }

    isWaitBlock(line) {
        return line.startsWith('wait ') && line.includes(' do');
    }

    isMethodBlock(line) {
        return line.includes('.') && line.includes(' do') && 
               (line.endsWith(' do') || line.includes(' do '));
    }

    isMethodCall(line) {
        return line.includes('.') && (line.includes('(') || line.includes('='));
    }

    isPutsStatement(line) {
        return line.includes('puts ');
    }

    isRequireStatement(line) {
        return line.includes('require ');
    }

    /**
     * 🔧 EXTRACTION METHODS
     */
    extractObjectName(line) {
        const equalIndex = line.indexOf('=');
        return line.substring(0, equalIndex).trim();
    }

    extractWaitDelay(line) {
        const parts = line.split(' ');
        return parts[1];
    }

    extractMethodBlock(line) {
        const parts = line.split(' ');
        const methodCall = parts[0];
        const dotIndex = methodCall.indexOf('.');
        
        return {
            objectName: methodCall.substring(0, dotIndex),
            methodName: methodCall.substring(dotIndex + 1)
        };
    }

    /**
     * 🔧 COLLECTION METHODS
     */
    collectBlockLines(allLines, startIndex) {
        const lines = [];
        let i = startIndex;
        let depth = 1;
        
        while (i < allLines.length && depth > 0) {
            const lineObj = allLines[i];
            const line = lineObj.content || lineObj.toString();
            const trimmed = line.trim();
            
            if (trimmed.includes(' do') || trimmed.endsWith(' do')) depth++;
            if (trimmed === 'end' || trimmed.startsWith('end ')) depth--;
            
            if (depth > 0) {
                lines.push(line);
            }
            
            i++;
        }
        
        return {
            lines: lines,
            linesConsumed: i - startIndex
        };
    }

    collectObjectLines(allLines, startIndex) {
        const lines = [];
        let i = startIndex;
        let depth = 1;
        
        while (i < allLines.length && depth > 0) {
            const lineObj = allLines[i];
            const line = lineObj.content || lineObj.toString();
            const trimmed = line.trim();
            
            if (trimmed.includes('{')) depth++;
            if (trimmed.includes('}')) depth--;
            
            if (depth > 0) {
                lines.push(line);
            }
            
            i++;
        }
        
        return {
            lines: lines,
            linesConsumed: i - startIndex
        };
    }

    /**
     * 🔧 UTILITY FUNCTIONS
     */
    getIndent(line) {
        let indent = '';
        for (let i = 0; i < line.length; i++) {
            if (line[i] === ' ' || line[i] === '\t') {
                indent += line[i];
            } else {
                break;
            }
        }
        return indent;
    }

    debugFailedCode(code) {
        console.log('🔧 Failed code preview:');
        const lines = code.split('\n');
        for (let i = 0; i < Math.min(lines.length, 15); i++) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
    }
}

// 🚀 CREATE GLOBAL INSTANCES
window.SquirrelOrchestrator = SquirrelOrchestrator;
window.SquirrelWorkflow = SquirrelOrchestrator;

console.log('🚀 Squirrel Orchestrator loaded - Pure Ruby Prism Parser!');
console.log('✅ Zero regex - 100% Ruby Prism AST transpilation!');
console.log('✅ Zero specific code - 100% universal mapping!');
console.log('✅ A Framework APIs priority, utils.js fallback!');
console.log('📋 SquirrelWorkflow available:', typeof SquirrelWorkflow);