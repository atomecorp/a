#!/bin/bash

# 🚀 Working Test Runner - Version qui marche !

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Working Test Runner${NC}"
echo "=================================="

# Créer le dossier de tests
mkdir -p working_tests

# Test 1: Basique
cat > working_tests/01_basic.sqh << 'EOF'
# Test 1: Création basique
puts "=== Test Basique ==="

container = A.new({
    id: 'container1',
    x: 50,
    y: 100,
    width: 200,
    height: 150
})

puts "Container créé avec succès"
EOF

# Test 2: Events
cat > working_tests/02_events.sqh << 'EOF'
# Test 2: Events
puts "=== Test Events ==="

button = A.new({
    id: 'button1',
    text: 'Click me'
})

button.onclick do
    puts "Button clicked!"
end

puts "Event handler configuré"
EOF

# Test 3: Wait timing
cat > working_tests/03_timing.sqh << 'EOF'
# Test 3: Timing
puts "=== Test Timing ==="

box = A.new({
    id: 'timer_box',
    color: 'red'
})

wait 1000 do
    puts "Timer triggered after 1000ms"
end

puts "Timer configured"
EOF

# Test 4: Grab API
cat > working_tests/04_grab.sqh << 'EOF'
# Test 4: Grab API
puts "=== Test Grab ==="

element = A.new({
    id: 'grab_target',
    color: 'blue'
})

grab("grab_target").backgroundColor("green")
grab("grab_target").text("Modified!")

puts "Grab operations completed"
EOF

# Test 5: String interpolation
cat > working_tests/05_interpolation.sqh << 'EOF'
# Test 5: String interpolation
puts "=== Test Interpolation ==="

name = "World"
message = "Hello #{name}!"
puts message

count = 42
status = "Count is #{count}"
puts status
EOF

# Créer le transpiler corrigé
cat > fixed_transpiler.js << 'JSEOF'
// Transpiler Ruby vers JavaScript - VERSION CORRIGÉE
function transpiler(ruby) {
    console.log("=== INPUT RUBY ===");
    console.log(ruby);
    
    let js = ruby;
    
    // 🔧 CORRECTION 1: Commentaires Ruby # -> JavaScript //
    js = js.replace(/^#(.*)$/gm, '//$1');
    
    // 🔧 CORRECTION 2: A.new -> new A
    js = js.replace(/(\w+)\s*=\s*A\.new\s*\(/g, 'const $1 = new A(');
    
    // 🔧 CORRECTION 3: puts
    js = js.replace(/puts\s+"([^"]+)"/g, 'puts("$1");');
    js = js.replace(/puts\s+([a-zA-Z_]\w*)/g, 'puts($1);');
    
    // 🔧 CORRECTION 4: Variable assignments
    js = js.replace(/^(\w+)\s*=\s*"([^"]+)"$/gm, 'const $1 = "$2";');
    js = js.replace(/^(\w+)\s*=\s*(\d+)$/gm, 'const $1 = $2;');
    js = js.replace(/^(\w+)\s*=\s*`([^`]+)`$/gm, 'const $1 = `$2`;');
    
    // 🔧 CORRECTION 5: do...end -> () => { ... }
    js = js.replace(/(\w+)\.(\w+)\s+do$/gm, '$1.$2(() => {');
    js = js.replace(/^end$/gm, '});');
    
    // 🔧 CORRECTION 6: wait blocks
    js = js.replace(/wait\s+(\d+)\s+do$/gm, 'wait($1, () => {');
    
    // 🔧 CORRECTION 7: grab calls
    js = js.replace(/grab\("([^"]+)"\)\.(\w+)\("([^"]+)"\)/g, 'grab("$1").$2("$3");');
    
    // 🔧 CORRECTION 8: String interpolation #{var} -> ${var}
    js = js.replace(/"([^"]*?)#\{([^}]+)\}([^"]*?)"/g, '`$1\${$2}$3`');
    
    console.log("=== OUTPUT JS ===");
    console.log(js);
    
    return js;
}

// Simuler l'environnement complet
global.puts = (msg) => console.log("PUTS:", msg);

global.grab = (id) => ({
    backgroundColor: (color) => console.log(`GRAB(${id}).backgroundColor(${color})`),
    color: (color) => console.log(`GRAB(${id}).color(${color})`),
    text: (text) => console.log(`GRAB(${id}).text(${text})`)
});

global.wait = (delay, fn) => {
    console.log(`WAIT(${delay}ms)`);
    if (fn) {
        console.log("Executing wait callback immediately for test");
        fn();
    }
};

global.A = class {
    constructor(config) {
        this.config = config;
        this.id = config?.id;
        console.log("A created:", config);
    }
    
    onclick(fn) {
        console.log("onclick handler set");
        if (fn) {
            console.log("Executing onclick callback for test");
            fn();
        }
        return this;
    }
    
    onmouseover(fn) {
        console.log("onmouseover handler set");
        return this;
    }
    
    keyboard(fn) {
        console.log("keyboard handler set");
        return this;
    }
};

// Test principal
const fs = require('fs');
const testFile = process.argv[2];

if (!testFile) {
    console.error("Usage: node fixed_transpiler.js <test_file>");
    process.exit(1);
}

try {
    console.log("📄 Loading test file:", testFile);
    const ruby = fs.readFileSync(testFile, 'utf8');
    
    console.log("🔄 Transpiling...");
    const js = transpiler(ruby);
    
    console.log("⚡ Executing JavaScript...");
    eval(js);
    
    console.log("✅ SUCCESS - Test passed!");
    process.exit(0);
    
} catch (error) {
    console.error("❌ ERROR:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
}
JSEOF

echo -e "${GREEN}✅ Tests et transpiler créés${NC}"
echo ""

# Exécuter tous les tests
PASSED=0
FAILED=0

echo -e "${BLUE}🧪 Exécution des tests${NC}"
echo ""

for test_file in working_tests/*.sqh; do
    test_name=$(basename "$test_file")
    echo -e "${YELLOW}Test: $test_name${NC}"
    echo "────────────────────────────────"
    
    if node fixed_transpiler.js "$test_file"; then
        echo -e "${GREEN}✅ PASSÉ${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ ÉCHOUÉ${NC}"
        FAILED=$((FAILED + 1))
    fi
    echo ""
done

# Résumé
echo "=================================="
echo -e "${BLUE}📊 RÉSUMÉ${NC}"
echo "=================================="
echo -e "Total: $((PASSED + FAILED))"
echo -e "Passés: ${GREEN}$PASSED${NC}"
echo -e "Échoués: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 Tous les tests sont passés !${NC}"
else
    echo -e "${YELLOW}⚠️  Il y a encore quelques problèmes à corriger${NC}"
fi

echo ""
echo -e "${BLUE}💡 Prochaines étapes :${NC}"
echo "1. Intégrer ces corrections dans ton transpiler principal"
echo "2. Ajouter plus de tests pour couvrir tous les cas"
echo "3. Tester avec ton vrai framework A.js"