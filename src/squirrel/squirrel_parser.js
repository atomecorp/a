/**
 * 🚀 SQUIRREL PARSER - Séparateur Ruby/JavaScript
 * 
 * MISSION: Analyser du code mixte Ruby/JS et séparer les deux langages
 * ENTRÉE: Code hybride .sqh
 * SORTIE: { ruby: "...", javascript: "...", hybrid: true }
 */

/**
 * 🔍 PARSER PRINCIPAL - Sépare Ruby du JavaScript
 */
function squirrel_parser(hybridCode) {
    if (!hybridCode || typeof hybridCode !== 'string') {
        console.warn('⚠️ Invalid hybrid code input');
        return { ruby: '', javascript: '', hybrid: false };
    }

    console.log('🔍 Squirrel Parser analyzing hybrid code...');

    const lines = hybridCode.split('\n');
    const rubyLines = [];
    const jsLines = [];
    
    let currentMode = 'auto'; // 'auto', 'ruby', 'javascript'

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('####') || trimmed.startsWith('# #')) {
            continue;
        }

        // Detect language markers
        if (trimmed.startsWith('// //') || trimmed === '// JavaScript section') {
            currentMode = 'javascript';
            continue;
        }
        
        if (trimmed.startsWith('#### DSL') || trimmed === '# Ruby section') {
            currentMode = 'ruby';
            continue;
        }

        // Auto-detection based on syntax patterns
        if (currentMode === 'auto') {
            currentMode = detectLanguage(line);
        }

        // Categorize the line
        if (isJavaScriptLine(line) || currentMode === 'javascript') {
            jsLines.push(line);
            currentMode = 'auto'; // Reset for next line
        } else {
            rubyLines.push(line);
            currentMode = 'auto'; // Reset for next line
        }
    }

    const result = {
        ruby: rubyLines.join('\n').trim(),
        javascript: jsLines.join('\n').trim(),
        hybrid: true,
        stats: {
            totalLines: lines.length,
            rubyLines: rubyLines.length,
            jsLines: jsLines.length
        }
    };

    console.log('✅ Squirrel Parser results:', result.stats);
    return result;
}

/**
 * 🕵️ DÉTECTION AUTOMATIQUE DU LANGAGE
 */
function detectLanguage(line) {
    const trimmed = line.trim();
    
    // JavaScript patterns
    const jsPatterns = [
        /^const\s+\w+\s*=/, // const variable =
        /^let\s+\w+\s*=/, // let variable =
        /^var\s+\w+\s*=/, // var variable =
        /new A\(\{/, // new A({
        /console\.log/, // console.log
        /\.addEventListener/, // addEventListener
        /function\s*\(/, // function(
        /=>\s*\{/, // arrow functions
        /puts\s*\(/, // puts with parentheses (JS style)
        /^\s*\/\//, // JS comments
        /;\s*$/, // ends with semicolon
    ];

    // Ruby patterns
    const rubyPatterns = [
        /=\s*A\.new\s*\(/, // = A.new(
        /\s+do\s*(\|.*\|)?\s*$/, // do blocks
        /^puts\s+[^(]/, // puts without parentheses
        /\.keyboard\s+do/, // event handlers with do
        /\.onclick\s+do/, // event handlers with do
        /\.on\w+\s+do/, // any event with do
        /^wait\s+\d+\s+do/, // wait blocks
        /^grab\(/, // grab calls
        /^if\s+.*\s*$/, // if statements without parentheses
        /^end\s*$/, // end keyword
        /^require\s+/, // require statements
        /#\{.*\}/, // string interpolation
        /^\s*#[^#]/, // Ruby comments (single #)
    ];

    // Check JavaScript patterns first
    for (const pattern of jsPatterns) {
        if (pattern.test(trimmed)) {
            return 'javascript';
        }
    }

    // Check Ruby patterns
    for (const pattern of rubyPatterns) {
        if (pattern.test(trimmed)) {
            return 'ruby';
        }
    }

    // Default to Ruby for ambiguous cases
    return 'ruby';
}

/**
 * 🔍 VÉRIFICATION SI UNE LIGNE EST JAVASCRIPT
 */
function isJavaScriptLine(line) {
    const trimmed = line.trim();
    
    // Explicit JavaScript markers
    if (trimmed.startsWith('//') && !trimmed.startsWith('// //')) {
        return true;
    }
    
    // JavaScript syntax patterns
    const explicitJsPatterns = [
        /^const\s+\w+\s*=\s*new A\(\{/, // const x = new A({
        /console\.log/, // console.log
        /\.addEventListener/, // addEventListener
        /\);?\s*$/, // ends with ); or )
        /=>\s*\{/, // arrow functions
        /function\s*\(/, // function declarations
    ];

    return explicitJsPatterns.some(pattern => pattern.test(trimmed));
}

/**
 * 📊 ANALYSE DÉTAILLÉE DU CODE HYBRIDE
 */
function analyzeHybridCode(code) {
    const parsed = squirrel_parser(code);
    
    return {
        ...parsed,
        analysis: {
            hasRuby: parsed.ruby.length > 0,
            hasJavaScript: parsed.javascript.length > 0,
            mixedLanguage: parsed.ruby.length > 0 && parsed.javascript.length > 0,
            rubyFeatures: detectRubyFeatures(parsed.ruby),
            jsFeatures: detectJavaScriptFeatures(parsed.javascript)
        }
    };
}

/**
 * 🔍 DÉTECTION DES FONCTIONNALITÉS RUBY
 */
function detectRubyFeatures(rubyCode) {
    const features = [];
    
    if (rubyCode.includes('A.new')) features.push('A.new syntax');
    if (rubyCode.includes(' do')) features.push('do...end blocks');
    if (/puts\s+[^(]/.test(rubyCode)) features.push('puts statements');
    if (rubyCode.includes('grab(')) features.push('grab calls');
    if (rubyCode.includes('wait ')) features.push('wait blocks');
    if (rubyCode.includes('#{')) features.push('string interpolation');
    if (rubyCode.includes('require ')) features.push('require statements');
    
    return features;
}

/**
 * 🔍 DÉTECTION DES FONCTIONNALITÉS JAVASCRIPT
 */
function detectJavaScriptFeatures(jsCode) {
    const features = [];
    
    if (jsCode.includes('const ')) features.push('const declarations');
    if (jsCode.includes('new A(')) features.push('new A() syntax');
    if (jsCode.includes('console.log')) features.push('console.log');
    if (jsCode.includes('.addEventListener')) features.push('event listeners');
    if (jsCode.includes('=>')) features.push('arrow functions');
    if (jsCode.includes('puts(')) features.push('puts() calls');
    
    return features;
}

/**
 * 🧪 FONCTION DE TEST
 */
function testSquirrelParser() {
    const testCode = `
// JavaScript section
const test = new A({width: 100});
console.log("Hello JS");

#### Ruby section
container = A.new({
    width: 200,
    height: 100
})

container.onclick do
    puts "Clicked!"
end
    `;
    
    console.group('🧪 Squirrel Parser Test');
    const result = analyzeHybridCode(testCode);
    console.log('Test result:', result);
    console.groupEnd();
    
    return result;
}

// 🌍 EXPORTS GLOBAUX
window.squirrel_parser = squirrel_parser;
window.analyzeHybridCode = analyzeHybridCode;
window.testSquirrelParser = testSquirrelParser;

// 🧪 AUTO-TEST en mode debug
if (window.location.search.includes('debug=parser')) {
    testSquirrelParser();
}

console.log('🔍 Squirrel Parser loaded - Ready to separate Ruby/JS!');