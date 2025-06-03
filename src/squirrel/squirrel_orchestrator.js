/**
 * 🐿️ SQUIRREL ORCHESTRATOR - COORDINATEUR PRINCIPAL
 * Version 5.0 - Architecture modulaire avec 5 composants
 */

class SquirrelOrchestrator {
    
    constructor() {
        // console.log('🚀 MODULAR Squirrel Orchestrator - 5 Component Architecture!');
        
        // Initialize the transpiler core (which initializes all other components)
        this.transpilerCore = new window.TranspilerCore();
        
        // console.log('📊 All components loaded successfully');
        // console.log('🎯 Ready for Ruby to JavaScript transpilation!');
    }

    /**
     * 🏗️ INITIALIZE ALL COMPONENTS
     */
    async initializePrism() {
        // console.log('🏗️ Initializing all Squirrel components...');
        
        try {
            await this.transpilerCore.initializePrism();
            // console.log('✅ All Squirrel components initialized successfully!');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Squirrel components:', error);
            throw error;
        }
    }

    /**
     * 🔍 PARSE RUBY CODE
     */
    async parseRubyCode(rubyCode) {
        return await this.transpilerCore.parseRubyCode(rubyCode);
    }

    /**
     * ⚡ TRANSPILE PRISM AST TO JAVASCRIPT
     */
    transpilePrismASTToJavaScript(ast) {
        return this.transpilerCore.transpilePrismASTToJavaScript(ast);
    }

    /**
     * 🚀 EXECUTE JAVASCRIPT
     */
    executeJS(jsCode) {
        return this.transpilerCore.executeJS(jsCode);
    }

    /**
     * 🚀 MAIN PROCESS - COMPLETE RUBY TO JS PIPELINE
     */
    async processRubyCode(rubyCode) {
        // console.log('🚀 Starting MODULAR Prism Ruby to JS Pipeline...');
        // console.log('🏗️ Architecture: RubyParserManager → CodeGenerator → RubyHandlers → TranspilerCore → SquirrelOrchestrator');
        
        try {
            const result = await this.transpilerCore.processRubyCode(rubyCode);
            // console.log('🎉 MODULAR pipeline completed successfully!');
            return result;
        } catch (error) {
            console.error('❌ MODULAR pipeline failed:', error);
            throw error;
        }
    }

    /**
     * 🔧 CHECK IF READY
     */
    isReady() {
        return this.transpilerCore?.isReady() || false;
    }

    /**
     * 📊 GET COMPREHENSIVE DIAGNOSTICS
     */
    getDiagnostics() {
        const diagnostics = {
            orchestrator: 'SquirrelOrchestrator v5.0 - Modular',
            architecture: '5-component modular design',
            components: {
                transpilerCore: !!this.transpilerCore,
                ready: this.isReady()
            }
        };

        if (this.transpilerCore) {
            diagnostics.components = {
                ...diagnostics.components,
                ...this.transpilerCore.getDiagnostics()
            };
        }

        return diagnostics;
    }

    /**
     * 🎯 GET INDIVIDUAL COMPONENTS (FOR ADVANCED USAGE)
     */
    getComponents() {
        return {
            transpilerCore: this.transpilerCore,
            codeGenerator: this.transpilerCore?.codeGenerator,
            rubyHandlers: this.transpilerCore?.rubyHandlers,
            parserManager: this.transpilerCore?.parserManager
        };
    }

    /**
     * 🛠️ ADVANCED: DIRECT ACCESS TO SPECIFIC COMPONENT
     */
    getCodeGenerator() {
        return this.transpilerCore?.codeGenerator;
    }

    getRubyHandlers() {
        return this.transpilerCore?.rubyHandlers;
    }

    getParserManager() {
        return this.transpilerCore?.parserManager;
    }

    getTranspilerCore() {
        return this.transpilerCore;
    }

    /**
     * 🎯 QUICK TEST METHOD
     */
    async quickTest() {
        // console.log('🧪 Running quick Squirrel test...');
        
        const testCode = `
puts "Hello from modular Squirrel!"
container = A.new({
  attach: 'body',
  text: 'Modular architecture works!',
  color: 'green'
})
        `.trim();

        try {
            const result = await this.processRubyCode(testCode);
            // console.log('✅ Quick test completed:', result.success ? 'SUCCESS' : 'FAILED');
            return result;
        } catch (error) {
            console.error('❌ Quick test failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 📊 PERFORMANCE MONITOR
     */
    async performanceTest(rubyCode) {
        const startTime = performance.now();
        
        // console.log('⏱️ Starting performance test...');
        
        try {
            const result = await this.processRubyCode(rubyCode);
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // console.log(`⏱️ Performance test completed in ${duration.toFixed(2)}ms`);
            
            return {
                ...result,
                performance: {
                    duration: duration,
                    durationFormatted: `${duration.toFixed(2)}ms`
                }
            };
        } catch (error) {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            console.error(`❌ Performance test failed after ${duration.toFixed(2)}ms:`, error);
            
            return {
                success: false,
                error: error.message,
                performance: {
                    duration: duration,
                    durationFormatted: `${duration.toFixed(2)}ms`
                }
            };
        }
    }
}

// Global export
if (typeof window !== 'undefined') {
    window.SquirrelOrchestrator = SquirrelOrchestrator;
    // console.log('✅ MODULAR Squirrel Orchestrator ready!');
    // console.log('🏗️ 5-Component Architecture: RubyParserManager + CodeGenerator + RubyHandlers + TranspilerCore + SquirrelOrchestrator');
    // console.log('🎯 Enhanced with smart Ruby-to-JS conversion!');
    // console.log('🛠️ Advanced diagnostics and component access available!');
}