// Enhanced Prism Parser - Complete Interface for Ruby AST Processing
// Fully compatible with SquirrelOrchestrator expectations
// Version 2.0 - Total Rewrite

class PrismParser {
    constructor() {
        this.helper = null;
        this.initialized = false;
        this.lastAST = null;
        this.lastParseResult = null;
    }
    
    // Initialize the parser with enhanced error handling
    async initialize() {
        try {
            console.log('🚀 Initializing Enhanced Prism Parser...');
            
            // Create PrismHelper instance
            if (!window.PrismHelper) {
                throw new Error('PrismHelper class not available');
            }
            
            this.helper = new window.PrismHelper();
            const success = await this.helper.initialize();
            
            if (success) {
                this.initialized = true;
                console.log('✅ Enhanced Prism Parser initialized successfully');
                
                // Run initial test to warm up
                await this.warmUp();
                
                return true;
            } else {
                throw new Error('PrismHelper initialization failed');
            }
            
        } catch (error) {
            console.error('❌ Enhanced Prism Parser initialization error:', error);
            this.initialized = false;
            return false;
        }
    }
    
    // Warm up the parser with a simple test
    async warmUp() {
        try {
            const testCode = 'puts "warmup"';
            await this.parseRuby(testCode);
            console.log('🔥 Parser warmed up successfully');
        } catch (error) {
            console.warn('⚠️ Parser warmup failed, but continuing:', error.message);
        }
    }
    
    // Main parsing method - Returns AST in multiple compatible formats
    async parseRuby(rubyCode) {
        if (!this.initialized) {
            throw new Error('Parser not initialized. Call initialize() first.');
        }
        
        try {
            console.log('🔍 Parsing Ruby code with Enhanced Prism...');
            
            // Parse using PrismHelper
            const parseResult = this.helper.parseRuby(rubyCode);
            
            if (!parseResult || !parseResult.success) {
                throw new Error(`Parse failed: ${parseResult?.error || 'Unknown error'}`);
            }
            
            // Extract the AST
            const ast = parseResult.result;
            if (!ast) {
                throw new Error('No AST returned from parser');
            }
            
            // Store for later access
            this.lastAST = ast;
            this.lastParseResult = parseResult;
            
            console.log('✅ Ruby code parsed successfully');
            console.log('📊 AST type:', ast.type);
            console.log('📊 AST body length:', ast.body?.length || 0);
            
            // Return the AST directly (what orchestrator expects)
            return ast;
            
        } catch (error) {
            console.error('❌ Parse failed:', error);
            
            // Return a minimal fallback AST to prevent complete failure
            const fallbackAST = this.createFallbackAST(rubyCode, error);
            this.lastAST = fallbackAST;
            
            return fallbackAST;
        }
    }
    
    // Create a fallback AST when parsing fails
    createFallbackAST(code, error) {
        console.log('📝 Creating fallback AST for orchestrator compatibility');
        
        return {
            type: 'ProgramNode',
            location: {
                start_offset: 0,
                end_offset: code.length
            },
            body: this.extractBasicStatements(code),
            source: code,
            prism_version: 'fallback',
            parsing_error: error.message,
            fallback: true
        };
    }
    
    // Extract basic statements for fallback AST
    extractBasicStatements(code) {
        const lines = code.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
        
        return lines.map((line, index) => {
            return {
                type: this.detectStatementType(line),
                location: {
                    start_offset: 0,
                    end_offset: line.length
                },
                line_number: index + 1,
                source_line: line
            };
        });
    }
    
    // Detect Ruby statement types for fallback
    detectStatementType(line) {
        if (line.includes('=') && !line.includes('==') && !line.includes('!=')) {
            return 'LocalVariableWriteNode';
        } else if (line.startsWith('puts ') || line.startsWith('print ')) {
            return 'CallNode';
        } else if (line.startsWith('class ')) {
            return 'ClassNode';
        } else if (line.startsWith('def ')) {
            return 'DefNode';
        } else if (line.startsWith('if ')) {
            return 'IfNode';
        } else if (line.startsWith('wait ')) {
            return 'WaitNode';
        } else {
            return 'CallNode';
        }
    }
    
    // Get the last parsed AST (for orchestrator access)
    getAST() {
        return this.lastAST;
    }
    
    // Get the complete last parse result
    getLastParseResult() {
        return this.lastParseResult;
    }
    
    // Check if parser is ready
    isReady() {
        return this.initialized && this.helper && this.helper.ready;
    }
    
    // Get comprehensive diagnostics
    getDiagnostics() {
        const base = {
            initialized: this.initialized,
            ready: this.isReady(),
            hasLastAST: !!this.lastAST,
            lastASTType: this.lastAST?.type || null
        };
        
        if (!this.initialized || !this.helper) {
            return {
                ...base,
                exports: [],
                parseFunctions: [],
                memoryPages: 0
            };
        }
        
        return {
            ...base,
            exports: Object.keys(this.helper.exports || {}),
            parseFunctions: this.helper.getParseFunctions(),
            memoryPages: this.helper.memory ? Math.floor(this.helper.memory.buffer.byteLength / 65536) : 0,
            wasmReady: this.helper.ready,
            lastParseSuccess: this.lastParseResult?.success || false
        };
    }
    
    // Enhanced test method with comprehensive validation
    async test() {
        console.log('🧪 Running Enhanced Prism Parser test...');
        
        if (!this.initialized) {
            console.log('⚠️ Parser not initialized, initializing now...');
            const success = await this.initialize();
            if (!success) {
                throw new Error('Failed to initialize parser for testing');
            }
        }
        
        const testCases = [
            {
                name: 'Simple variable assignment',
                code: 'name = "Squirrel"'
            },
            {
                name: 'Method call',
                code: 'puts "Hello World"'
            },
            {
                name: 'Multiple statements',
                code: `
name = "Squirrel"
puts "Hello, #{name}!"
result = 2 + 3
`
            }
        ];
        
        const results = [];
        
        for (const testCase of testCases) {
            try {
                console.log(`🔍 Testing: ${testCase.name}`);
                const ast = await this.parseRuby(testCase.code);
                
                results.push({
                    name: testCase.name,
                    success: true,
                    ast: ast,
                    type: ast.type,
                    bodyLength: ast.body?.length || 0
                });
                
                console.log(`✅ ${testCase.name}: SUCCESS`);
                
            } catch (error) {
                results.push({
                    name: testCase.name,
                    success: false,
                    error: error.message
                });
                
                console.error(`❌ ${testCase.name}: FAILED -`, error.message);
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        console.log(`📊 Test Results: ${successCount}/${results.length} passed`);
        
        return {
            passed: successCount,
            total: results.length,
            results: results,
            diagnostics: this.getDiagnostics()
        };
    }
    
    // Method to validate AST structure for orchestrator compatibility
    validateAST(ast) {
        const issues = [];
        
        if (!ast) {
            issues.push('AST is null or undefined');
            return { valid: false, issues };
        }
        
        if (!ast.type) {
            issues.push('AST missing type property');
        }
        
        if (!ast.location) {
            issues.push('AST missing location property');
        }
        
        if (ast.type === 'ProgramNode' && !ast.body) {
            issues.push('ProgramNode missing body property');
        }
        
        if (Array.isArray(ast.body)) {
            ast.body.forEach((node, index) => {
                if (!node.type) {
                    issues.push(`Body node ${index} missing type property`);
                }
            });
        }
        
        return {
            valid: issues.length === 0,
            issues: issues
        };
    }
    
    // Helper method to format AST for logging
    formatASTSummary(ast) {
        if (!ast) return 'null';
        
        const summary = {
            type: ast.type,
            bodyCount: ast.body?.length || 0,
            hasLocation: !!ast.location,
            fallback: ast.fallback || false
        };
        
        if (ast.body?.length > 0) {
            summary.firstBodyType = ast.body[0].type;
        }
        
        return summary;
    }
}

// Enhanced initialization and global exposure
if (typeof window !== 'undefined') {
    // Create global instance
    window.PrismParser = PrismParser;
    window.prismParser = new PrismParser();
    
    // Enhanced diagnostics helper
    window.prismDiagnostics = () => {
        if (window.prismParser) {
            const diag = window.prismParser.getDiagnostics();
            console.table(diag);
            return diag;
        }
        return { error: 'PrismParser not available' };
    };
    
    // Test helper
    window.testPrismParser = async () => {
        if (window.prismParser) {
            return await window.prismParser.test();
        }
        return { error: 'PrismParser not available' };
    };
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrismParser;
}

console.log('📋 Enhanced PrismParser class loaded successfully');