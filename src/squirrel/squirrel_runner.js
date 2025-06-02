/**
 * 🚀 SQUIRREL RUNNER - PURE PRISM COMPATIBLE
 * ✅ Works with your PrismParser integration
 * ✅ Zero specific code - 100% universal
 * ✅ A Framework + utils.js automatic mapping
 */

class SquirrelRunner {
    constructor() {
        this.orchestrator = null;
        this.ready = false;
        console.log('🚀 New Squirrel Runner - Pure Prism Pipeline!');
    }

    /**
     * 🔧 INITIALIZE RUNNER
     */
    async init() {
        console.log('🏗️ Initializing New Squirrel Runner...');
        
        try {
            // Wait for dependencies
            await this.waitForDependencies();
            
            // Create orchestrator instance
            this.orchestrator = new window.SquirrelOrchestrator();
            
            // Initialize Prism using your working parser
            console.log('🔧 Initializing Prism WASM...');
            const prismReady = await this.orchestrator.initializePrism();
            
            if (!prismReady) {
                throw new Error('Failed to initialize Prism');
            }
            
            this.ready = true;
            console.log('✅ New Squirrel Runner initialized successfully!');
            return true;
            
        } catch (error) {
            console.error('❌ New Squirrel Runner initialization failed:', error);
            throw error;
        }
    }

    /**
     * 🔧 WAIT FOR DEPENDENCIES
     */
    async waitForDependencies() {
        const maxWait = 5000; // 5 seconds
        const checkInterval = 100; // 100ms
        let waited = 0;
        
        while (waited < maxWait) {
            // Check if all required dependencies are loaded
            if (window.SquirrelOrchestrator && 
                window.PrismParser && 
                window.A && 
                window.puts && 
                window.wait) {
                console.log('✅ All dependencies loaded');
                return true;
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
        }
        
        console.warn('⚠️ Some dependencies may be missing, continuing anyway...');
        console.log('Available:', {
            SquirrelOrchestrator: !!window.SquirrelOrchestrator,
            PrismParser: !!window.PrismParser,
            A: !!window.A,
            puts: !!window.puts,
            wait: !!window.wait
        });
        
        return true;
    }

    /**
     * 🚀 RUN SQUIRREL FILE
     */
    async runFile(filename) {
        console.log('🚀 Running Squirrel file:', filename);
        
        try {
            if (!this.ready) {
                await this.init();
            }

            // Load file
            console.log('📁 Loading file...');
            const response = await fetch(filename);
            
            if (!response.ok) {
                throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
            }
            
            const content = await response.text();
            console.log('✅ File loaded:', content.length, 'characters');
            
            // Process with orchestrator
            const result = await this.orchestrator.processRubyCode(content);
            
            console.log('✅ Squirrel file executed successfully');
            return result;
            
        } catch (error) {
            console.error('❌ Squirrel file execution failed:', error);
            throw error;
        }
    }

    /**
     * 🎯 RUN SQUIRREL CODE DIRECTLY
     */
    async runCode(rubyCode) {
        console.log('🚀 Running Squirrel code directly...');
        
        try {
            if (!this.ready) {
                await this.init();
            }

            const result = await this.orchestrator.processRubyCode(rubyCode);
            console.log('✅ Squirrel code executed successfully');
            return result;
            
        } catch (error) {
            console.error('❌ Squirrel code execution failed:', error);
            throw error;
        }
    }

    /**
     * 🔧 AUTO-START FUNCTIONALITY
     */
    async autoStart() {
        console.log('🔄 Auto-starting Pure Prism Squirrel...');
        
        try {
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }

            // Additional wait to ensure all scripts are loaded
            await new Promise(resolve => setTimeout(resolve, 200));

            console.log('🚀 Starting main file...');
            await this.runFile('./application/index.sqr');
            
        } catch (error) {
            console.error('❌ Auto-start failed:', error);
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
}

// 🚀 CREATE GLOBAL INSTANCE
window.SquirrelRunner = SquirrelRunner;

// 🎯 CREATE GLOBAL RUNNER INSTANCE
console.log('🚀 Creating global Pure Prism Squirrel Runner...');
window.globalSquirrelRunner = new SquirrelRunner();

console.log('🚀 Squirrel Runner loaded!');
console.log('✅ Ready for pure Prism-based Ruby execution!');

// 🔄 AUTO-START IF ENABLED
if (typeof window !== 'undefined') {
    // Wait a bit more to ensure your PrismParser is ready
    setTimeout(() => {
        if (window.globalSquirrelRunner) {
            window.globalSquirrelRunner.autoStart();
        }
    }, 500); // Increased delay to ensure PrismParser is ready
}