// Enhanced Prism Parser - Production Version
// Pure Ruby AST processing without tests
// Version 2.0 - Production Ready

class PrismParser {
    constructor() {
        this.helper = null;
        this.initialized = false;
        this.lastAST = null;
        this.lastParseResult = null;
    }
    
    // Initialize the parser
    async initialize() {
        try {
            console.log('🚀 Initializing Prism Parser...');
            
            if (!window.PrismHelper) {
                throw new Error('PrismHelper class not available');
            }
            
            this.helper = new window.PrismHelper();
            const success = await this.helper.initialize();
            
            if (success) {
                this.initialized = true;
                console.log('✅ Prism Parser initialized successfully');
                
                // Quick warmup
                await this.warmUp();
                
                return true;
            } else {
                throw new Error('PrismHelper initialization failed');
            }
            
        } catch (error) {
            console.error('❌ Prism Parser initialization error:', error);
            this.initialized = false;
            return false;
        }
    }
    
    // Warm up the parser
    async warmUp() {
        try {
            const testCode = 'puts "ready"';
            await this.parseRuby(testCode);
            console.log('🔥 Parser ready for production');
        } catch (error) {
            console.warn('⚠️ Parser warmup failed:', error.message);
        }
    }
    
    // Main parsing method - Returns AST directly
    async parseRuby(rubyCode) {
        if (!this.initialized) {
            throw new Error('Parser not initialized. Call initialize() first.');
        }
        
        try {
            console.log('🔍 Parsing Ruby code...');
            
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
            console.log(`📊 AST contains ${ast.body?.length || 0} nodes`);
            
            // Return the AST directly
            return ast;
            
        } catch (error) {
            console.error('❌ Parse failed:', error);
            
            // Return a minimal fallback AST
            const fallbackAST = this.createFallbackAST(rubyCode, error);
            this.lastAST = fallbackAST;
            
            return fallbackAST;
        }
    }
    
    // Create a fallback AST when parsing fails
    createFallbackAST(code, error) {
        console.log('📝 Creating fallback AST');
        
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
    
    // Get the last parsed AST
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
    
    // Get basic diagnostics
    getDiagnostics() {
        return {
            initialized: this.initialized,
            ready: this.isReady(),
            hasLastAST: !!this.lastAST,
            lastASTType: this.lastAST?.type || null,
            lastParseSuccess: this.lastParseResult?.success || false
        };
    }
}

// Enhanced initialization and global exposure
if (typeof window !== 'undefined') {
    window.PrismParser = PrismParser;
    window.prismParser = new PrismParser();
    
    // Simple diagnostics helper
    window.prismStatus = () => {
        if (window.prismParser) {
            const diag = window.prismParser.getDiagnostics();
            console.table(diag);
            return diag;
        }
        return { error: 'PrismParser not available' };
    };
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrismParser;
}

console.log('✅ PrismParser Production ready');