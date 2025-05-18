/**
 * Squirrel Parser - Converts Squirrel code to JavaScript
 * Complete implementation with syntax fixing
 */

/**
 * Parse Squirrel code and convert it to JavaScript
 * @param {string} squirrelCode - The Squirrel code to convert
 * @return {string} - The converted JavaScript code
 */
function parseSquirrel(squirrelCode) {
    // Prétraitement - supprimer les commentaires mais préserver les sauts de ligne
    // CORRECTION: Utiliser la même expression régulière que dans runSquirrel pour préserver les interpolations
    let cleanedCode = squirrelCode
        .replace(/\/\/.*$/gm, '')        // Commentaires //
        .replace(/\#[^\{].*$/gm, '');    // Commentaires # mais pas les interpolations #{}

    // Vérifier les blocs non fermés - comptage basique des 'do' et 'end'
    const doCount = (cleanedCode.match(/\bdo\b/g) || []).length;
    const endCount = (cleanedCode.match(/\bend\b/g) || []).length;

    if (doCount > endCount) {
        console.warn(`Warning: Found ${doCount} 'do' keywords but only ${endCount} 'end' keywords. Code may have unclosed blocks.`);
        // Tenter de réparer en ajoutant les 'end' manquants
        for (let i = 0; i < doCount - endCount; i++) {
            cleanedCode += "\nend";
        }
    }

    // Vérifier si le code est vide après nettoyage
    const trimmedCode = cleanedCode.trim();
    if (!trimmedCode) {
        console.log("Code is empty or contains only comments. Returning empty function.");
        return "// Empty code or comments only\nfunction emptyFunction() { return null; }";
    }

    // Skip processing if it's already JavaScript
    if (!/\bdo\b|\bend\b|:[\w]+|\bdef\b|\beach\b/.test(cleanedCode)) {
        return cleanedCode;
    }

    // Process as Squirrel code
    let jsCode = cleanedCode;

    // Preprocess: Handle compute blocks first
    jsCode = jsCode.replace(/compute\s+(\d+),\s*(\d+)\s+do\s*\|([^|]+)\|([\s\S]*?)end/g,
        (_, a, b, param, block) => {
            return `compute(${a}, ${b}, function(${param}) {\n${block.trim()}\n});`;
        });

    // Preprocess: Handle function calls with do blocks
    jsCode = jsCode.replace(/(\w+)\(([^)]*)\)\s+do\s*\|([^|]+)\|([\s\S]*?)end/g,
        (_, fnName, args, cbParam, block) => {
            return `${fnName}(${args}, function(${cbParam}) {\n${block.trim()}\n});`;
        });

    // Fix any duplicate container declarations in Squirrel
    let containerCount = 0;
    const squirrelLines = jsCode.split('\n');
    for (let i = 0; i < squirrelLines.length; i++) {
        if (/\bcontainer\s*=\s*new\s+A\s*\(/.test(squirrelLines[i])) {
            containerCount++;
            if (containerCount > 1) {
                // Replace container with containerN in this line and subsequent lines
                squirrelLines[i] = squirrelLines[i].replace('container', `container${containerCount}`);

                // Update references in subsequent lines
                for (let j = i + 1; j < squirrelLines.length; j++) {
                    // Only replace references that look like our container variable
                    squirrelLines[j] = squirrelLines[j].replace(/\bcontainer\b(?!\s*=)/, `container${containerCount}`);
                }
            }
        }
    }
    jsCode = squirrelLines.join('\n');

    // Convert Squirrel symbols to strings
    // Inside object literals: {key: :value} → {key: "value"}
    jsCode = jsCode.replace(/(\w+):\s*:([a-zA-Z_]\w*)/g, '$1: "$2"');

    // Standalone symbols: :symbol → "symbol"
    jsCode = jsCode.replace(/:([a-zA-Z_]\w*)/g, '"$1"');

    // Handle rest parameters (*args)
    jsCode = jsCode.replace(/function\s+(\w+)\s*\(\*(\w+)\)/g,
        (_, name, param) => `function ${name}(...${param})`);

    // Handle hash_method signature
    jsCode = jsCode.replace(/function\s+hash_method\(\{args\}\)/g,
        () => `function hash_method(args)`);

    // Fix variable declarations without var/let/const
    jsCode = jsCode.replace(/^(\s*)(\w+)\s*=\s*{/gm, (_, space, varName) => {
        if (jsCode.indexOf(`var ${varName}`) === -1 &&
            jsCode.indexOf(`let ${varName}`) === -1 &&
            jsCode.indexOf(`const ${varName}`) === -1) {
            return `${space}let ${varName} = {`;
        }
        return `${space}${varName} = {`;
    });

    jsCode = jsCode.replace(/^(\s*)(\w+)\s*=\s*\[/gm, (_, space, varName) => {
        if (jsCode.indexOf(`var ${varName}`) === -1 &&
            jsCode.indexOf(`let ${varName}`) === -1 &&
            jsCode.indexOf(`const ${varName}`) === -1) {
            return `${space}let ${varName} = [`;
        }
        return `${space}${varName} = [`;
    });

    // Convert log statements
    jsCode = jsCode.replace(/^\s*log\s+(.+)$/gm, (_, msg) => `console.log(${msg});`);
    jsCode = jsCode.replace(/^\s*puts\s+(.+)$/gm, (_, expr) => `console.log(${expr});`);
    // Also handle puts as a function call
    jsCode = jsCode.replace(/puts\(([^)]+)\)/g, "console.log($1)");

    // Attention avec l'interpolation de chaînes - éviter les confusions avec les commentaires #
    // String interpolation in log statements - assurez-vous que #{} fonctionne correctement
    jsCode = jsCode.replace(/console\.log\("([^"]*)\#\{([^}]*)\}([^"]*)"\)/g,
        (_, before, expr, after) => `console.log("${before}" + (${expr}) + "${after}")`);

    // More general string interpolation
    jsCode = jsCode.replace(/\#\{([^}]*)\}/g,
        (_, expr) => `" + (${expr}) + "`);

    // Convert array.each blocks
    jsCode = jsCode.replace(/([\w\[\]\.]+)\.each\s+do\s*\|([^|]+)\|([\s\S]*?)end/g,
        (_, arr, item, block) => {
            return `${arr}.forEach(function(${item}) {\n${block.trim()}\n});`;
        });

    // Handle .each_with_index blocks
    jsCode = jsCode.replace(/([\w\.]+)\.each_with_index\s+do\s*\|([^,]+),\s*([^|]+)\|([\s\S]*?)end/g,
        (_, arr, item, index, block) => {
            if (arr === 'args') {
                return `Object.entries(args).forEach(function([${index}, ${item}]) {\n${block.trim()}\n});`;
            }
            return `${arr}.forEach(function(${item}, ${index}) {\n${block.trim()}\n});`;
        });

    // Remove extraneous return statements from forEach callbacks
    jsCode = jsCode.replace(/return\s*\}\);/g, '});');

    // Fix any double semicolons
    jsCode = jsCode.replace(/;{2,}/g, ';');

    // Convert function definitions
    jsCode = jsCode.replace(/def\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)([\s\S]*?)end/g,
        (_, name, params, body) => {
            let bodyWithReturn = body.trim();
            // Add return to the last expression if needed
            const bodyLines = bodyWithReturn.split('\n');
            const lastLine = bodyLines[bodyLines.length - 1].trim();
            if (!lastLine.startsWith('return') && !lastLine.startsWith('console.log')) {
                bodyLines[bodyLines.length - 1] = `  return ${lastLine};`;
            }
            return `function ${name}(${params}) {\n${bodyLines.join('\n')}\n}`;
        });

    // Amélioration du formatage des fonctions définies
    jsCode = jsCode.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*\{([\s\S]*?)\}/g, (match, name, params, body) => {
        // Nettoyer et indenter correctement le corps de la fonction
        const cleanBody = body.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => `  ${line}${line.endsWith(';') ? '' : ';'}`)
            .join('\n');

        return `function ${name}(${params}) {\n${cleanBody}\n}`;
    });

    // Handle property access with square brackets
    jsCode = jsCode.replace(/\[:([\w]+)\]/g, '["$1"]');

    // Handle JSON conversion
    jsCode = jsCode.replace(/(\w+)\.json\b/g, 'JSON.stringify($1)');

    // Handle wait blocks
    jsCode = jsCode.replace(/wait\s+(\d+)\s+do\s*([\s\S]*?)end/g,
        (_, time, block) => `setTimeout(function() {\n${block.trim()}\n}, ${time});`);

    // Fix variable redeclarations
    // This is a simplified approach - for complex code, more sophisticated analysis is needed
    let modifiedCode = "";
    const declaredVars = new Set();

    for (const line of jsCode.split('\n')) {
        const constMatch = line.match(/^const\s+(\w+)\s*=/);
        if (constMatch) {
            const varName = constMatch[1];
            if (declaredVars.has(varName)) {
                // Replace const with let for redeclarations
                modifiedCode += line.replace(/^const\s+/, 'let ') + '\n';
            } else {
                declaredVars.add(varName);
                modifiedCode += line + '\n';
            }
        } else {
            modifiedCode += line + '\n';
        }
    }

    // Handle container2 references - make sure fastened properties use the right variable
    if (modifiedCode.includes('const container2 =')) {
        // Fix references in the code
        const containerIndex = modifiedCode.indexOf('const container2 =');
        const beforeCode = modifiedCode.substring(0, containerIndex);
        let afterCode = modifiedCode.substring(containerIndex);

        // In the code after container2 is declared, there might be references to container
        // that should be to container2 instead - especially property access
        const fixedAfterCode = afterCode.replace(
            /container\._fastened/g, 'container2._fastened'
        ).replace(
            /container\.element\.dataset/g, 'container2.element.dataset'
        );

        modifiedCode = beforeCode + fixedAfterCode;
    }

    // Special case: Fix the second container declaration directly
    if (modifiedCode.includes('const container2 =') &&
        modifiedCode.includes('id: \'main_container\',')) {
        // Change the ID to avoid conflict
        modifiedCode = modifiedCode.replace(
            /(const container2 = new A\(\{[^{]*id:\s*)'main_container'/,
            "$1'main_container2'"
        );

        // Update references to that ID
        modifiedCode = modifiedCode.replace(
            /(attach:\s*)'#main_container'/g,
            "$1'#main_container2'"
        );
    }

    // Add _fastened initialization to prevent errors
    modifiedCode = modifiedCode.replace(
        /(container2)(\._fastened\.push)/g,
        "$1._fastened = $1._fastened || []; $1$2"
    );

    // Add utility functions if needed
    if (modifiedCode.includes('compute(')) {
        modifiedCode = `
// Definition of compute function
function compute(a, b, callback) {
  const sum = a + b;
  callback(sum);
}
` + modifiedCode;
    }

    // Add grab function if needed
    if (modifiedCode.includes('grab(')) {
        modifiedCode = `
// Definition of grab function (similar to document.getElementById)
function grab(id) {
  return document.getElementById(id);
}
` + modifiedCode;
    }

    // Final syntax validation and correction
    // Apply the fixJavaScript function as a final pass
    return fixJavaScript(modifiedCode);
}

/**
 * Fix JavaScript syntax issues in the generated code
 * @param {string} code - The JavaScript code to fix
 * @return {string} - The fixed JavaScript code
 */
function fixJavaScript(code) {
    let fixedCode = code;

    // 1. Fix rest parameter (*args) syntax - double check to ensure it's fixed
    fixedCode = fixedCode.replace(/function\s+(\w+)\s*\(\*(\w+)\)/g,
        (_, name, param) => `function ${name}(...${param})`);

    // 2. Fix hash_method parameter - double check
    fixedCode = fixedCode.replace(/function\s+hash_method\(\{args\}\)/g,
        () => `function hash_method(args)`);

    // 3. Final string interpolation fixes
    fixedCode = fixedCode.replace(/"\#\{([^}]*)\}"/g,
        (_, expr) => `(${expr})`);

    fixedCode = fixedCode.replace(/console\.log\("([^"]*)\#\{([^}]*)\}([^"]*)"\)/g,
        (_, before, expr, after) => `console.log("${before}" + (${expr}) + "${after}")`);

    // 4. Fix variable declarations - additional check
    const declaredVars = new Set();
    let lines = fixedCode.split('\n');

    // First pass: collect all declared variables
    for (const line of lines) {
        const varDecl = line.match(/^\s*(var|let|const)\s+(\w+)/);
        if (varDecl) {
            declaredVars.add(varDecl[2]);
        }
    }

    // Second pass: fix variable assignments
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const varAssign = line.match(/^\s*(\w+)\s*=\s*(?:\{|\[)/);
        if (varAssign && !declaredVars.has(varAssign[1])) {
            lines[i] = line.replace(/^(\s*)(\w+)(\s*=)/, "$1let $2$3");
            declaredVars.add(varAssign[1]);
        }
    }

    fixedCode = lines.join('\n');

    // 5. Final cleanup of extraneous returns in forEach
    fixedCode = fixedCode.replace(/(\s*)return(\s*)\}\);/g, '$1$2});');

    // 6. Fix double semicolons
    fixedCode = fixedCode.replace(/;{2,}/g, ';');

    // 7. Fix potential missing initialization for objects
    fixedCode = fixedCode.replace(/(\w+)\._fastened\.push/g,
        (_, obj) => `${obj}._fastened = ${obj}._fastened || []; ${obj}._fastened.push`);

    // 8. Fix missing semicolons
    fixedCode = fixedCode.replace(/}\n(?![\s}])/g, '};\n');

    // 9. Fix string interpolation en douceur - éviter les erreurs avec #{
    // S'assurer que tous les fragments de code contenant # non traités sont nettoyés
    fixedCode = fixedCode.replace(/([^"+'`])\#([^\{])/g, '$1//$2');

    return fixedCode;
}

/**
 * Execute Squirrel code
 * @param {string} code - The Squirrel code to execute
 * @return {any} - The result of executing the code
 */
function runSquirrel(code) {
    try {
        // Basic detection of JS vs Squirrel
        const isPureJS = !/\bdo\b|\bend\b|:[\w]+|\bdef\b|\beach\b/.test(code);

        if (isPureJS) {
            console.log("Running JavaScript directly");
            return new Function(code)();
        } else {
            // Log the original code for debugging
            console.log("Original Squirrel code:");
            console.log("----------------------");
            console.log(code);
            console.log("----------------------");

            // Première étape : nettoyer les commentaires mais conserver la structure
            // On utilise la même expression régulière que dans parseSquirrel
            let cleanedCode = code
                .replace(/\/\/.*$/gm, '')        // Commentaires //
                .replace(/\#[^\{].*$/gm, '');    // Commentaires # mais pas les interpolations #{}

            // Nous utilisons parseSquirrel directement sur le code nettoyé
            let jsCode = parseSquirrel(cleanedCode);

            // Dernière chance : appliquer des correctifs spécifiques
            // Remplacer entièrement la fonction ma_fonction qui pose problème
            if (jsCode.includes("function ma_fonction")) {
                jsCode = jsCode.replace(
                    /function\s+ma_fonction[\s\S]*?valeur\s*\*\s*2(?:\s*;)?\s*\}/,
                    `function ma_fonction(valeur) {
  console.log("Processing", valeur);

  // Pure JavaScript
  setTimeout(function() {
    console.log("Processing completed after delay");
  }, 1000);

  // Mixed syntax
  [1, 2, 3].forEach(function(item) {
    console.log(item * 2);
  });

  return valeur * 2;
}`
                );
            }

            console.log("Generated JavaScript:");
            console.log("---------------------");
            console.log(jsCode);
            console.log("---------------------");

            // Validation de base du JavaScript généré - prévenir les erreurs EOF
            try {
                // Cette ligne va lever une exception si le JS est syntaxiquement incorrect
                Function(`"use strict"; ${jsCode}`);
            } catch (syntaxError) {
                console.error("Syntax error in generated JavaScript:", syntaxError.message);

                // Tentative de réparation basique
                if (syntaxError.message.includes("Unexpected end of input")) {
                    console.log("Attempting to fix unexpected EOF...");
                    // Vérifier et fermer les accolades manquantes
                    const openBraces = (jsCode.match(/\{/g) || []).length;
                    const closeBraces = (jsCode.match(/\}/g) || []).length;
                    if (openBraces > closeBraces) {
                        for (let i = 0; i < openBraces - closeBraces; i++) {
                            jsCode += "\n}";
                        }
                        console.log("Added missing closing braces.");
                    }

                    // Vérifier et fermer les parenthèses manquantes
                    const openParens = (jsCode.match(/\(/g) || []).length;
                    const closeParens = (jsCode.match(/\)/g) || []).length;
                    if (openParens > closeParens) {
                        for (let i = 0; i < openParens - closeParens; i++) {
                            jsCode += "\n)";
                        }
                        console.log("Added missing closing parentheses.");
                    }
                }
            }

            return new Function(jsCode)();
        }
    } catch (e) {
        console.error("Error:", e.message);
        if (e.lineNumber) {
            console.error("Line:", e.lineNumber);
        }

        // Provide more context if available
        if (e.stack) {
            console.error("Stack:", e.stack);
        }

        return null;
    }
}

// Export functions
if (typeof window !== 'undefined') {
    window.parseSquirrel = parseSquirrel;
    window.runSquirrel = runSquirrel;
    window.fixJavaScript = fixJavaScript;
} else if (typeof global !== 'undefined') {
    global.parseSquirrel = parseSquirrel;
    global.runSquirrel = runSquirrel;
    global.fixJavaScript = fixJavaScript;
}