# 🧪 Guide d'utilisation du système de tests SQH

## 📋 Vue d'ensemble

Le système de tests SQH (Squirrel Hybrid) est une solution complète et automatisée pour tester votre framework A et le format hybride .sqh. Il offre :

- ✅ Tests unitaires, d'intégration, de performance et de stress
- 📊 Rapports détaillés avec métriques et tendances
- 🔄 Intégration CI/CD avec monitoring en temps réel
- 🌐 Tests cross-browser automatisés
- 📈 Analyse de couverture de code
- 🚨 Système d'alertes pour les régressions

## 🚀 Démarrage rapide

### Installation et configuration

```bash
# Cloner et installer les dépendances
npm install

# Configuration des navigateurs pour tests cross-browser
npx playwright install

# Démarrer le serveur de test
npm run serve:test &

# Lancer tous les tests
npm run test

# Ou utiliser le lanceur spécialisé
npm run test:sqh
```

### Utilisation dans le navigateur

```html
<!DOCTYPE html>
<html>
<head>
    <title>Tests SQH</title>
    <script src="tests/sqh-test-framework.js"></script>
</head>
<body>
    <script>
        // Démarrage automatique
        document.addEventListener('DOMContentLoaded', async () => {
            const launcher = new SQHTestLauncher();
            const results = await launcher.launch({ mode: 'all' });
            console.log('Tests terminés:', results.summary);
        });
    </script>
</body>
</html>
```

### API JavaScript

```javascript
// Démarrage rapide
const results = await SQHTestLauncher.quickTest('unit');

// Configuration personnalisée
const launcher = new SQHTestLauncher({
    runner: { timeout: 15000, parallel: false },
    performance: { thresholds: { instanceCreation: { opsPerSecond: 2000 } } }
});

const results = await launcher.launch({ mode: 'performance' });
```

## 🎯 Modes de test disponibles

### Tests unitaires
```bash
npm run test:unit
# ou
node tests/run-tests.js unit
```

**Couverture :**
- Création d'instances A
- Chaînage de méthodes
- Gestion des propriétés
- Particles et leur fonctionnement
- Utilitaires (grab, puts, etc.)

### Tests d'intégration
```bash
npm run test:integration
```

**Couverture :**
- Parsing Ruby vers JavaScript
- Transpilation de code hybride .sqh
- Gestion des événements
- Interaction DOM complète
- Communication entre composants

### Tests de performance
```bash
npm run test:performance
```

**Métriques mesurées :**
- Vitesse de création d'instances (ops/sec)
- Performance de transpilation (lignes/ms)
- Manipulation DOM (opérations/ms)
- Gestion d'événements (événements/ms)
- Usage mémoire et fuites potentielles

### Tests de stress
```bash
npm run test:stress
```

**Scénarios :**
- Création de milliers d'instances
- Traitement de fichiers .sqh volumineux
- Gestion d'événements en rafale
- Récupération après erreurs multiples
- Limites du système

### Tests de régression
```bash
npm run test:regression
```

**Validation :**
- Correctifs de bugs précédents
- Compatibilité avec versions antérieures
- Stabilité des APIs
- Performance maintenue

## 📊 Rapports et métriques

### Rapport HTML interactif

Le système génère automatiquement un rapport HTML complet :

```
tests/reports/sqh-test-report.html
```

**Contenu :**
- 📈 Graphiques de performance
- 📋 Résultats détaillés par suite
- 🎯 Couverture de code avec seuils
- 📊 Tendances historiques
- 🚨 Alertes et recommandations

### Rapports JSON pour l'automatisation

```javascript
// Lecture du rapport JSON
const report = await fetch('tests/reports/sqh-test-report.json');
const data = await report.json();

console.log('Taux de succès:', data.summary.successRate);
console.log('Performance:', data.performance.benchmarks);
console.log('Couverture:', data.coverage);
```

### Rapport JUnit pour CI/CD

```xml
<!-- tests/reports/junit.xml -->
<testsuite name="SQH Tests" tests="150" failures="2" time="45.67">
    <testcase name="should create A instance" classname="BasicTests" time="0.015"/>
    <!-- ... -->
</testsuite>
```

## 🔧 Configuration avancée

### Personnalisation des seuils

```javascript
// tests/custom-config.js
const customConfig = {
    ...SQHTestConfig,
    performance: {
        thresholds: {
            instanceCreation: { opsPerSecond: 1500 }, // Plus strict
            memoryUsage: { maxHeapSize: 80 * 1024 * 1024 } // 80MB max
        }
    },
    coverage: {
        threshold: {
            statements: 90, // 90% minimum
            branches: 85,
            functions: 90,
            lines: 90
        }
    }
};

const launcher = new SQHTestLauncher(customConfig);
```

### Ajout de tests personnalisés

```javascript
// tests/suites/custom/my-feature.test.js
describe('Ma fonctionnalité personnalisée', () => {
    beforeEach(() => {
        // Setup avant chaque test
    });
    
    it('devrait faire quelque chose de spécifique', () => {
        const code = `
            my_feature = A.new({special: true})
            my_feature.customMethod do
                puts "feature works"
            end
        `;
        
        expect(code).toTranspileTo('const my_feature = new A({special: true});');
    });
    
    it('devrait gérer les cas d\'erreur', () => {
        expect(() => {
            new A({ invalid: undefined.someMethod() });
        }).toThrow('Cannot read property');
    });
});
```

### Monitoring personnalisé

```javascript
// Démarrage du monitoring en temps réel
const monitor = new SQHRealTimeMonitor({
    interval: 2000, // 2 secondes
    alerts: {
        memoryThreshold: 150 * 1024 * 1024, // 150MB
        errorRate: 0.05 // 5%
    }
});

// Abonnement aux alertes
monitor.subscribe((event) => {
    if (event.type === 'alert') {
        console.warn('🚨 ALERTE:', event.data.message);
        // Envoyer notification Slack, email, etc.
    }
});

monitor.start();
```

## 🏗️ Intégration CI/CD

### GitHub Actions

```yaml
# .github/workflows/sqh-tests.yml
name: SQH Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16.x, 18.x, 20.x]
        browser: [chrome, firefox]

    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Install browsers
      run: npx playwright install
      
    - name: Run linting
      run: npm run lint
      
    - name: Run unit tests
      run: npm run test:unit
      
    - name: Run integration tests
      run: npm run test:integration
      
    - name: Run performance tests
      run: npm run test:performance
      
    - name: Run cross-browser tests
      run: npm run test:browser -- --browser=${{ matrix.browser }}
      
    - name: Generate coverage
      run: npm run coverage
      
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
        
    - name: Upload test results
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: test-results-${{ matrix.node-version }}-${{ matrix.browser }}
        path: |
          tests/reports/
          coverage/
          
    - name: Notify on failure
      if: failure()
      uses: 8398a7/action-slack@v3
      with:
        status: failure
        text: 'SQH Tests failed on ${{ matrix.node-version }} / ${{ matrix.browser }}'
      env:
        SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - validate
  - test
  - performance
  - deploy

variables:
  NODE_VERSION: "18"

before_script:
  - npm ci
  - npx playwright install

lint:
  stage: validate
  script:
    - npm run lint
    - npm run type-check
  only:
    - merge_requests
    - main

unit_tests:
  stage: test
  script:
    - npm run test:unit
  artifacts:
    when: always
    reports:
      junit: tests/reports/junit.xml
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura.xml
    paths:
      - tests/reports/
      - coverage/
    expire_in: 1 week

integration_tests:
  stage: test
  script:
    - npm run test:integration
  artifacts:
    when: always
    paths:
      - tests/reports/
    expire_in: 1 week

performance_tests:
  stage: performance
  script:
    - npm run test:performance
  artifacts:
    when: always
    paths:
      - tests/reports/
    expire_in: 1 week
  only:
    - main
    - develop

cross_browser_tests:
  stage: test
  parallel:
    matrix:
      - BROWSER: [chrome, firefox]
  script:
    - npm run test:browser -- --browser=$BROWSER
  artifacts:
    when: always
    paths:
      - tests/reports/screenshots/
    expire_in: 1 week

deploy_reports:
  stage: deploy
  script:
    - echo "Deploying test reports to internal server"
    # rsync ou upload vers serveur de rapports
  only:
    - main
```

### Script de déploiement automatique

```bash
#!/bin/bash
# deploy-test-reports.sh

echo "🚀 Déploiement des rapports de tests SQH..."

# Variables
REPORT_SERVER="reports.company.com"
REPORT_PATH="/var/www/sqh-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Créer archive des rapports
echo "📦 Création de l'archive..."
tar -czf sqh-reports-${TIMESTAMP}.tar.gz tests/reports/

# Upload vers serveur
echo "📤 Upload vers ${REPORT_SERVER}..."
scp sqh-reports-${TIMESTAMP}.tar.gz ${REPORT_SERVER}:${REPORT_PATH}/archives/

# Extraction et mise à jour
ssh ${REPORT_SERVER} << EOF
cd ${REPORT_PATH}
tar -xzf archives/sqh-reports-${TIMESTAMP}.tar.gz
mv tests/reports/* current/
rm -rf tests/
chown -R www-data:www-data current/
chmod -R 755 current/
echo "✅ Rapports mis à jour: $(date)"
EOF

# Notification
curl -X POST -H 'Content-type: application/json' \
    --data '{"text":"📊 Nouveaux rapports SQH disponibles: https://reports.company.com/sqh/"}' \
    $SLACK_WEBHOOK_URL

echo "✅ Déploiement terminé"
```

## 🐛 Debugging et dépannage

### Mode debug activé

```javascript
// Configuration avec debug
const debugConfig = {
    ...SQHTestConfig,
    debug: {
        enabled: true,
        breakOnFailure: true,
        verboseErrors: true,
        saveErrorScreenshots: true,
        logTestExecution: true
    }
};

const launcher = new SQHTestLauncher(debugConfig);
```

### Capture d'erreurs avancée

```javascript
// Gestionnaire d'erreurs global
window.addEventListener('error', (event) => {
    console.error('💥 Erreur globale:', {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack
    });
});

// Capture des erreurs de promesses
window.addEventListener('unhandledrejection', (event) => {
    console.error('💥 Promesse rejetée:', event.reason);
});

// Test avec capture d'erreur
it('devrait capturer les erreurs de transpilation', async () => {
    const consoleLogs = SQHTestUtils.captureConsole();
    
    try {
        const invalidCode = 'puts "unclosed string';
        window.hybridParser.transpileRuby(invalidCode);
        
        // Vérifier que l'erreur a été loggée
        expect(consoleLogs.logs.some(log => 
            log.type === 'error' && log.args[0].includes('SyntaxError')
        )).toBe(true);
        
    } finally {
        consoleLogs.restore();
    }
});
```

### Debugging de performance

```javascript
// Profiling détaillé
const profiler = {
    start: (name) => {
        console.time(name);
        return {
            end: () => {
                console.timeEnd(name);
                const timing = performance.getEntriesByName(name);
                return timing[timing.length - 1]?.duration || 0;
            }
        };
    }
};

// Test de performance avec profiling
it('devrait créer des instances rapidement', async () => {
    const timer = profiler.start('instance-creation');
    
    const instances = [];
    for (let i = 0; i < 1000; i++) {
        instances.push(new A({ id: `perf-${i}` }));
    }
    
    const duration = timer.end();
    
    expect(duration).toBeLessThan(100); // 100ms max
    expect(instances.length).toBe(1000);
    
    // Vérification mémoire
    if (performance.memory) {
        const memoryAfter = performance.memory.usedJSHeapSize;
        console.log(`Mémoire utilisée: ${Math.round(memoryAfter / 1024)}KB`);
    }
});
```

## 📈 Optimisation et bonnes pratiques

### Optimisation des tests

```javascript
// Regroupement des tests similaires
describe('Performance du framework A', () => {
    let instances = [];
    
    beforeAll(() => {
        // Setup lourd une seule fois
        instances = Array(100).fill(0).map((_, i) => 
            new A({ id: `shared-${i}` })
        );
    });
    
    afterAll(() => {
        // Cleanup global
        instances.forEach(instance => {
            if (instance.element.parentNode) {
                instance.element.parentNode.removeChild(instance.element);
            }
        });
    });
    
    it('devrait gérer de nombreuses instances', () => {
        expect(instances.length).toBe(100);
        expect(instances.every(i => i.element)).toBe(true);
    });
});

// Tests parallélisés avec workers
const runParallelTests = async (testGroups) => {
    const workers = testGroups.map(async (group, index) => {
        const worker = new Worker(`test-worker-${index}.js`);
        return new Promise((resolve) => {
            worker.postMessage({ tests: group });
            worker.onmessage = (e) => resolve(e.data);
        });
    });
    
    return Promise.all(workers);
};
```

### Gestion de la mémoire

```javascript
// Test de fuite mémoire
it('ne devrait pas avoir de fuites mémoire', async () => {
    const initialMemory = performance.memory?.usedJSHeapSize || 0;
    
    // Créer et détruire de nombreuses instances
    for (let cycle = 0; cycle < 10; cycle++) {
        const instances = Array(100).fill(0).map(() => 
            new A({ id: `leak-test-${cycle}-${Math.random()}` })
        );
        
        // Cleanup explicite
        instances.forEach(instance => {
            if (instance.element.parentNode) {
                instance.element.parentNode.removeChild(instance.element);
            }
            if (window._registry && instance._data.id) {
                delete window._registry[instance._data.id];
            }
        });
        
        // Forcer garbage collection
        if (window.gc) window.gc();
        
        // Attendre un peu
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    const finalMemory = performance.memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;
    
    // L'augmentation ne doit pas dépasser 1MB
    expect(memoryIncrease).toBeLessThan(1024 * 1024);
});
```

### Tests de compatibilité

```javascript
// Test cross-browser
const browserTests = {
    chrome: () => testChromeSpecific(),
    firefox: () => testFirefoxSpecific(),
    safari: () => testSafariSpecific()
};

Object.entries(browserTests).forEach(([browser, testFn]) => {
    describe(`Compatibilité ${browser}`, () => {
        beforeAll(() => {
            // Setup spécifique au navigateur
            if (!window.navigator.userAgent.toLowerCase().includes(browser)) {
                pending(`Tests ${browser} ignorés sur ce navigateur`);
            }
        });
        
        it(`devrait fonctionner sur ${browser}`, testFn);
    });
});
```

## 📱 Interface de monitoring en temps réel

### Dashboard web simple

```html
<!DOCTYPE html>
<html>
<head>
    <title>SQH Test Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div id="dashboard">
        <h1>🧪 SQH Test Dashboard</h1>
        
        <div class="metrics">
            <div class="metric">
                <h3>Tests en cours</h3>
                <span id="running-tests">0</span>
            </div>
            <div class="metric">
                <h3>Taux de succès</h3>
                <span id="success-rate">0%</span>
            </div>
            <div class="metric">
                <h3>Performance</h3>
                <span id="performance">0 ops/sec</span>
            </div>
        </div>
        
        <canvas id="performance-chart"></canvas>
        
        <div id="alerts"></div>
    </div>
    
    <script>
        const monitor = new SQHRealTimeMonitor();
        
        monitor.subscribe((event) => {
            if (event.type === 'metrics') {
                updateDashboard(event.data);
            } else if (event.type === 'alert') {
                showAlert(event.data);
            }
        });
        
        function updateDashboard(data) {
            document.getElementById('running-tests').textContent = 
                data.metrics.tests?.running || 0;
            // ... mise à jour des autres métriques
        }
        
        function showAlert(alert) {
            const alertDiv = document.createElement('div');
            alertDiv.className = `alert alert-${alert.severity}`;
            alertDiv.textContent = alert.message;
            document.getElementById('alerts').appendChild(alertDiv);
        }
        
        monitor.start();
    </script>
</body>
</html>
```

## 🎓 Exemples d'utilisation avancée

### Test de régression automatique

```javascript
// tests/suites/regression/auto-regression.test.js
describe('Régression automatique', () => {
    const previousResults = loadPreviousResults();
    
    it('ne devrait pas régresser en performance', async () => {
        const currentResults = await runPerformanceBenchmarks();
        
        Object.keys(currentResults).forEach(benchmark => {
            const current = currentResults[benchmark].opsPerSecond;
            const previous = previousResults[benchmark]?.opsPerSecond || 0;
            const regression = (previous - current) / previous;
            
            expect(regression).toBeLessThan(0.1); // Max 10% de régression
        });
    });
    
    it('ne devrait pas introduire de nouvelles erreurs', () => {
        const knownErrors = previousResults.errors || [];
        const currentErrors = getCurrentErrors();
        
        const newErrors = currentErrors.filter(error => 
            !knownErrors.some(known => known.message === error.message)
        );
        
        expect(newErrors).toHaveLength(0);
    });
});
```

### Test de montée en charge

```javascript
// tests/suites/advanced/load-test.test.js
describe('Tests de montée en charge', () => {
    it('devrait gérer une augmentation progressive de la charge', async () => {
        const results = [];
        
        // Test avec charge croissante
        for (let load = 100; load <= 10000; load *= 2) {
            const startTime = performance.now();
            
            const instances = Array(load).fill(0).map((_, i) => 
                new A({ id: `load-${load}-${i}` })
            );
            
            const duration = performance.now() - startTime;
            const throughput = load / duration * 1000; // instances/sec
            
            results.push({ load, duration, throughput });
            
            // Cleanup
            instances.forEach(instance => {
                if (instance.element.parentNode) {
                    instance.element.parentNode.removeChild(instance.element);
                }
            });
            
            console.log(`Charge ${load}: ${Math.round(throughput)} instances/sec`);
        }
        
        // Vérifier que la performance reste acceptable
        const lastResult = results[results.length - 1];
        expect(lastResult.throughput).toBeGreaterThan(100); // Min 100 instances/sec
    });
});
```

## 🔧 Maintenance et évolution

### Mise à jour des seuils

```javascript
// scripts/update-thresholds.js
const fs = require('fs').promises;

async function updatePerformanceThresholds() {
    const recentResults = await loadRecentTestResults(30); // 30 derniers jours
    const averages = calculateAverages(recentResults);
    
    const newThresholds = {
        instanceCreation: { opsPerSecond: Math.floor(averages.instanceCreation * 0.8) },
        transpilation: { opsPerSecond: Math.floor(averages.transpilation * 0.8) },
        // ... autres seuils
    };
    
    const config = await fs.readFile('tests/sqh-test.config.js', 'utf8');
    const updatedConfig = updateConfigThresholds(config, newThresholds);
    
    await fs.writeFile('tests/sqh-test.config.js', updatedConfig);
    
    console.log('✅ Seuils mis à jour:', newThresholds);
}
```

### Nettoyage automatique

```javascript
// scripts/cleanup-old-reports.js
const fs = require('fs').promises;
const path = require('path');

async function cleanupOldReports() {
    const reportDir = 'tests/reports';
    const retentionDays = 30;
    const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    
    const files = await fs.readdir(reportDir);
    
    for (const file of files) {
        const filePath = path.join(reportDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffDate) {
            await fs.unlink(filePath);
            console.log(`🗑️ Supprimé: ${file}`);
        }
    }
}

// Exécution automatique
setInterval(cleanupOldReports, 24 * 60 * 60 * 1000); // Quotidien
```

## 🎯 Conclusion

Ce système de tests SQH offre une couverture complète et extensible pour votre framework. Il permet :

- **Détection précoce** des régressions et bugs
- **Monitoring continu** des performances
- **Validation automatique** de la qualité du code
- **Rapports détaillés** pour le suivi et l'amélioration
- **Intégration facile** dans les workflows de développement

### Prochaines étapes recommandées

1. **Implémenter progressivement** en commençant par les tests unitaires
2. **Configurer l'intégration CI/CD** pour automatiser les tests
3. **Établir des seuils de performance** basés sur vos besoins
4. **Former l'équipe** aux bonnes pratiques de test
5. **Étendre le système** avec des tests spécifiques à votre domaine

Le système est conçu pour évoluer avec votre projet et s'adapter à vos besoins spécifiques. N'hésitez pas à le personnaliser et l'étendre selon vos requirements particuliers.

---

**Version :** 1.0.0  
**Dernière mise à jour :** 2025  
**Support :** Framework SQH Team