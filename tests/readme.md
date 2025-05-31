# 🧪 Système de Tests DSL Ruby/JS Hybride

Un système complet de tests automatiques pour votre DSL Ruby/JavaScript hybride, avec détection d'erreurs de parsing, analyse de performance et rapports détaillés.

## 🚀 Vue d'ensemble

Ce système teste automatiquement :
- ✅ **Transpilation Ruby → JavaScript** (A.new, blocs do...end, etc.)
- ✅ **APIs du Framework A** (méthodes, événements, chaînage)
- ✅ **Syntaxe mixte Ruby/JS** (interpolation, conditionals)
- ✅ **Détection d'erreurs** avec suggestions d'amélioration
- ✅ **Tests de performance** et métriques
- ✅ **Rapports HTML/JSON** interactifs

## 📁 Structure des fichiers

```
my_solution/
├── tests/                          # Système de tests SQH existant
├── dsl-tests/                      # Nouveau système de tests DSL
│   ├── dsl-test-suite.js          # Moteur de tests principal
│   ├── dsl-test-config.js         # Configuration avancée
│   ├── dsl-test-runner.sh         # Script d'exécution
│   ├── hyper_squirrel.js          # Votre parser principal
│   ├── transpiller.js             # Parser de secours
│   ├── prism-parser.js            # Parser WASM (optionnel)
│   └── test-reports/              # Rapports générés
└── README.md                      # Ce fichier
```

## 🛠️ Installation et Setup

### 1. Prérequis

```bash
# Node.js 16+ requis
node --version  # v16.0.0+

# Outils optionnels pour rapports avancés
sudo apt install jq bc  # Ubuntu/Debian
brew install jq bc      # macOS
```

### 2. Setup initial

```bash
# Créer le répertoire de tests DSL
mkdir -p my_solution/dsl-tests
cd my_solution/dsl-tests

# Copier vos parsers existants
cp ../hyper_squirrel.js .
cp ../transpiller.js .
cp ../prism-parser.js .  # si disponible

# Créer les fichiers de test (voir artifacts ci-dessus)
# Ou télécharger depuis votre source
```

### 3. Permissions

```bash
chmod +x dsl-test-runner.sh
```

## 🎯 Utilisation

### Tests basiques

```bash
# Tests standard avec tous les parsers
./dsl-test-runner.sh

# Tests avec parser spécifique
./dsl-test-runner.sh --parser transpiller

# Tests rapides seulement
./dsl-test-runner.sh --quick
```

### Tests avancés

```bash
# Tests détaillés avec rapport HTML
./dsl-test-runner.sh --verbose --html

# Tests de performance inclus
./dsl-test-runner.sh --performance

# Tests avec arrêt sur première erreur
./dsl-test-runner.sh --stop-on-error
```

### Tests par catégorie

```bash
# Tests d'événements seulement
./dsl-test-runner.sh --categories events

# Tests de base + syntaxe mixte
./dsl-test-runner.sh --categories basic,mixed_syntax

# Tests de non-régression
./dsl-test-runner.sh --regression
```

## 📊 Types de tests

### 1. Tests de base (`basic`)
- Création d'objets A.new
- Propriétés et méthodes
- Chaînage de méthodes

```ruby
# Test automatique
container = A.new({
    id: 'test',
    width: 100,
    height: 100
})
```

### 2. Tests d'événements (`events`)
- Gestionnaires onclick, onmouseover
- Événements clavier avec paramètres
- Blocs do...end

```ruby
# Test automatique
container.keyboard do |key|
    if key.ctrl && key.key == "s"
        puts "Ctrl+S détecté!"
        key.preventDefault
    end
end
```

### 3. Tests de temporisation (`timing`)
- Blocs wait...do
- setTimeout transpilé

```ruby
# Test automatique
wait 3000 do
    puts "hello"
    grab('test').color("blue")
end
```

### 4. Tests d'interpolation (`string_interpolation`)
- Interpolation Ruby #{}
- Conversion vers template strings

```ruby
# Test automatique
puts "Valeur: #{variable}"
# Devient: puts(`Valeur: ${variable}`)
```

### 5. Tests de performance (`performance`)
- Vitesse de transpilation
- Utilisation mémoire
- Gros fichiers DSL

### 6. Cas limites (`edge_cases`)
- Syntaxe incomplète
- Blocs imbriqués profonds
- Caractères spéciaux

## 📈 Rapports et analyse

### Format JSON (défaut)
```json
{
  "total": 45,
  "passed": 42,
  "failed": 3,
  "categories": {
    "basic_object_creation": { "passed": 8, "total": 8 },
    "event_handlers": { "passed": 12, "total": 14 }
  },
  "errors": [
    {
      "name": "keyboard avec paramètre",
      "category": "event_handlers", 
      "dsl": "container.keyboard do |key|...",
      "transpiled": "container.addEventListener...",
      "executionError": "Syntax error...",
      "analysis": {
        "errorType": "Missing end keyword",
        "suggestions": ["Ajoutez le mot-clé 'end'"]
      }
    }
  ]
}
```

### Rapport HTML interactif
- 📊 Graphiques de réussite
- 🔍 Détail des erreurs
- 💡 Suggestions d'amélioration
- 📁 Navigation par catégorie

## ⚙️ Configuration avancée

### Fichier de config personnalisé

```javascript
// custom-config.js
module.exports = {
    general: {
        verbose: true,
        stopOnFirstError: false,
        timeout: 10000
    },
    parsers: {
        primary: 'hyper_squirrel',
        fallback: 'transpiller',
        loadFromFiles: true
    },
    testCategories: {
        basic_object_creation: true,
        event_handlers: true,
        performance: false,  // Désactiver tests lourds
        custom_api_tests: true
    },
    validation: {
        syntaxChecking: true,
        executionTesting: true,
        performanceChecking: false
    }
};
```

### Utilisation de la config

```bash
# Avec configuration personnalisée
./dsl-test-runner.sh --config custom-config.js
```

## 🐛 Debugging et dépannage

### 1. Erreurs communes

#### Parser non trouvé
```bash
❌ Parser hyper_squirrel non trouvé
```
**Solution :** Vérifiez que le fichier existe et est accessible
```bash
ls -la *.js  # Vérifier les parsers disponibles
./dsl-test-runner.sh --parser transpiller  # Utiliser un autre parser
```

#### Erreurs de transpilation
```bash
❌ Pattern manqué: /container\.onclick\(\(\) => \{/
```
**Solution :** Le parser ne génère pas le JS attendu
- Vérifiez la syntaxe DSL
- Testez avec un parser différent
- Consultez le code transpilé dans le rapport

#### Erreurs d'exécution
```bash
❌ Erreur d'exécution: ReferenceError: A is not defined
```
**Solution :** Framework A non initialisé
- Vérifiez que le mock A est chargé
- Mode verbose pour plus de détails

### 2. Mode debug

```bash
# Debug complet
./dsl-test-runner.sh --verbose --stop-on-error

# Test unique catégorie
./dsl-test-runner.sh --categories basic --verbose

# Logs détaillés du parser
DEBUG=1 ./dsl-test-runner.sh
```

### 3. Validation manuelle

```bash
# Test rapide d'un parser
node -e "
const parser = require('./hyper_squirrel.js');
const result = parser.processHybridFile('container = A.new({id: \"test\"})');
console.log(result);
"
```

## 🔧 Personnalisation

### Ajouter des tests personnalisés

```javascript
// Dans dsl-test-suite.js
const CUSTOM_TESTS = {
    my_api_tests: [
        {
            name: "API personnalisée",
            dsl: `container.myCustomMethod(params)`,
            expected_js_patterns: [
                /container\.myCustomMethod\(params\)/
            ]
        }
    ]
};

// Fusionner avec DSL_TEST_CASES
Object.assign(DSL_TEST_CASES, CUSTOM_TESTS);
```

### Créer un nouveau parser de test

```javascript
// custom-parser.js
class MyCustomParser {
    processHybridFile(code) {
        // Votre logique de transpilation
        return code.replace(/A\.new/g, 'new A');
    }
}

module.exports = MyCustomParser;
```

### Métriques personnalisées

```javascript
// Dans dsl-test-config.js
class CustomMetrics {
    measureComplexity(code) {
        const lines = code.split('\n').length;
        const blocks = (code.match(/do\b/g) || []).length;
        return { lines, blocks, complexity: blocks / lines };
    }
}
```

## 📊 Métriques et KPIs

### Métriques automatiques

| Métrique | Description | Seuil |
|----------|-------------|-------|
| Taux de réussite | % tests passés | > 85% |
| Temps transpilation | ms par test | < 100ms |
| Couverture API | % APIs testées | > 90% |
| Détection erreurs | % erreurs trouvées | > 95% |

### Analyse de tendances

```bash
# Comparer les rapports dans le temps
ls test-reports/dsl-*.json | tail -5  # 5 derniers rapports

# Extraire métriques clés
jq '.passed, .total, (.passed/.total*100)' test-reports/dsl-*.json
```

## 🚀 Intégration CI/CD

### GitHub Actions

```yaml
# .github/workflows/dsl-tests.yml
name: Tests DSL
on: [push, pull_request]

jobs:
  test-dsl:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          sudo apt-get install -y jq bc
          
      - name: Run DSL tests
        run: |
          cd dsl-tests
          ./dsl-test-runner.sh --html --stop-on-error
          
      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: dsl-test-reports
          path: dsl-tests/test-reports/
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any
    stages {
        stage('DSL Tests') {
            steps {
                sh '''
                    cd dsl-tests
                    ./dsl-test-runner.sh --performance --html
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'dsl-tests/test-reports/*'
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'dsl-tests/test-reports',
                        reportFiles: '*.html',
                        reportName: 'DSL Test Report'
                    ])
                }
            }
        }
    }
}
```

## 📚 Référence API

### DSLTestEngine

```javascript
const engine = new DSLTestEngine({
    verbose: true,
    parser: 'hyper_squirrel'
});

await engine.init();
const results = await engine.runAllTests();
```

### AdvancedDSLTestEngine

```javascript
const engine = new AdvancedDSLTestEngine({
    general: { verbose: true },
    parsers: { primary: 'transpiller' },
    validation: { performanceChecking: true }
});

const results = await engine.runAdvancedTest(testCase, category);
```

### Configuration complète

```javascript
{
    general: {
        verbose: boolean,
        stopOnFirstError: boolean,
        generateReport: boolean,
        timeout: number,
        outputDir: string
    },
    parsers: {
        primary: string,
        fallback: string,
        loadFromFiles: boolean,
        parserPaths: object
    },
    testCategories: {
        [category]: boolean
    },
    validation: {
        syntaxChecking: boolean,
        patternMatching: boolean,
        executionTesting: boolean,
        performanceChecking: boolean
    },
    reporting: {
        format: 'json' | 'html' | 'markdown',
        includeCode: boolean,
        includeSuggestions: boolean
    }
}
```

## 🎯 Exemples d'utilisation

### Test d'un nouveau parser

```bash
# 1. Ajouter le parser
cp mon-nouveau-parser.js dsl-tests/

# 2. Tester rapidement
./dsl-test-runner.sh --parser mon-nouveau-parser --quick --verbose

# 3. Test complet si OK
./dsl-test-runner.sh --parser mon-nouveau-parser --html
```

### Debugging d'une feature

```bash
# 1. Test spécifique à la feature
./dsl-test-runner.sh --categories events --verbose --stop-on-error

# 2. Analyser le rapport
jq '.errors[] | select(.category=="event_handlers")' test-reports/latest.json

# 3. Test unitaire
node -e "
const parser = require('./hyper_squirrel.js');
console.log(parser.processHybridFile('container.onclick do\nputs \"test\"\nend'));
"
```

### Benchmark de performance

```bash
# 1. Tests de performance complets
./dsl-test-runner.sh --performance --verbose

# 2. Comparer parsers
for parser in hyper_squirrel transpiller; do
    echo "=== $parser ==="
    ./dsl-test-runner.sh --parser $parser --performance --quick
done

# 3. Analyser métriques
jq '.performance' test-reports/dsl-*.json
```

## 🛡️ Sécurité et bonnes pratiques

### Validation des entrées

```javascript
// Toujours valider le code DSL avant transpilation
function validateDSLCode(code) {
    if (!code || typeof code !== 'string') {
        throw new Error('Code DSL invalide');
    }
    
    // Vérifier les patterns dangereux
    const dangerousPatterns = [
        /eval\(/,
        /Function\(/,
        /require\(['"]\./  // Require relatif
    ];
    
    for (const pattern of dangerousPatterns) {
        if (pattern.test(code)) {
            throw new Error('Code DSL potentiellement dangereux');
        }
    }
}
```

### Sandbox d'exécution

```javascript
// Exécuter en mode sandbox
function executeInSandbox(jsCode) {
    const vm = require('vm');
    const sandbox = {
        A: MockFrameworkA,
        puts: console.log,
        grab: mockGrab,
        setTimeout: setTimeout
    };
    
    try {
        vm.runInNewContext(jsCode, sandbox, { timeout: 1000 });
    } catch (error) {
        console.error('Erreur sandbox:', error.message);
    }
}
```

## 🔄 Maintenance et mises à jour

### Tests de régression

```bash
# Avant une mise à jour majeure
./dsl-test-runner.sh --regression > regression-baseline.txt

# Après la mise à jour
./dsl-test-runner.sh --regression > regression-current.txt

# Comparer
diff regression-baseline.txt regression-current.txt
```

### Ajout de nouveaux tests

```javascript
// 1. Identifier le pattern problématique
const newTest = {
    name: "Nouveau pattern problématique",
    dsl: `nouveau_code_dsl_qui_plante`,
    expected_js_patterns: [/pattern_attendu/],
    bug_id: "BUG-XXX"
};

// 2. L'ajouter aux tests de régression
REGRESSION_TESTS.known_fixes.push(newTest);

// 3. Vérifier qu'il échoue avant le fix
// 4. Fixer le parser
// 5. Vérifier qu'il passe après le fix
```

### Nettoyage des rapports

```bash
# Script de nettoyage automatique
#!/bin/bash
# clean-old-reports.sh

REPORTS_DIR="./test-reports"
DAYS_TO_KEEP=30

find "$REPORTS_DIR" -type f -name "*.json" -mtime +$DAYS_TO_KEEP -delete
find "$REPORTS_DIR" -type f -name "*.html" -mtime +$DAYS_TO_KEEP -delete

echo "Rapports de plus de $DAYS_TO_KEEP jours supprimés"
```

## 📞 Support et contribution

### Signaler un bug

1. Exécuter avec `--verbose --stop-on-error`
2. Inclure le code DSL problématique
3. Joindre le rapport JSON
4. Spécifier le parser utilisé

### Contribuer

1. Fork du projet
2. Ajouter des tests pour votre feature
3. S'assurer que tous les tests passent
4. Proposer une PR avec description détaillée

### Ressources

- 📖 [Documentation du Framework A](lien-vers-doc)
- 🐛 [Issues GitHub](lien-vers-issues)  
- 💬 [Discussions](lien-vers-discussions)
- 📊 [Métriques live](lien-vers-dashboard)

---

## 🎉 Conclusion

Ce système de tests vous permet de :

✅ **Détecter automatiquement** les problèmes de transpilation  
✅ **Valider toutes les APIs** de votre framework  
✅ **Analyser les performances** et optimiser  
✅ **Générer des rapports** pour le suivi  
✅ **Intégrer en CI/CD** pour la qualité continue  

**Commencez maintenant :**

```bash
chmod +x dsl-test-runner.sh
./dsl-test-runner.sh --quick --html
```

Votre DSL Ruby/JS sera plus robuste et fiable ! 🚀