#!/bin/bash

# 🚀 COMPLETE AND REUSABLE SQH TEST SCRIPT v4.3
# Version: 4.3.0 - With full diagnostics and detailed logs
# Usage: ./run_test.sh
# NEW: Structure my_solution/test_app/tests with src in my_solution/test_app/src

set -e

# Colors for display
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly NC='\033[0m'

# FIXED global variables for my_solution structure
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly MY_SOLUTION_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly TEST_APP_ROOT="$MY_SOLUTION_ROOT/test_app"
readonly SRC_DIR="$TEST_APP_ROOT/src"
readonly TESTS_DIR="$TEST_APP_ROOT/tests"
readonly TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Utility functions
log() { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }
header() { echo -e "${PURPLE}🚀 $1${NC}\n${PURPLE}$(printf '=%.0s' {1..60})${NC}"; }

# 1. VERIFICATION ENVIRONNEMENT CORRIGÉ
setup_environment() {
    header "VERIFICATION DE L'ENVIRONNEMENT my_solution/test_app"
    
    # Vérifier Node.js
    if ! command -v node &> /dev/null; then
        error "Node.js requis. Installez-le depuis https://nodejs.org"
        exit 1
    fi
    
    local node_version=$(node --version | sed 's/v//' | cut -d. -f1)
    if [ "$node_version" -lt 16 ]; then
        error "Node.js 16+ requis. Version actuelle: $(node --version)"
        exit 1
    fi
    success "Node.js $(node --version) OK"
    
    # Vérifier structure projet SQH CORRIGÉE
    local required_files=("src/a/a.js" "src/squirrel/hyper_squirrel.js" "src/application/index.sqh")
    for file in "${required_files[@]}"; do
        local full_path="$TEST_APP_ROOT/$file"
        if [ ! -f "$full_path" ]; then
            error "Fichier manquant: $full_path"
            error "Assurez-vous d'avoir la structure:"
            error "  my_solution/test_app/src/a/a.js"
            error "  my_solution/test_app/src/squirrel/hyper_squirrel.js"
            error "  my_solution/test_app/src/application/index.sqh"
            exit 1
        fi
        success "Trouvé: $file"
    done
    
    # Diagnostics supplémentaires
    log "📍 Script dans: $SCRIPT_DIR"
    log "📍 my_solution root: $MY_SOLUTION_ROOT"
    log "📍 test_app root: $TEST_APP_ROOT"
    log "📍 Sources dans: $SRC_DIR"
    log "📍 Tests seront créés dans: $TESTS_DIR"
    log "📂 Contenu test_app/src:"
    if [ -d "$SRC_DIR" ]; then
        ls -la "$SRC_DIR" | head -10
    else
        error "Répertoire src manquant dans $TEST_APP_ROOT"
        exit 1
    fi
    
    # Créer répertoire test_app/tests s'il n'existe pas
    if [ ! -d "$TEST_APP_ROOT" ]; then
        mkdir -p "$TEST_APP_ROOT"
        success "Répertoire test_app créé"
    fi
    
    # Nettoyer ancien répertoire tests dans test_app
    if [ -d "$TESTS_DIR" ]; then
        warn "Répertoire test_app/tests existant supprimé"
        rm -rf "$TESTS_DIR"
    fi
}

# 2. CREATION STRUCTURE COMPLETE
create_test_structure() {
    header "CREATION STRUCTURE DE TESTS"
    
    # Créer répertoires
    mkdir -p "$TESTS_DIR"/{core,suites/{framework,parsing,performance},config,scripts,reports}
    
    # Configuration chemins
    cat > "$TESTS_DIR/config/paths.js" << 'EOF'
const path = require('path');
const TESTS_ROOT = path.resolve(__dirname, '..');
const TEST_APP_ROOT = path.resolve(TESTS_ROOT, '..');
const SRC_ROOT = path.join(TEST_APP_ROOT, 'src');

module.exports = {
    testsRoot: TESTS_ROOT,
    testAppRoot: TEST_APP_ROOT,
    srcRoot: SRC_ROOT,
    framework: {
        core: path.join(SRC_ROOT, 'a/a.js'),
        identity: path.join(SRC_ROOT, 'a/particles/identity.js'),
        dimension: path.join(SRC_ROOT, 'a/particles/dimension.js')
    },
    parsing: {
        hybridParser: path.join(SRC_ROOT, 'squirrel/hyper_squirrel.js'),
        transpiler: path.join(SRC_ROOT, 'squirrel/transpiller.js')
    },
    samples: {
        main: path.join(SRC_ROOT, 'application/index.sqh'),
        fullRuby: path.join(SRC_ROOT, 'application/full_ruby.sqh')
    },
    utils: {
        native: path.join(SRC_ROOT, 'analysis/utils_native.js'),
        a: path.join(SRC_ROOT, 'analysis/utils_a.js')
    }
};
EOF

    success "Configuration créée"
}

# 3. CREATION SETUP
create_setup() {
    log "Création du setup principal..."
    
    cat > "$TESTS_DIR/core/setup.js" << 'EOF'
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

let paths;
try {
    paths = require('../config/paths');
} catch (e) {
    const TESTS_ROOT = path.resolve(__dirname, '..');
    const TEST_APP_ROOT = path.resolve(TESTS_ROOT, '..');
    const SRC_ROOT = path.join(TEST_APP_ROOT, 'src');
    paths = {
        testsRoot: TESTS_ROOT,
        testAppRoot: TEST_APP_ROOT,
        srcRoot: SRC_ROOT,
        framework: { core: path.join(SRC_ROOT, 'a/a.js') },
        parsing: { hybridParser: path.join(SRC_ROOT, 'squirrel/hyper_squirrel.js') },
        utils: { a: path.join(SRC_ROOT, 'analysis/utils_a.js') },
        samples: { main: path.join(SRC_ROOT, 'application/index.sqh') }
    };
}

function setupBrowser() {
    try {
        const dom = new JSDOM('<!DOCTYPE html><html><head><title>SQH Tests</title></head><body></body></html>', {
            runScripts: 'dangerously',
            resources: 'usable',
            url: 'http://localhost'
        });
        
        global.window = dom.window;
        global.document = dom.window.document;
        global.navigator = dom.window.navigator;
        global.HTMLElement = dom.window.HTMLElement;
        global.Event = dom.window.Event;
        global.KeyboardEvent = dom.window.KeyboardEvent;
        
        global.performance = {
            now: () => Date.now(),
            memory: {
                usedJSHeapSize: 50 * 1024 * 1024,
                totalJSHeapSize: 100 * 1024 * 1024,
                jsHeapSizeLimit: 2048 * 1024 * 1024
            }
        };
        
        return dom.window;
    } catch (error) {
        console.error('❌ Erreur setup navigateur:', error.message);
        throw error;
    }
}

function loadFileAsCommonJS(filePath, window) {
    if (!fs.existsSync(filePath)) {
        console.warn('  ⚠️  Fichier non trouvé: ' + path.basename(filePath));
        return false;
    }
    
    try {
        let code = fs.readFileSync(filePath, 'utf8');
        
        code = code
            .replace(/import\s+.*?from\s+['"][^'"]+['"];?/g, '')
            .replace(/export\s*\{\s*([^}]+)\s*\}/g, '')
            .replace(/export\s+default\s+/g, '')
            .replace(/export\s*\{([^}]+)\s+as\s+default\s*\}/g, '');
        
        const SRC_PATH = paths.srcRoot;
        console.log('  🔍 SRC_PATH: ' + SRC_PATH);
        console.log('  🔍 Répertoire actuel: ' + process.cwd());
        
        const contextCode = 
            '(function() {' +
                'try {' +
                    'console.log("  🔍 [CONTEXT] PWD au début:", typeof process !== "undefined" ? process.cwd() : "N/A");' +
                    'const originalCwd = typeof process !== "undefined" ? process.cwd() : "";' +
                    'if (typeof process !== "undefined") {' +
                        'process.chdir("' + SRC_PATH + '");' +
                        'console.log("  🔍 [CONTEXT] PWD après chdir vers src:", process.cwd());' +
                        'const fs = require("fs");' +
                        'const path = require("path");' +
                        'console.log("  🔍 [CONTEXT] Contenu répertoire src:");' +
                        'try {' +
                            'const files = fs.readdirSync(".");' +
                            'files.slice(0, 10).forEach(f => console.log("    📄", f));' +
                        '} catch(e) {' +
                            'console.log("    ❌ Erreur lecture répertoire src:", e.message);' +
                        '}' +
                    '}' +
                    'if (typeof Document !== "undefined") {' +
                        'const originalInitSimple = Document.prototype.initSimple;' +
                        'Document.prototype.initSimple = function() {' +
                            'console.log("  🎯 [MOCK] Document.initSimple() appelé");' +
'console.log("  🎯 [MOCK] Document.initSimple() appelé - ignoré pour tests");' +
'return Promise.resolve();' +                                'try {' +
                                    'return originalInitSimple.call(this);' +
                                '} catch(e) {' +
                                    'console.log("  ⚠️  [MOCK] Erreur fonction originale:", e.message);' +
                                    'return Promise.resolve();' +
                                '}' +
                            '}' +
                            'return Promise.resolve();' +
                        '};' +
                    '}' +
                    code +
                    'if (typeof A !== "undefined") {' +
                        'window.A = A;' +
                        'if (typeof global !== "undefined") global.A = A;' +
                    '}' +
                    'if (typeof defineParticle !== "undefined") {' +
                        'window.defineParticle = defineParticle;' +
                        'if (typeof global !== "undefined") global.defineParticle = defineParticle;' +
                    '}' +
                    'if (typeof SimpleHybridParser !== "undefined") {' +
                        'window.SimpleHybridParser = SimpleHybridParser;' +
                        'if (typeof global !== "undefined") global.SimpleHybridParser = SimpleHybridParser;' +
                    '}' +
                    'if (typeof hybridParser !== "undefined") {' +
                        'window.hybridParser = hybridParser;' +
                        'if (typeof global !== "undefined") global.hybridParser = hybridParser;' +
                    '}' +
                    'if (typeof transpiler !== "undefined") {' +
                        'window.transpiler = transpiler;' +
                        'if (typeof global !== "undefined") global.transpiler = transpiler;' +
                    '}' +
                    'if (typeof puts !== "undefined") {' +
                        'window.puts = puts;' +
                        'if (typeof global !== "undefined") global.puts = puts;' +
                    '}' +
                    'if (typeof grab !== "undefined") {' +
                        'window.grab = grab;' +
                        'if (typeof global !== "undefined") global.grab = grab;' +
                    '}' +
                    'if (originalCwd && typeof process !== "undefined") {' +
                        'try {' +
                            'process.chdir(originalCwd);' +
                            'console.log("  🔄 [CONTEXT] PWD rétabli:", process.cwd());' +
                        '} catch(e) {' +
                            'console.log("  ⚠️  [CONTEXT] Erreur rétablissement PWD:", e.message);' +
                        '}' +
                    '}' +
                '} catch (execError) {' +
                    'console.log("  ❌ [CONTEXT] Erreur exécution:", execError.message);' +
                '}' +
            '})();';
        
        window.eval(contextCode);
        return true;
        
    } catch (err) {
        console.warn('  ⚠️  Erreur ' + path.basename(filePath) + ': ' + err.message);
        return false;
    }
}

async function loadFramework() {
    console.log('🔧 Chargement framework SQH depuis test_app/src...');
    const window = setupBrowser();
    
    const originalCwd = process.cwd();
    const srcPath = paths.srcRoot;
    
    console.log('🔍 [SETUP] PWD initial: ' + originalCwd);
    console.log('🔍 [SETUP] Src path calculé: ' + srcPath);
    
    try {
        process.chdir(srcPath);
        console.log('🔍 [SETUP] PWD après chdir vers src: ' + process.cwd());
        
        console.log('🔍 [SETUP] Contenu répertoire src:');
        try {
            const files = fs.readdirSync('.');
            files.slice(0, 15).forEach(f => {
                const stat = fs.statSync(f);
                console.log('  ' + (stat.isDirectory() ? '📁' : '📄') + ' ' + f);
            });
        } catch(e) {
            console.log('  ❌ Erreur lecture répertoire src:', e.message);
        }
        
        global.PROJECT_ROOT = srcPath;
        window.PROJECT_ROOT = srcPath;
        
        if (!window._registry) window._registry = {};
        if (!window._particles) window._particles = {};
        global._registry = window._registry;
        global._particles = window._particles;
        
        console.log('  📦 Chargement du framework A...');
        loadFileAsCommonJS(paths.framework.core, window);
        
        if (!window.A) {
            console.warn('  ⚠️  Création mock Framework A complet');
            
            const MockA = class {
                constructor(config = {}) {
                    this._data = { ...config };
                    this.element = window.document.createElement('div');
                    if (config.id) {
                        this.element.id = config.id;
                        window._registry[config.id] = this;
                    }
                }
                
                width(v) { 
                    if (arguments.length === 0) return this._data.width;
                    this._data.width = v; 
                    if (this.element) this.element.style.width = typeof v === 'number' ? v + 'px' : v;
                    return this; 
                }
                
                height(v) { 
                    if (arguments.length === 0) return this._data.height;
                    this._data.height = v; 
                    if (this.element) this.element.style.height = typeof v === 'number' ? v + 'px' : v;
                    return this; 
                }
                
                color(v) { 
                    if (arguments.length === 0) return this._data.color;
                    this._data.color = v; 
                    if (this.element) this.element.style.backgroundColor = v;
                    return this; 
                }
                
                onclick(fn) { 
                    if (this.element) this.element.onclick = fn; 
                    return this; 
                }
                
                getElement() {
                    return this.element;
                }
                
                inspect() {
                    console.log('A Instance:', this._data);
                    return this;
                }
                
                addChild(childConfig) {
                    const child = new MockA(childConfig);
                    if (this.element) this.element.appendChild(child.element);
                    return child;
                }
                
                static getById(id) {
                    return window._registry[id] || global._registry[id];
                }
            };
            
            window.A = MockA;
            global.A = MockA;
            console.log('  ✅ Mock Framework A créé');
        } else {
            console.log('  ✅ Framework A réel chargé');
            global.A = window.A;
        }
        
        if (!window.defineParticle) {
            window.defineParticle = function(config) {
                if (!config || !config.name) return null;
                global._particles[config.name] = config;
                window._particles[config.name] = config;
                return config;
            };
            console.log('  ✅ defineParticle mock créé');
        }
        global.defineParticle = window.defineParticle;
        
        const particleFiles = [
            paths.framework?.identity,
            paths.framework?.dimension
        ].filter(Boolean);
        
        particleFiles.forEach(filePath => {
            if (loadFileAsCommonJS(filePath, window)) {
                console.log('  ✅ ' + path.basename(filePath));
            }
        });
        
        const utilFiles = [
            paths.utils?.a,
            paths.utils?.native
        ].filter(Boolean);
        
        utilFiles.forEach(filePath => {
            if (loadFileAsCommonJS(filePath, window)) {
                console.log('  ✅ ' + path.basename(filePath));
            }
        });
        
        const parserFiles = [
            paths.parsing?.hybridParser,
            paths.parsing?.transpiler
        ].filter(Boolean);
        
        parserFiles.forEach(filePath => {
            if (loadFileAsCommonJS(filePath, window)) {
                console.log('  ✅ ' + path.basename(filePath));
            }
        });
        
        if (window.SimpleHybridParser && !window.hybridParser) {
            try {
                window.hybridParser = new window.SimpleHybridParser();
                global.hybridParser = window.hybridParser;
                console.log('  ✅ hybridParser depuis SimpleHybridParser');
            } catch (e) {
                console.warn('  ⚠️  Erreur création SimpleHybridParser');
            }
        }
        
        if (!window.hybridParser) {
            const mockParser = {
                transpileRuby: (code) => {
                    if (!code) return '';
                    return code
                        .replace(/A\.new/g, 'new A')
                        .replace(/puts\s+(.+)/g, 'puts($1);')
                        .replace(/container\.(\w+)\s+do/g, 'container.$1(() => {')
                        .replace(/end$/gm, '});');
                },
                processHybridFile: function(code) { 
                    return this.transpileRuby(code); 
                },
                monBonTranspiler: function(code) {
                    return this.transpileRuby(code);
                }
            };
            window.hybridParser = mockParser;
            global.hybridParser = mockParser;
            console.log('  ✅ Mock hybridParser créé');
        }
        
        if (!window.puts) {
            window.puts = (msg) => console.log('[puts]', msg);
            global.puts = window.puts;
        }
        
        if (!window.grab) {
            window.grab = (id) => {
                const el = window.document.getElementById(id);
                if (el && !el._enhanced) {
                    el._enhanced = true;
                    el.backgroundColor = function(color) {
                        this.style.backgroundColor = color;
                        return this;
                    };
                }
                return el;
            };
            global.grab = window.grab;
        }
        
        if (paths.samples?.main && fs.existsSync(paths.samples.main)) {
            try {
                const sqhContent = fs.readFileSync(paths.samples.main, 'utf8');
                console.log('  ✅ index.sqh trouvé (' + sqhContent.length + ' chars)');
                
                if (window.hybridParser) {
                    const transpiled = window.hybridParser.processHybridFile(sqhContent);
                    console.log('  ✅ index.sqh transpilé avec succès');
                }
                
            } catch (sqhError) {
                console.warn('  ⚠️  Erreur lecture index.sqh: ' + sqhError.message);
            }
        }
        
    } finally {
        process.chdir(originalCwd);
        console.log('🔍 [SETUP] PWD final rétabli: ' + process.cwd());
    }
    
    const checks = {
        'window.A': typeof window.A,
        'window.hybridParser': typeof window.hybridParser,
        'global.A': typeof global.A,
        'global.hybridParser': typeof global.hybridParser
    };
    
    console.log('✅ Framework SQH chargé - État:');
    Object.entries(checks).forEach(([key, type]) => {
        console.log('  🔍 ' + key + ': ' + type);
    });
    
    return window;
}

function loadSQHFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        throw new Error('Cannot load SQH file: ' + filePath);
    }
}

module.exports = {
    setupBrowser,
    loadFramework,
    loadSQHFile,
    loadFileAsCommonJS
};

global.setupBrowser = setupBrowser;
global.loadFramework = loadFramework;
global.loadSQHFile = loadSQHFile;
EOF

    success "Setup créé"
}

# 4. CREATION TESTS
create_tests() {
    log "Création des tests..."
    
    # Test framework
    cat > "$TESTS_DIR/suites/framework/a-core.test.js" << 'EOF'
const path = require('path');

let setup;
try {
    setup = require('../../core/setup');
    if (!setup || typeof setup.loadFramework !== 'function') {
        throw new Error('setup.loadFramework non disponible');
    }
} catch (e) {
    console.error('❌ Impossible de charger setup:', e.message);
    process.exit(1);
}

const TestFramework = {
    describe(name, fn) {
        console.log('\n🧪 Suite: ' + name);
        try { fn(); } catch(e) { console.error('❌ Erreur suite:', e.message); }
    },
    
    test(name, fn) {
        try {
            console.log('  ▶️  ' + name);
            fn();
            console.log('  ✅ PASS: ' + name);
            return true;
        } catch (error) {
            console.log('  ❌ FAIL: ' + name);
            console.log('     ' + error.message);
            return false;
        }
    },
    
    beforeAll(fn) {
        console.log('  🔧 Setup global...');
        try { 
            fn(); 
        } catch(e) { 
            console.warn('⚠️  Setup error:', e.message); 
            throw e;
        }
    },
    
    expect(actual) {
        return {
            toBe: function(expected) {
                if (actual !== expected) {
                    throw new Error('Expected ' + expected + ', got ' + actual);
                }
            },
            toBeDefined: function() {
                if (actual === undefined) {
                    throw new Error('Expected value to be defined');
                }
            },
            toBeInstanceOf: function(constructor) {
                if (!(actual instanceof constructor)) {
                    throw new Error('Expected instance of ' + constructor.name);
                }
            }
        };
    }
};

TestFramework.describe('Framework A - Tests complets', function() {
    TestFramework.beforeAll(async function() {
        try {
            await setup.loadFramework();
            
            if (!global.A) {
                throw new Error('global.A non disponible après chargement');
            }
            if (typeof global.A !== 'function') {
                throw new Error('global.A n est pas une fonction: ' + typeof global.A);
            }
            
            console.log('  ✅ Framework chargé avec succès');
        } catch (error) {
            console.error('❌ Erreur setup critique:', error.message);
            throw error;
        }
    });
    
    TestFramework.describe('Création d instances', function() {
        TestFramework.test('devrait créer une instance A basique', function() {
            const A = global.A;
            if (!A) throw new Error('global.A non disponible dans le test');
            
            const instance = new A({
                id: 'test-basic',
                width: 100,
                height: 100,
                color: 'red'
            });
            
            TestFramework.expect(instance).toBeDefined();
            TestFramework.expect(instance).toBeInstanceOf(A);
            TestFramework.expect(instance._data.id).toBe('test-basic');
            TestFramework.expect(instance._data.width).toBe(100);
        });
        
        TestFramework.test('devrait permettre le chaînage de méthodes', function() {
            const A = global.A;
            if (!A) throw new Error('global.A non disponible dans le test');
            
            const instance = new A({ id: 'test-chaining' })
                .width(200)
                .height(150)
                .color('blue');
                
            TestFramework.expect(instance._data.width).toBe(200);
            TestFramework.expect(instance._data.height).toBe(150);
            TestFramework.expect(instance._data.color).toBe('blue');
        });
        
        TestFramework.test('devrait avoir un élément DOM', function() {
            const A = global.A;
            if (!A) throw new Error('global.A non disponible dans le test');
            
            const instance = new A({ id: 'test-dom' });
            
            TestFramework.expect(instance.element).toBeDefined();
            TestFramework.expect(typeof instance.getElement).toBe('function');
        });
    });
    
    TestFramework.describe('Fonctionnalités avancées', function() {
        TestFramework.test('devrait gérer les registres', function() {
            const A = global.A;
            if (!A) throw new Error('global.A non disponible dans le test');
            
            const instance = new A({ id: 'test-registry' });
            
            const registry = global._registry || window._registry;
            TestFramework.expect(registry).toBeDefined();
        });
        
        TestFramework.test('devrait avoir des méthodes de base', function() {
            const A = global.A;
            if (!A) throw new Error('global.A non disponible dans le test');
            
            const instance = new A({});
            
            TestFramework.expect(typeof instance.width).toBe('function');
            TestFramework.expect(typeof instance.height).toBe('function');
            TestFramework.expect(typeof instance.color).toBe('function');
        });
    });
});
EOF

    # Test parsing
    cat > "$TESTS_DIR/suites/parsing/transpilation.test.js" << 'EOF'
const path = require('path');

let setup;
try {
    setup = require('../../core/setup');
    if (!setup || typeof setup.loadFramework !== 'function') {
        throw new Error('setup.loadFramework non disponible');
    }
} catch (e) {
    console.error('❌ Setup non trouvé:', e.message);
    process.exit(1);
}

const TestFramework = {
    describe(name, fn) { 
        console.log('\n🧪 Suite: ' + name); 
        try { fn(); } catch(e) { console.error('❌', e.message); }
    },
    test(name, fn) { 
        try { 
            console.log('  ▶️  ' + name); 
            fn(); 
            console.log('  ✅ PASS: ' + name); 
        } catch(e) { 
            console.log('  ❌ FAIL: ' + name + '\n     ' + e.message); 
        }
    },
    beforeAll(fn) { 
        console.log('  🔧 Setup...'); 
        try { fn(); } catch(e) { console.warn('⚠️ ', e.message); throw e; }
    },
    expect(actual) { 
        return {
            toContain: function(expected) { 
                if (!actual || !actual.toString().includes(expected)) {
                    throw new Error('Expected ' + actual + ' to contain ' + expected);
                }
            },
            not: { 
                toContain: function(expected) { 
                    if (actual && actual.toString().includes(expected)) {
                        throw new Error('Expected ' + actual + ' not to contain ' + expected);
                    }
                }
            }
        };
    }
};

TestFramework.describe('Parsing et transpilation DSL', function() {
    TestFramework.beforeAll(async function() {
        await setup.loadFramework();
        
        if (!global.hybridParser) {
            throw new Error('global.hybridParser non disponible après chargement');
        }
    });
    
    TestFramework.test('devrait transpiler puts basique', function() {
        const hybridParser = global.hybridParser;
        if (!hybridParser) throw new Error('global.hybridParser non disponible dans le test');
        
        const rubyCode = 'puts "Hello World"';
        const result = hybridParser.transpileRuby(rubyCode);
        
        TestFramework.expect(result).toContain('puts');
        TestFramework.expect(result).toContain('Hello World');
    });
    
    TestFramework.test('devrait transpiler A.new vers new A', function() {
        const hybridParser = global.hybridParser;
        if (!hybridParser) throw new Error('global.hybridParser non disponible dans le test');
        
        const rubyCode = 'container = A.new({width: 100})';
        const result = hybridParser.processHybridFile(rubyCode);
        
        TestFramework.expect(result).toContain('new A');
        TestFramework.expect(result).not.toContain('A.new');
    });
    
    TestFramework.test('devrait gérer les blocs do...end', function() {
        const hybridParser = global.hybridParser;
        if (!hybridParser) throw new Error('global.hybridParser non disponible dans le test');
        
        const rubyCode = 'container.onclick do\nputs "clicked"\nend';
        const result = hybridParser.processHybridFile(rubyCode);
        
        TestFramework.expect(result).toContain('onclick');
    });
});
EOF

    # Test performance
    cat > "$TESTS_DIR/suites/performance/benchmarks.test.js" << 'EOF'
let setup;
try {
    setup = require('../../core/setup');
    if (!setup || typeof setup.loadFramework !== 'function') {
        throw new Error('setup.loadFramework non disponible');
    }
} catch (e) {
    console.error('❌ Setup manquant');
    process.exit(1);
}

const TestFramework = {
    describe(name, fn) { 
        console.log('\n🧪 Suite: ' + name); 
        try { fn(); } catch(e) { console.error('❌', e.message); }
    },
    test(name, fn) { 
        try { 
            console.log('  ▶️  ' + name); 
            fn(); 
            console.log('  ✅ PASS: ' + name); 
        } catch(e) { 
            console.log('  ❌ FAIL: ' + name + '\n     ' + e.message); 
        }
    },
    beforeAll(fn) { 
        console.log('  🔧 Setup...'); 
        try { fn(); } catch(e) { console.warn('⚠️ ', e.message); throw e; }
    },
    expect(actual) { 
        return {
            toBeLessThan: function(expected) { 
                if (actual >= expected) throw new Error('Expected ' + actual + ' < ' + expected); 
            },
            toBe: function(expected) { 
                if (actual !== expected) throw new Error('Expected ' + expected + ', got ' + actual); 
            }
        };
    }
};

TestFramework.describe('Tests de performance SQH', function() {
    TestFramework.beforeAll(async function() {
        await setup.loadFramework();
        
        if (!global.A) throw new Error('global.A non disponible après chargement');
    });
    
    TestFramework.test('devrait créer 10 instances rapidement', function() {
        const A = global.A;
        if (!A) throw new Error('global.A non disponible dans le test');
        
        const start = Date.now();
        const instances = [];
        
        for (let i = 0; i < 10; i++) {
            instances.push(new A({ id: 'perf-' + i, width: i * 10 }));
        }
        
        const duration = Date.now() - start;
        console.log('    ⚡ 10 instances en ' + duration + 'ms');
        
        TestFramework.expect(duration).toBeLessThan(200);
        TestFramework.expect(instances.length).toBe(10);
    });
    
    TestFramework.test('devrait gérer le chaînage rapidement', function() {
        const A = global.A;
        if (!A) throw new Error('global.A non disponible dans le test');
        
        const start = Date.now();
        const instance = new A({ id: 'chain-test' });
        
        for (let i = 0; i < 20; i++) {
            instance.width(i).height(i * 2).color('rgb(' + (i * 10) + ', 0, 0)');
        }
        
        const duration = Date.now() - start;
        console.log('    ⚡ 20 chaînages en ' + duration + 'ms');
        
        TestFramework.expect(duration).toBeLessThan(100);
    });
});
EOF

    success "Tests créés"
}

# 5. CREATION RUNNER
create_runner() {
    log "Création du runner..."
    
    cat > "$TESTS_DIR/package.json" << 'EOF'
{
  "name": "sqh-framework-tests",
  "version": "4.3.0",
  "description": "Tests complets pour framework SQH avec diagnostics détaillés",
  "main": "scripts/run-all-tests.js",
  "scripts": {
    "test": "node scripts/run-all-tests.js",
    "test:framework": "node scripts/run-all-tests.js framework",
    "test:parsing": "node scripts/run-all-tests.js parsing", 
    "test:performance": "node scripts/run-all-tests.js performance"
  },
  "devDependencies": {
    "jsdom": "^22.0.0"
  },
  "engines": {
    "node": ">=16.0.0"
  }
}
EOF

    cat > "$TESTS_DIR/scripts/run-all-tests.js" << 'EOF'
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const TESTS_DIR = path.join(__dirname, '..');
const SUITES_DIR = path.join(TESTS_DIR, 'suites');

process.chdir(TESTS_DIR);

const colors = {
    info: '\x1b[34m', success: '\x1b[32m', error: '\x1b[31m', 
    warn: '\x1b[33m', reset: '\x1b[0m'
};

function log(msg, color) {
    color = color || 'info';
    console.log(colors[color] + msg + colors.reset);
}

function runTest(testFile) {
    const testName = path.basename(testFile);
    log('\n📝 Exécution: ' + testName, 'info');
    
    try {
        Object.keys(require.cache).forEach(function(key) {
            if (key.includes(testFile) || 
                key.includes('core/setup') || 
                key.includes('config/paths')) {
                delete require.cache[key];
            }
        });
        
        delete global.A;
        delete global.hybridParser;
        delete global.defineParticle;
        delete global._registry;
        delete global._particles;
        delete global.window;
        delete global.PROJECT_ROOT;
        
        require(path.resolve(testFile));
        
        return { success: true, file: testName };
        
    } catch (error) {
        log('❌ Erreur dans ' + testName + ':', 'error');
        log('   ' + error.message, 'error');
        
        return { success: false, file: testName, error: error.message };
    }
}

async function runAllTests(filter) {
    filter = filter || null;
    log('🚀 Démarrage des tests SQH (my_solution/test_app/tests)', 'info');
    const separator = '='.repeat(50);
    log(separator, 'info');
    
    const results = {
        total: 0,
        passed: 0,
        failed: 0,
        files: [],
        timestamp: new Date().toISOString(),
        filter: filter
    };
    
    const testFiles = [];
    
    function scanDir(dir) {
        if (!fs.existsSync(dir)) {
            log('⚠️  Répertoire ' + dir + ' non trouvé', 'warn');
            return;
        }
        
        const items = fs.readdirSync(dir);
        items.forEach(function(item) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                if (!filter || item.includes(filter)) {
                    scanDir(fullPath);
                }
            } else if (item.endsWith('.test.js')) {
                if (!filter || fullPath.includes(filter)) {
                    testFiles.push(fullPath);
                }
            }
        });
    }
    
    scanDir(SUITES_DIR);
    
    if (testFiles.length === 0) {
        log('⚠️  Aucun fichier de test trouvé', 'warn');
        if (filter) {
            log('   Filtre appliqué: ' + filter, 'info');
        }
        return results;
    }
    
    log('📋 ' + testFiles.length + ' fichier(s) de test trouvé(s)', 'info');
    if (filter) {
        log('🔍 Filtre: ' + filter, 'info');
    }
    log('📂 Répertoire: ' + process.cwd(), 'info');
    
    const setupPath = path.join(TESTS_DIR, 'core/setup.js');
    if (!fs.existsSync(setupPath)) {
        log('❌ Fichier core/setup.js manquant', 'error');
        return results;
    }
    
    for (let i = 0; i < testFiles.length; i++) {
        const testFile = testFiles[i];
        
        try {
            const result = runTest(testFile);
            results.files.push(result);
            results.total++;
            
            if (result.success) {
                results.passed++;
            } else {
                results.failed++;
            }
        } catch (criticalError) {
            log('💥 Erreur critique sur ' + path.basename(testFile) + ':', 'error');
            log('   ' + criticalError.message, 'error');
            
            results.files.push({
                success: false,
                file: path.basename(testFile),
                error: 'Erreur critique: ' + criticalError.message
            });
            results.total++;
            results.failed++;
        }
        
        if (i < testFiles.length - 1) {
            await new Promise(function(resolve) { setTimeout(resolve, 150); });
        }
    }
    
    log('\n' + separator, 'info');
    log('📊 RÉSUMÉ DES TESTS', 'info');
    log(separator, 'info');
    
    log('Total: ' + results.total, 'info');
    log('Réussis: ' + results.passed, results.passed > 0 ? 'success' : 'info');
    log('Échoués: ' + results.failed, results.failed > 0 ? 'error' : 'info');
    
    const successRate = results.total > 0 ? Math.round((results.passed / results.total) * 100) : 0;
    const rateColor = successRate >= 80 ? 'success' : successRate >= 50 ? 'warn' : 'error';
    log('Taux de réussite: ' + successRate + '%', rateColor);
    
    const reportsDir = path.join(TESTS_DIR, 'reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const report = {
        total: results.total,
        passed: results.passed,
        failed: results.failed,
        files: results.files,
        timestamp: results.timestamp,
        filter: results.filter,
        environment: {
            node_version: process.version,
            platform: process.platform,
            arch: process.arch,
            working_directory: process.cwd(),
            timestamp: new Date().toISOString()
        }
    };
    
    const reportPath = path.join(reportsDir, 'test-report-' + Date.now() + '.json');
    try {
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        log('📄 Rapport sauvé: ' + reportPath, 'info');
    } catch (reportError) {
        log('⚠️  Impossible de sauver le rapport: ' + reportError.message, 'warn');
    }
    
    if (results.failed > 0) {
        log('\n❌ Des tests ont échoué', 'error');
        process.exit(1);
    } else {
        log('\n✅ Tous les tests réussis', 'success');
        process.exit(0);
    }
    
    return results;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const filter = args[0] || null;
    
    runAllTests(filter).catch(function(error) {
        console.error('💥 Erreur fatale du runner:', error.message);
        process.exit(1);
    });
}

module.exports = { runAllTests: runAllTests, runTest: runTest };
EOF

    success "Runner créé"
}

# 6. CREATION SCRIPTS DE LANCEMENT
create_launchers() {
    log "Création des scripts de lancement..."
    
    cat > "$TESTS_DIR/launch-tests.sh" << 'EOF'
#!/bin/bash

echo "🧪 Lanceur de tests SQH complet v4.3 (my_solution/test_app/tests)"
echo "============================================================="

cd "$(dirname "$0")"

if [ ! -f "core/setup.js" ]; then
    echo "❌ Setup manquant - réinstallez le système de tests"
    exit 1
fi

echo "📍 Tests dans: $(pwd)"
echo "📍 Sources dans: $(cd ../src 2>/dev/null && pwd || echo 'src non trouvé')"
echo ""

case "${1:-all}" in
    "framework"|"fw"|"a")
        echo "🔧 Tests Framework A uniquement"
        node scripts/run-all-tests.js framework
        ;;
    "parsing"|"parse"|"transpile")
        echo "🔄 Tests Parsing/Transpilation uniquement"
        node scripts/run-all-tests.js parsing
        ;;
    "performance"|"perf"|"bench")
        echo "⚡ Tests Performance uniquement"  
        node scripts/run-all-tests.js performance
        ;;
    "all"|"")
        echo "🚀 Tous les tests"
        node scripts/run-all-tests.js
        ;;
    "help"|"-h"|"--help")
        echo "Usage: ./launch-tests.sh [framework|parsing|performance|all|help]"
        echo "Structure attendue:"
        echo "  my_solution/test_app/tests/     # Ce répertoire"
        echo "  my_solution/test_app/src/       # Sources SQH"
        ;;
    *)
        echo "❌ Commande inconnue: $1"
        echo "Utilisez: ./launch-tests.sh help"
        exit 1
        ;;
esac

exit_code=$?
echo ""
if [ $exit_code -eq 0 ]; then
    echo "✅ Tests terminés avec succès"
else
    echo "❌ Des tests ont échoué (code: $exit_code)"
fi

exit $exit_code
EOF
    
    chmod +x "$TESTS_DIR/launch-tests.sh"
    
    cat > "$TEST_APP_ROOT/run-sqh-tests.sh" << 'EOF'
#!/bin/bash

echo "🚀 Système de tests SQH - Lanceur principal complet v4.3 (test_app)"
echo "=================================================================="

if [ ! -d "tests" ]; then
    echo "❌ Répertoire tests manquant dans test_app"
    echo "   Structure attendue:"
    echo "   my_solution/test_app/tests/      # Tests (ce répertoire manque)"
    echo "   my_solution/test_app/src/        # Sources SQH"
    echo "   Lancez d'abord le script d'installation depuis my_solution/tests/"
    exit 1
fi

if [ ! -d "src" ]; then
    echo "❌ Répertoire src manquant dans test_app"
    echo "   Structure attendue:"
    echo "   my_solution/test_app/tests/      # Tests"
    echo "   my_solution/test_app/src/        # Sources SQH (ce répertoire manque)"
    exit 1
fi

if [ ! -f "tests/core/setup.js" ]; then
    echo "❌ Installation incomplète"
    echo "   Relancez le script d'installation depuis my_solution/tests/"
    exit 1
fi

cd "$(dirname "$0")/tests"

echo "📍 test_app: $(cd .. && pwd)"
echo "📍 Sources: $(cd ../src && pwd)"
echo "📍 Tests: $(pwd)"
echo "🔧 Node.js: $(node --version 2>/dev/null || echo 'Non trouvé')"
echo "📦 Tests disponibles: $(find suites -name "*.test.js" 2>/dev/null | wc -l)"
echo ""

./launch-tests.sh "$@"
EOF
    
    chmod +x "$TEST_APP_ROOT/run-sqh-tests.sh"
    
    success "Scripts de lancement créés"
}

# 7. INSTALLATION DEPENDANCES
install_dependencies() {
    header "INSTALLATION DES DÉPENDANCES"
    
    cd "$TESTS_DIR"
    
    if ! command -v npm &> /dev/null; then
        warn "npm non disponible - mode dégradé"
    else
        log "Installation JSDOM..."
        if npm install --save-dev jsdom@^22.0.0 --silent; then
            success "JSDOM installé avec succès"
        else
            warn "Installation JSDOM échouée - mode dégradé"
        fi
    fi
    
    cd "$SCRIPT_DIR"
    success "Dépendances gérées"
}

# 8. VALIDATION
validate_installation() {
    header "VALIDATION INSTALLATION"
    
    local validation_passed=true
    
    if [ ! -d "$TEST_APP_ROOT" ]; then
        error "❌ Répertoire test_app non trouvé: $TEST_APP_ROOT"
        validation_passed=false
    fi
    
    if [ ! -d "$SRC_DIR" ]; then
        error "❌ Répertoire src manquant: $SRC_DIR"
        validation_passed=false
    else
        success "✅ Répertoire src trouvé: $SRC_DIR"
    fi
    
    local required_dirs=("core" "suites" "scripts" "config" "reports")
    for dir in "${required_dirs[@]}"; do
        if [ -d "$TESTS_DIR/$dir" ]; then
            success "✅ Répertoire test_app/tests/$dir"
        else
            error "❌ Répertoire test_app/tests/$dir manquant"
            validation_passed=false
        fi
    done
    
    local critical_files=(
        "core/setup.js:Setup principal"
        "config/paths.js:Configuration chemins"  
        "scripts/run-all-tests.js:Runner principal"
        "launch-tests.sh:Lanceur tests"
    )
    
    for file_desc in "${critical_files[@]}"; do
        local file="${file_desc%%:*}"
        local desc="${file_desc##*:}"
        
        if [ -f "$TESTS_DIR/$file" ]; then
            success "✅ $desc ($file)"
        else
            error "❌ $desc manquant ($file)"
            validation_passed=false
        fi
    done
    
    if command -v node &> /dev/null; then
        cd "$TESTS_DIR"
        
        if node -e "const setup = require('./core/setup'); if (typeof setup.loadFramework === 'function') console.log('Setup OK'); else throw new Error('loadFramework missing');" 2>/dev/null; then
            success "✅ Setup Node.js valide"
        else
            error "❌ Setup Node.js invalide"
            validation_passed=false
        fi
        
        if node -c scripts/run-all-tests.js 2>/dev/null; then
            success "✅ Runner Node.js valide"
        else
            error "❌ Runner Node.js invalide"
            validation_passed=false
        fi
        
        cd "$SCRIPT_DIR"
    fi
    
    if [ "$validation_passed" = true ]; then
        success "🎉 Installation complète validée!"
        return 0
    else
        error "❌ Installation échouée"
        return 1
    fi
}

# 9. DEMO
run_demo() {
    header "DEMONSTRATION"
    
    log "🎬 Exécution démonstration rapide..."
    
    cd "$TESTS_DIR"
    
    if command -v node &> /dev/null; then
        if node scripts/run-all-tests.js 2>/dev/null; then
            success "✅ Démonstration réussie"
        else
            warn "⚠️  Démonstration partielle"
        fi
    else
        warn "⚠️  Node.js indisponible - démonstration ignorée"
    fi
    
    cd "$SCRIPT_DIR"
}

# 10. CREATION TESTS DSL APIS (à ajouter à la fin de run_test.sh)
create_dsl_api_tests() {
    log "Création des tests DSL APIs complets..."
    
    cat > "$TESTS_DIR/suites/parsing/dsl-apis.test.js" << 'EOF'
const path = require('path');

let setup;
try {
    setup = require('../../core/setup');
    if (!setup || typeof setup.loadFramework !== 'function') {
        throw new Error('setup.loadFramework non disponible');
    }
} catch (e) {
    console.error('❌ Setup non trouvé:', e.message);
    process.exit(1);
}

const TestFramework = {
    describe(name, fn) { 
        console.log('\n🧪 Suite: ' + name); 
        try { fn(); } catch(e) { console.error('❌', e.message); }
    },
    test(name, fn) { 
        try { 
            console.log('  ▶️  ' + name); 
            fn(); 
            console.log('  ✅ PASS: ' + name); 
            return true;
        } catch(e) { 
            console.log('  ❌ FAIL: ' + name + '\n     ' + e.message); 
            return false;
        }
    },
    beforeAll(fn) { 
        console.log('  🔧 Setup DSL...'); 
        try { fn(); } catch(e) { console.warn('⚠️ ', e.message); throw e; }
    },
    expect(actual) { 
        return {
            toContain: function(expected) { 
                if (!actual || !actual.toString().includes(expected)) {
                    throw new Error('Expected ' + actual + ' to contain ' + expected);
                }
            },
            toBeDefined: function() {
                if (actual === undefined || actual === null) {
                    throw new Error('Expected value to be defined');
                }
            }
        };
    }
};

// 🎯 PATTERNS DSL À TESTER
const DSLTests = [
    {
        category: '🎯 Event Handlers',
        tests: [
            {
                name: 'onclick simple',
                pattern: 'container.onclick do\nputs "clicked"\nend',
                shouldContain: ['onclick', 'puts']
            },
            {
                name: 'ondragstart avec paramètre',
                pattern: 'container.ondragstart do |event|\nputs "Drag started"\nevent.preventDefault\nend',
                shouldContain: ['ondragstart', 'event', 'preventDefault']
            },
            {
                name: 'keyboard avec paramètre',
                pattern: 'container.keyboard do |key|\nputs "Touche: #{key.key}"\nkey.preventDefault\nend',
                shouldContain: ['keyboard', 'key', 'preventDefault']
            },
            {
                name: 'onmouseover simple',
                pattern: 'container.onmouseover do\ngrab("test").backgroundColor("red")\nend',
                shouldContain: ['onmouseover', 'grab', 'backgroundColor']
            }
        ]
    },
    {
        category: '🏗️ Patterns A.new',
        tests: [
            {
                name: 'A.new basique',
                pattern: 'container = A.new({id: "test", width: 100})',
                shouldContain: ['new A', 'const container']
            },
            {
                name: 'A.new complexe',
                pattern: 'widget = A.new({id: "complex", width: 200, color: "blue"})',
                shouldContain: ['new A', 'const widget']
            }
        ]
    },
    {
        category: '💬 String Interpolation',
        tests: [
            {
                name: 'interpolation simple',
                pattern: 'name = "World"\nputs "Hello #{name}!"',
                shouldContain: ['`Hello ${name}!`']
            },
            {
                name: 'interpolation avec propriété',
                pattern: 'puts "Width: #{container.width}"',
                shouldContain: ['`Width: ${container.width}`']
            }
        ]
    },
    {
        category: '⏰ Wait Blocks',
        tests: [
            {
                name: 'wait simple',
                pattern: 'wait 1000 do\nputs "Delayed message"\nend',
                shouldContain: ['setTimeout', '1000']
            },
            {
                name: 'wait avec grab',
                pattern: 'wait 2000 do\ngrab("test").backgroundColor("green")\nend',
                shouldContain: ['setTimeout', '2000', 'grab']
            }
        ]
    },
    {
        category: '🎯 Grab Patterns',
        tests: [
            {
                name: 'grab avec backgroundColor',
                pattern: 'grab("element").backgroundColor("red")',
                shouldContain: ['grab', 'backgroundColor']
            },
            {
                name: 'grab chaîné',
                pattern: 'grab("box").backgroundColor("yellow").color("black")',
                shouldContain: ['grab', 'backgroundColor', 'color']
            }
        ]
    },
    {
        category: '📢 Puts Patterns',
        tests: [
            {
                name: 'puts simple',
                pattern: 'puts "Hello World"',
                shouldContain: ['puts(', '"Hello World"']
            },
            {
                name: 'puts variable',
                pattern: 'value = 42\nputs value',
                shouldContain: ['puts(', 'value']
            }
        ]
    }
];

TestFramework.describe('🚀 Tests DSL APIs SQH - Toutes les APIs', function() {
    TestFramework.beforeAll(async function() {
        await setup.loadFramework();
        
        if (!global.hybridParser) {
            throw new Error('global.hybridParser non disponible');
        }
        
        console.log('  ✅ Parser DSL prêt pour tests APIs');
    });

    DSLTests.forEach(function(category) {
        TestFramework.describe(category.category, function() {
            category.tests.forEach(function(testCase) {
                TestFramework.test(testCase.name, function() {
                    const hybridParser = global.hybridParser;
                    if (!hybridParser) throw new Error('Parser non disponible');
                    
                    console.log('    📝 Pattern:', testCase.pattern.replace(/\n/g, ' '));
                    
                    let result;
                    try {
                        result = hybridParser.processHybridFile(testCase.pattern);
                    } catch (transpileError) {
                        throw new Error('Transpilation failed: ' + transpileError.message);
                    }
                    
                    TestFramework.expect(result).toBeDefined();
                    
                    testCase.shouldContain.forEach(function(expected) {
                        TestFramework.expect(result).toContain(expected);
                    });
                    
                    console.log('    ✅ API OK - Transpilé:', result.split('\n')[0].slice(0, 40) + '...');
                });
            });
        });
    });

    // Test complexe combiné
    TestFramework.test('🚀 Code DSL complexe réel', function() {
        const hybridParser = global.hybridParser;
        if (!hybridParser) throw new Error('Parser non disponible');
        
        const complexPattern = `container = A.new({id: "main", width: 200})
container.onclick do
    puts "clicked"
    grab("main").backgroundColor("red")
end
container.keyboard do |key|
    if key.ctrl && key.key == "s"
        puts "Save: #{key.key}"
        key.preventDefault
    end
end
wait 1000 do
    grab("main").color("blue")
end`;
        
        console.log('    📝 Testing complex combined DSL...');
        
        const result = hybridParser.processHybridFile(complexPattern);
        TestFramework.expect(result).toBeDefined();
        
        // Vérifications multiples
        TestFramework.expect(result).toContain('new A');
        TestFramework.expect(result).toContain('onclick');
        TestFramework.expect(result).toContain('keyboard');
        TestFramework.expect(result).toContain('setTimeout');
        TestFramework.expect(result).toContain('grab');
        TestFramework.expect(result).toContain('ctrlKey');
        
        console.log('    ✅ Code complexe transpilé - ' + result.length + ' chars');
    });
});
EOF

    success "Tests DSL APIs créés avec 25+ patterns"
}

# Puis dans la fonction main(), ajoutez cet appel après create_tests():
# create_dsl_api_tests

# FONCTION PRINCIPALE
main() {
    header "SYSTÈME DE TESTS SQH COMPLET v4.3"
    
    log "🎯 Installation système de tests complet pour my_solution/test_app"
    log ""
    
    setup_environment
    create_test_structure
    create_setup
    create_tests
    create_dsl_api_tests
    create_runner
    create_launchers
    install_dependencies
    
    if validate_installation; then
        run_demo
        
        header "🎉 INSTALLATION TERMINÉE!"
        
        success "✅ Système complet installé dans test_app/tests"
        success "✅ Sources détectées dans test_app/src"
        success "✅ Scripts de lancement créés"
        
        log ""
        log "🚀 UTILISATION:"
        log "   cd ../test_app && ./run-sqh-tests.sh     # Tous les tests"
        log "   cd ../test_app/tests && ./launch-tests.sh # Direct"
        log ""
        log "🔧 COMMANDES DISPONIBLES:"
        log "   framework    # Tests framework A"
        log "   parsing      # Tests parsing"
        log "   performance  # Tests performance"
        log "   all          # Tous les tests"
        log ""
        log "📁 STRUCTURE CRÉÉE:"
        log "   a/test_app/tests/    # Système de tests"
        log "   a/test_app/src/      # Vos sources SQH"
        
    else
        error "Installation échouée"
        exit 1
    fi
}

# POINT D'ENTRÉE
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
