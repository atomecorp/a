/**
 * 🚀 SQUIRREL RUNNER - PRODUCTION VERSION
 * ✅ Pure execution of application/index.sqr
 * ✅ No tests - Direct Ruby to JavaScript execution
 * ✅ 100% Prism WASM powered
 */

import SquirrelOrchestrator from './squirrel_orchestrator.js';

class SquirrelRunner {
    constructor() {
        this.orchestrator = null;
        this.ready = false;
        // console.log('🚀 Squirrel Runner - Production Mode');
    }

    /**
     * 🔧 INITIALIZE RUNNER
     */
    async init() {
        // console.log('🏗️ Initializing Squirrel Runner...');
        
        try {
            // Wait for dependencies
            await this.waitForDependencies();
            
            // Create orchestrator instance
            this.orchestrator = new (window.SquirrelOrchestrator || SquirrelOrchestrator)();
            
            // Initialize Prism
            // console.log('🔧 Initializing Prism WASM...');
            const prismReady = await this.orchestrator.initializePrism();
            
            if (!prismReady) {
                throw new Error('Failed to initialize Prism');
            }
            
            this.ready = true;
            // console.log('✅ Squirrel Runner ready for production!');
            return true;
            
        } catch (error) {
            console.error('❌ Squirrel Runner initialization failed:', error);
            throw error;
        }
    }

    /**
     * 🔧 WAIT FOR DEPENDENCIES
     */
    async waitForDependencies() {
        const maxWait = 3000; // 3 seconds
        const checkInterval = 100;
        let waited = 0;
        
        while (waited < maxWait) {
            if (window.SquirrelOrchestrator && 
                window.PrismParser && 
                window.A && 
                window.puts && 
                window.wait) {
                // console.log('✅ All dependencies loaded');
                return true;
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
        }
        
        // console.log('⚠️ Continuing with available dependencies...');
        return true;
    }

    /**
     * 🚀 RUN SQUIRREL FILE
     */
    async runFile(filename) {
        // console.log('🚀 Loading and executing:', filename);
        
        try {
            if (!this.ready) {
                await this.init();
            }

            // Load file
            // console.log('📁 Loading file...');
            const response = await fetch(filename);
            
            if (!response.ok) {
                throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
            }
            
            const content = await response.text();
            // console.log(`✅ File loaded: ${content.length} characters`);
            // console.log('📄 Ruby content preview:');
            // console.log('--- START RUBY CODE ---');
            // console.log(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
            // console.log('--- END RUBY CODE ---');
            
            // Process with orchestrator
            // console.log('⚡ Starting Ruby → JavaScript transpilation...');
            const result = await this.orchestrator.processRubyCode(content);
            
            if (result.success) {
                // console.log('🎉 Squirrel application executed successfully!');
                // console.log('✨ Your Ruby code is now running as JavaScript!');
            } else {
                console.error('❌ Execution failed:', result.error);
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ Failed to execute Squirrel file:', error);
            // console.log('🔧 Error details:', error.message);
            throw error;
        }
    }

    /**
     * 🎯 RUN SQUIRREL CODE DIRECTLY
     */
    async runCode(rubyCode) {
        // console.log('🚀 Executing Ruby code directly...');
        
        try {
            if (!this.ready) {
                await this.init();
            }

            const result = await this.orchestrator.processRubyCode(rubyCode);
            // console.log('✅ Ruby code executed successfully');
            return result;
            
        } catch (error) {
            console.error('❌ Ruby code execution failed:', error);
            throw error;
        }
    }

    /**
     * 🔧 AUTO-START APPLICATION
     */
    async autoStart() {
        // console.log('🚀 Auto-starting Squirrel application...');
        
        try {
            // Wait for DOM
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }

            // Small delay to ensure everything is loaded
            await new Promise(resolve => setTimeout(resolve, 300));

            // console.log('🎯 Executing application/index.sqr...');
            await this.runFile('./application/index.sqr');
            
        } catch (error) {
            console.error('❌ Auto-start failed:', error);
            // console.log('🔧 Make sure application/index.sqr exists and contains valid Ruby code');
        }
    }

    /**
     * 🎯 GET ORCHESTRATOR INSTANCE
     */
    getOrchestrator() {
        return this.orchestrator;
    }

    /**
     * 🔧 CHECK IF READY
     */
    isReady() {
        return this.ready;
    }

    /**
     * 📊 GET STATUS INFO
     */
    getStatus() {
        return {
            ready: this.ready,
            orchestrator: !!this.orchestrator,
            prism: this.orchestrator?.prismParser?.isReady() || false
        };
    }
}

// 🚀 CREATE GLOBAL INSTANCE
window.SquirrelRunner = SquirrelRunner;

// 🎯 CREATE GLOBAL RUNNER INSTANCE
// console.log('🚀 Creating Squirrel Runner (Production)...');
window.globalSquirrelRunner = new SquirrelRunner();

// console.log('✅ Squirrel Runner loaded!');
// console.log('🎯 Ready to execute application/index.sqr');

// 🔄 AUTO-START APPLICATION
if (typeof window !== 'undefined') {
    // Wait for all systems to be ready
    setTimeout(() => {
        if (window.globalSquirrelRunner) {
            window.globalSquirrelRunner.autoStart();
        }
    }, 800); // Enough time for Prism to initialize
}

// Export and global assignment for compatibility
export default SquirrelRunner;

// Global export
if (typeof window !== 'undefined') {
    window.SquirrelRunner = SquirrelRunner;
    
    // Create global runner instance
    window.globalSquirrelRunner = new SquirrelRunner();
    
    // Auto-start application
    setTimeout(() => {
        if (window.globalSquirrelRunner) {
            window.globalSquirrelRunner.autoStart();
        }
    }, 800);
}

// 🎯 GLOBAL HELPER FUNCTIONS
window.runSquirrel = async (code) => {
    if (window.globalSquirrelRunner) {
        return await window.globalSquirrelRunner.runCode(code);
    }
    console.error('❌ Squirrel Runner not available');
};

window.runSquirrelFile = async (filename) => {
    if (window.globalSquirrelRunner) {
        return await window.globalSquirrelRunner.runFile(filename);
    }
    console.error('❌ Squirrel Runner not available');
};

window.squirrelStatus = () => {
    if (window.globalSquirrelRunner) {
        const status = window.globalSquirrelRunner.getStatus();
        // console.table(status);
        return status;
    }
    return { error: 'Squirrel Runner not available' };
};

console.log('✅ Squirrel Runner ES6 module ready');