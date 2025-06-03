/**
 * 🔍 RUBY PARSER MANAGER
 * Interface pour le parser Prism Ruby
 */

class RubyParserManager {
    constructor() {
        this.prismParser = null;
        this.initialized = false;
        console.log('🔍 Ruby Parser Manager initialized');
    }

    /**
     * 🏗️ INITIALIZE PRISM PARSER
     */
    async initializePrism() {
        console.log('🏗️ Initializing Ruby Prism Parser...');
        
        try {
            console.log('🔧 Creating new PrismParser instance...');
            this.prismParser = new window.PrismParser();
            await this.prismParser.initialize();
            this.initialized = true;
            console.log('✅ PrismParser initialized successfully!');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize PrismParser:', error);
            throw error;
        }
    }

    /**
     * 🔍 PARSE RUBY CODE WITH PRISM
     */
    async parseRubyCode(rubyCode) {
        if (!this.initialized) {
            throw new Error('Parser not initialized. Call initializePrism() first.');
        }

        console.log('🔍 Parsing Ruby code with enhanced Prism...');
        
        try {
            const parseResult = await this.prismParser.parseRuby(rubyCode);
            console.log('✅ Ruby code validated with Prism successfully');
            return { result: { value: parseResult } };
        } catch (error) {
            console.error('❌ Prism parsing failed:', error);
            throw error;
        }
    }

    /**
     * 🔍 LOG ACTUAL NODE STRUCTURE FOR DEBUGGING
     */
    logNodeStructure(node, nodeIndex) {
        console.log(`🔍 [Node ${nodeIndex}] Actual structure for ${node.type}:`);
        
        // Log all enumerable properties
        const props = {};
        for (const key in node) {
            if (node.hasOwnProperty && node.hasOwnProperty(key)) {
                const value = node[key];
                if (typeof value === 'function') {
                    props[key] = '[Function]';
                } else if (value && typeof value === 'object') {
                    props[key] = `[${value.constructor?.name || 'Object'}]`;
                } else {
                    props[key] = value;
                }
            }
        }
        
        console.log('📊 Node properties:', props);
        
        // Log specific Prism properties we're looking for
        const prismProps = {
            // CallNode properties
            name: node.name,
            receiver: node.receiver,
            arguments: node.arguments,
            block: node.block,
            flags: node.flags,
            
            // LocalVariableWriteNode properties  
            value: node.value,
            depth: node.depth,
            
            // Common properties
            type: node.type,
            location: node.location
        };
        
        console.log('🎯 Prism-specific properties:', prismProps);
        
        // Check for any source_line property from fallback parsing
        if (node.source_line) {
            console.log('📄 Source line:', node.source_line);
        }
    }

    /**
     * 🔧 CHECK IF READY
     */
    isReady() {
        return this.initialized && this.prismParser?.isReady();
    }

    /**
     * 📊 GET DIAGNOSTICS
     */
    getDiagnostics() {
        return {
            initialized: this.initialized,
            ready: this.isReady(),
            prismParserAvailable: !!this.prismParser
        };
    }
}

// Global export
if (typeof window !== 'undefined') {
    window.RubyParserManager = RubyParserManager;
    console.log('✅ Ruby Parser Manager ready');
}