/**
 * 🔍 RUBY PARSER MANAGER
 * Now uses RealPrismHelper with official Prism JavaScript API
 * Version 3.0 - Real Prism Integration
 */

import PrismParser from './prism_parser.js';

class RubyParserManager {
    constructor() {
        this.prismParser = null;
        this.initialized = false;
        this.initializationPromise = null;
    }

    /**
     * 🏗️ INITIALIZE PRISM PARSER
     */
    async initializePrism() {
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
    
    /**
     * 🔧 INTERNAL INITIALIZATION LOGIC
     */
    async _doInitialize() {
        try {
            this.prismParser = new (window.PrismParser || PrismParser)();
            await this.prismParser.initialize();
            this.initialized = true;
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
        // Ensure initialization is complete before parsing
        if (!this.initialized) {
            await this.initializePrism();
        }
        
        try {
            const parseResult = await this.prismParser.parseRuby(rubyCode);

            
            // Verify we got real Prism nodes
            if (parseResult && parseResult.body && parseResult.body.length > 0) {
                const sampleNode = parseResult.body[0];
                // Sample node verification
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
        

        
        // Log additional properties found
        const additionalProps = Object.keys(node).filter(key => !expectedProps.includes(key));
        if (additionalProps.length > 0) {

        }
        
        // Quality check
        const hasExpectedProps = expectedProps.some(prop => prop in node);

        
        // For debugging: show structure of complex properties
        if (node.arguments && typeof node.arguments === 'object') {
            // Arguments structure debug
        }
        
        if (node.value && typeof node.value === 'object') {
            // Value structure debug
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

// Export and global assignment for compatibility
export default RubyParserManager;

// Global export
if (typeof window !== 'undefined') {
    window.RubyParserManager = RubyParserManager;

}