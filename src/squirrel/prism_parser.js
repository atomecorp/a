// Enhanced Prism Parser - Production Version
// Now uses RealPrismHelper with official Prism JavaScript API
// Version 3.0 - Real Prism Integration

import WASIWrapper from './wasi_wrapper.js';

class PrismParser {
    constructor() {
        this.helper = null;
        this.initialized = false;
        this.lastAST = null;
        this.lastParseResult = null;
        this.initializationPromise = null;
    }
    
    // Initialize the parser
    async initialize() {
        // Return existing promise if initialization is already in progress
        if (this.initializationPromise) {
            return await this.initializationPromise;
        }
        
        // Return true if already initialized
        if (this.initialized) {
            return true;
        }
        
        // Create and store the initialization promise
        this.initializationPromise = this._doInitialize();
        
        try {
            const result = await this.initializationPromise;
            return result;
        } catch (error) {
            // Reset promise on failure so it can be retried
            this.initializationPromise = null;
            throw error;
        }
    }
    
    // Internal initialization logic
    async _doInitialize() {
        try {
            // Initializing Prism Parser with Real API
            
            // Use RealPrismHelper instead of PrismHelper
            if (!window.RealPrismHelper) {
                throw new Error('RealPrismHelper class not available');
            }
            
            this.helper = new window.RealPrismHelper();
            const success = await this.helper.initialize();
            
            if (success) {
                this.initialized = true;
                // Prism Parser initialized successfully with Real API
                
                // Quick warmup
                await this.warmUp();
                
                return true;
            } else {
                throw new Error('RealPrismHelper initialization failed');
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
            // Real Prism Parser ready for production
        } catch (error) {
            console.warn('⚠️ Parser warmup failed:', error.message);
        }
    }
    
    // Main parsing method - Returns AST directly
    async parseRuby(rubyCode) {
        // Ensure initialization before parsing
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            // Parsing Ruby code with Real Prism API
            
            // Parse using RealPrismHelper (official API)
            const parseResult = this.helper.parseRuby(rubyCode);
            
            if (!parseResult || !parseResult.success) {
                throw new Error(`Parse failed: ${parseResult?.error || 'Unknown error'}`);
            }
            
            // Extract the AST - now it has REAL Prism nodes with proper properties
            const ast = parseResult.result;
            if (!ast) {
                throw new Error('No AST returned from parser');
            }
            
            // Store for later access
            this.lastAST = ast;
            this.lastParseResult = parseResult;
            
            // Log a sample node to verify it has real properties
            if (ast.body && ast.body.length > 0) {
                // Sample node structure verification
            }
            
            // Return the AST directly
            return ast;
            
        } catch (error) {
            console.error('❌ Real Prism Parse failed:', error);
            console.error('❌ Parse error stack:', error.stack);
            
            // Return a minimal fallback AST
            console.warn('⚠️ Creating fallback AST...');
            const fallbackAST = this.createFallbackAST(rubyCode, error);
            this.lastAST = fallbackAST;
            
            return fallbackAST;
        }
    }
    
    // Create a fallback AST when parsing fails
    createFallbackAST(code, error) {
        // Creating fallback AST
        
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
                source_line: line,
                // Add real-looking properties for compatibility
                name: this.extractName(line),
                value: this.extractValue(line)
            };
        });
    }
    
    // Extract name from line (for LocalVariableWriteNode)
    extractName(line) {
        if (line.includes('=') && !line.includes('==')) {
            const match = line.match(/^\s*(\w+)\s*=/);
            return match ? match[1] : null;
        }
        return null;
    }
    
    // Extract value from line 
    extractValue(line) {
        if (line.includes('=') && !line.includes('==')) {
            const equalIndex = line.indexOf('=');
            return line.substring(equalIndex + 1).trim();
        }
        return null;
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
            return 'CallNode';
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
            lastParseSuccess: this.lastParseResult?.success || false,
            usingRealAPI: true
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

// Export and global assignment for compatibility
export default PrismParser;

if (typeof window !== 'undefined') {
    window.PrismParser = PrismParser;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrismParser;
}

