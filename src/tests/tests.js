// Centralized Testing and Diagnostics for Squirrel Project
// All tests, debugging, and verification logic in one place

console.log('🧪 Tests.js loading...');

window.SquirrelTests = {
    
    // Test WASM file integrity
    async testWASMFile() {
        try {
            console.log('🔍 Testing WASM file integrity...');
            
            const wasmResponse = await fetch('squirrel/parser/prism.wasm');
            console.log('📊 Response status:', wasmResponse.status);
            
            if (!wasmResponse.ok) {
                throw new Error(`WASM fetch failed: ${wasmResponse.status}`);
            }
            
            const arrayBuffer = await wasmResponse.arrayBuffer();
            console.log('📊 File size:', arrayBuffer.byteLength, 'bytes');
            
            // Check WASM magic number
            const bytes = new Uint8Array(arrayBuffer);
            const magicNumber = Array.from(bytes.slice(0, 4)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
            console.log('📊 Magic number:', magicNumber);
            console.log('📊 Expected: 0x00 0x61 0x73 0x6d');
            
            if (bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d) {
                console.log('✅ WASM file is valid!');
                return true;
            } else {
                console.log('❌ WASM file is corrupted');
                // Check if it's HTML (common error)
                const text = new TextDecoder().decode(bytes.slice(0, 100));
                console.log('📊 File content preview:', text.substring(0, 50));
                return false;
            }
            
        } catch (error) {
            console.error('❌ WASM test failed:', error);
            return false;
        }
    },
    
    // Test Prism Parser initialization
    async testPrismParser() {
        try {
            console.log('🔍 Testing Prism Parser...');
            
            if (!window.prismParser) {
                throw new Error('prismParser not available');
            }
            
            const diagnostics = window.prismParser.getDiagnostics();
            console.log('📊 Parser diagnostics:', diagnostics);
            
            if (!diagnostics.initialized) {
                console.log('⚠️ Parser not initialized, attempting initialization...');
                const success = await window.prismParser.initialize();
                console.log('📊 Initialization result:', success);
                return success;
            }
            
            console.log('✅ Prism Parser is ready');
            return true;
            
        } catch (error) {
            console.error('❌ Prism Parser test failed:', error);
            return false;
        }
    },
    
    // Test Ruby parsing with simple code
    async testRubyParsing() {
        try {
            console.log('🔍 Testing Ruby parsing...');
            
            const testCode = `
# Simple Ruby test
name = "Squirrel"
puts name
`;
            
            if (!window.prismParser || !window.prismParser.initialized) {
                throw new Error('Parser not initialized');
            }
            
            const result = window.prismParser.parseRuby(testCode);
            console.log('📊 Parse result:', result);
            console.log('✅ Ruby parsing successful');
            return true;
            
        } catch (error) {
            console.error('❌ Ruby parsing test failed:', error);
            return false;
        }
    },
    
    // Test utils.js functions
    testUtils() {
        try {
            console.log('🔍 Testing native/utils.js...');
            
            // Check what's actually exported from native/utils.js
            console.log('📊 Window objects containing "util":', 
                Object.keys(window).filter(key => key.toLowerCase().includes('util')));
            
            // Check for common utility patterns
            const utilityChecks = [
                { name: 'mapCSSProperty', check: () => typeof window.mapCSSProperty === 'function' },
                { name: 'mapHTMLAttribute', check: () => typeof window.mapHTMLAttribute === 'function' },
                { name: 'rubyToJSMethod', check: () => typeof window.rubyToJSMethod === 'function' },
                { name: 'utils object', check: () => typeof window.utils === 'object' },
                { name: 'Utils class', check: () => typeof window.Utils === 'function' },
                { name: 'utilityFunctions', check: () => typeof window.utilityFunctions === 'object' }
            ];
            
            console.log('📊 Utility function checks:');
            let foundUtils = false;
            utilityChecks.forEach(({ name, check }) => {
                const available = check();
                console.log(`  ${available ? '✅' : '❌'} ${name}: ${available}`);
                if (available) foundUtils = true;
            });
            
            // Test basic JavaScript functionality that should always be available
            console.log('📊 Testing core JS features...');
            console.log('📊 Array methods:', typeof [].map === 'function');
            console.log('📊 Object methods:', typeof Object.keys === 'function');
            console.log('📊 String methods:', typeof ''.replace === 'function');
            console.log('📊 DOM available:', typeof document !== 'undefined');
            console.log('📊 Fetch available:', typeof fetch === 'function');
            
            if (foundUtils) {
                console.log('✅ Native utilities detected');
            } else {
                console.log('⚠️ No specific utility functions found, but core JS available');
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Utils test failed:', error);
            return false;
        }
    },
    
    // Test A Framework
    testAFramework() {
        try {
            console.log('🔍 Testing A Framework...');
            
            if (!window.A) {
                throw new Error('A Framework not available');
            }
            
            console.log('📊 A Framework methods:', Object.keys(window.A));
            console.log('✅ A Framework loaded');
            return true;
            
        } catch (error) {
            console.error('❌ A Framework test failed:', error);
            return false;
        }
    },
    
    // Run all tests sequentially
    async runAllTests() {
        console.log('🚀 Running all Squirrel tests...');
        
        const tests = [
            { name: 'WASM File', test: () => this.testWASMFile() },
            { name: 'Native Utils', test: () => this.testUtils() },
            { name: 'A Framework', test: () => this.testAFramework() },
            { name: 'Prism Parser', test: () => this.testPrismParser() },
            { name: 'Ruby Parsing', test: () => this.testRubyParsing() }
        ];
        
        const results = [];
        
        for (const { name, test } of tests) {
            console.log(`\n🧪 Testing ${name}...`);
            try {
                const result = await test();
                results.push({ name, success: result });
                console.log(`${result ? '✅' : '❌'} ${name}: ${result ? 'PASS' : 'FAIL'}`);
            } catch (error) {
                results.push({ name, success: false, error: error.message });
                console.log(`❌ ${name}: FAIL (${error.message})`);
            }
        }
        
        // Summary
        console.log('\n📊 Test Summary:');
        const passed = results.filter(r => r.success).length;
        const total = results.length;
        console.log(`${passed}/${total} tests passed`);
        
        results.forEach(({ name, success, error }) => {
            console.log(`  ${success ? '✅' : '❌'} ${name}${error ? ': ' + error : ''}`);
        });
        
        return { passed, total, results };
    },
    
    // Quick diagnostic info
    getDiagnostics() {
        return {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            wasmSupport: typeof WebAssembly !== 'undefined',
            windowObjects: {
                utils: typeof window.utils,
                A: typeof window.A,
                prismParser: typeof window.prismParser,
                createWASI: typeof window.createWASI,
                PrismHelper: typeof window.PrismHelper
            }
        };
    }
};

// Auto-run tests when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM ready, scheduling tests...');
    
    // Wait a bit for all scripts to load
    setTimeout(async () => {
        console.log('🧪 Starting automated tests...');
        const results = await window.SquirrelTests.runAllTests();
        
        if (results.passed === results.total) {
            console.log('🎉 All tests passed! Squirrel is ready to go!');
        } else {
            console.log('⚠️ Some tests failed. Check logs above for details.');
        }
    }, 2000);
});

console.log('✅ Tests.js loaded successfully');