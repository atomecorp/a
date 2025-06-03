/**
 * 🔍 RUBY PARSER MANAGER
 * Now uses RealPrismHelper with official Prism JavaScript API
 * Version 3.0 - Real Prism Integration
 */

class RubyParserManager {
    constructor() {
        this.prismParser = null;
        this.initialized = false;
        console.log('🔍 Ruby Parser Manager v3.0 initialized for Real Prism');
    }

    /**
     * 🏗️ INITIALIZE PRISM PARSER
     */
    async initializePrism() {
        console.log('🏗️ Initializing Real Prism Parser...');
        
        try {
            console.log('🔧 Creating new PrismParser instance with Real API...');
            this.prismParser = new window.PrismParser();
            await this.prismParser.initialize();
            this.initialized = true;
            console.log('✅ Real PrismParser initialized successfully!');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Real PrismParser:', error);
            throw error;
        }
    }

    /**
     * 🔍 PARSE RUBY CODE WITH REAL PRISM
     */
    async parseRubyCode(rubyCode) {
        if (!this.initialized) {
            throw new Error('Parser not initialized. Call initializePrism() first.');
        }

        console.log('🔍 Parsing Ruby code with Real Prism API...');
        
        try {
            const parseResult = await this.prismParser.parseRuby(rubyCode);
            console.log('✅ Ruby code validated with Real Prism successfully');
            
            // Verify we got real Prism nodes
            if (parseResult && parseResult.body && parseResult.body.length > 0) {
                const sampleNode = parseResult.body[0];
                console.log('🔍 Sample node verification:', {
                    type: sampleNode.type,
                    hasRealProperties: this.hasRealPrismProperties(sampleNode),
                    properties: Object.keys(sampleNode)
                });
            }
            
            return { result: { value: parseResult } };
        } catch (error) {
            console.error('❌ Real Prism parsing failed:', error);
            throw error;
        }
    }

    /**
     * 🔍 CHECK IF NODE HAS REAL PRISM PROPERTIES
     */
    hasRealPrismProperties(node) {
        // Real Prism nodes should have proper properties based on their type
        const realPrismProps = [
            'name',        // CallNode, LocalVariableWriteNode
            'value',       // LocalVariableWriteNode, StringNode, IntegerNode
            'receiver',    // CallNode
            'arguments',   // CallNode
            'block',       // CallNode
            'elements',    // HashNode, ArrayNode
            'body',        // ProgramNode, BlockNode
            'depth',       // LocalVariableWriteNode
            'flags'        // CallNode
        ];
        
        return realPrismProps.some(prop => prop in node);
    }

    /**
     * 🔍 LOG REAL NODE STRUCTURE FOR DEBUGGING
     */
    logNodeStructure(node, nodeIndex) {
        console.log(`🔍 [Node ${nodeIndex}] Real Prism node structure for ${node.type}:`);
        
        // Log the specific properties we expect for different node types
        const nodeTypeProps = {
            'LocalVariableWriteNode': ['name', 'value', 'depth'],
            'CallNode': ['name', 'receiver', 'arguments', 'block', 'flags'],
            'StringNode': ['value'],
            'IntegerNode': ['value'],
            'HashNode': ['elements'],
            'ArrayNode': ['elements'],
            'ProgramNode': ['body'],
            'ArgumentsNode': ['arguments']
        };
        
        const expectedProps = nodeTypeProps[node.type] || ['name', 'value'];
        const actualProps = {};
        
        for (const prop of expectedProps) {
            if (prop in node) {
                const value = node[prop];
                if (typeof value === 'object' && value !== null) {
                    if (Array.isArray(value)) {
                        actualProps[prop] = `Array[${value.length}]`;
                    } else {
                        actualProps[prop] = `${value.constructor?.name || 'Object'}`;
                    }
                } else {
                    actualProps[prop] = value;
                }
            } else {
                actualProps[prop] = '❌ MISSING';
            }
        }
        
        console.log('📊 Real Prism properties:', actualProps);
        
        // Log additional properties found
        const additionalProps = Object.keys(node).filter(key => !expectedProps.includes(key));
        if (additionalProps.length > 0) {
            console.log('📝 Additional properties:', additionalProps);
        }
        
        // Quality check
        const hasExpectedProps = expectedProps.some(prop => prop in node);
        console.log(`🎯 Node quality: ${hasExpectedProps ? 'REAL Prism node ✅' : 'Fallback/Mock node ⚠️'}`);
        
        // For debugging: show structure of complex properties
        if (node.arguments && typeof node.arguments === 'object') {
            console.log('🔍 Arguments structure:', {
                type: node.arguments.type,
                hasArguments: 'arguments' in node.arguments,
                argumentCount: node.arguments.arguments?.length || 0
            });
        }
        
        if (node.value && typeof node.value === 'object') {
            console.log('🔍 Value structure:', {
                type: node.value.type,
                keys: Object.keys(node.value)
            });
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
            prismParserAvailable: !!this.prismParser,
            usingRealAPI: true,
            version: '3.0-RealPrism'
        };
    }
}

// Global export
if (typeof window !== 'undefined') {
    window.RubyParserManager = RubyParserManager;
    console.log('✅ Ruby Parser Manager v3.0 ready - Real Prism integration');
}