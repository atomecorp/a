/**
 * 🚀 MODERN PARTICLE SYSTEM DEMO
 * 
 * Démonstration complète du nouveau système de particules unifié
 * qui bridge Framework A traditionnel + Web Components modernes
 * 
 * @version 3.0.0 - MODERN HYBRID SYSTEM
 * @author Squirrel Framework Team
 */

// Import du système moderne
import { Module } from '../../a/components/Module.js';
import { particleProcessor, ParticleUtils } from '../../a/utils/modern-particle-system.js';
import { sharedParticles } from '../../a/utils/shared-particles.js';

console.log('🚀 MODERN PARTICLE SYSTEM DEMO - Démarrage...');

/**
 * 📊 AFFICHAGE DES MÉTRIQUES DE PERFORMANCE
 */
function displayMetrics() {
    const metrics = ParticleUtils.monitor();
    console.log('📊 Performance Metrics:', metrics);
    
    // Afficher dans l'interface
    let metricsDiv = document.getElementById('metrics-display');
    if (!metricsDiv) {
        metricsDiv = document.createElement('div');
        metricsDiv.id = 'metrics-display';
        metricsDiv.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            z-index: 10000;
            max-width: 300px;
        `;
        document.body.appendChild(metricsDiv);
    }
    
    metricsDiv.innerHTML = `
        <h4>🚀 Modern Particle System</h4>
        <div>Particules: ${metrics.particlesCount}</div>
        <div>Cache: ${metrics.cacheSize}</div>
        <div>Queue: ${metrics.queueSize}</div>
        <div>Batch Mode: ${metrics.batchMode ? '✅' : '❌'}</div>
        <div>Performance Mode: ${metrics.performanceMode ? '✅' : '❌'}</div>
        <div>Fallback: ${metrics.fallbackEnabled ? '✅' : '❌'}</div>
    `;
}

/**
 * 🎯 DEMO 1: MODULE AVEC SYSTÈME MODERNE
 */
console.log('\n🎯 Demo 1: Module avec système de particules moderne');

const modernModule = new Module({
    id: 'modern-demo-1',
    name: 'Modern Particle Module',
    attach: 'body',
    x: 50,
    y: 50,
    width: 250,
    height: 150,
    
    inputs: [
        { id: 'modern_in', type: 'audio', name: 'Audio In' }
    ],
    
    outputs: [
        { id: 'modern_out', type: 'audio', name: 'Audio Out' }
    ],
    
    // Configuration moderne
    animations: {
        enabled: true,
        duration: '0.4s',
        timing: 'cubic-bezier(0.4, 0, 0.2, 1)'
    }
});

// Activer les optimisations modernes
modernModule.enableModernOptimizations();

// Appliquer des styles modernes via particules
modernModule.applyModernStyling({
    backgroundColor: '#667eea',
    smooth: true,
    gradient: {
        type: 'linear',
        direction: '135deg',
        colors: ['#667eea', '#764ba2']
    }
});

// Animation d'entrée moderne
modernModule.animateModernEntry().then(() => {
    console.log('✅ Animation d\'entrée terminée');
});

/**
 * 🔥 DEMO 2: BATCH PROCESSING ULTRA PERFORMANCE
 */
console.log('\n🔥 Demo 2: Batch processing ultra performance');

const batchModule = new Module({
    id: 'batch-demo',
    name: 'Batch Performance',
    attach: 'body',
    x: 350,
    y: 50,
    width: 200,
    height: 120
});

// Test de performance batch
const startTime = performance.now();

batchModule.setParticles({
    x: 350,
    y: 50,
    width: 200,
    height: 120,
    backgroundColor: '#e74c3c',
    opacity: 0.9,
    smooth: true
}, { batch: true }).then(() => {
    const endTime = performance.now();
    console.log(`⚡ Batch processing time: ${endTime - startTime}ms`);
});

/**
 * 💎 DEMO 3: EFFETS VISUELS AVANCÉS
 */
console.log('\n💎 Demo 3: Effets visuels avancés');

const fxModule = new Module({
    id: 'fx-demo',
    name: 'Visual Effects',
    attach: 'body',
    x: 50,
    y: 250,
    width: 220,
    height: 140
});

// Appliquer des effets avancés (si les particules sont disponibles)
if (sharedParticles.some(p => p.name === 'glow')) {
    fxModule.setParticle('glow', {
        color: '#f39c12',
        intensity: 0.5,
        spread: 10
    });
}

if (sharedParticles.some(p => p.name === 'gradient')) {
    fxModule.setParticle('gradient', {
        type: 'radial',
        center: '30% 30%',
        colors: ['#f093fb', '#f5576c', '#4facfe']
    });
}

/**
 * 🎮 DEMO 4: INTERACTIONS MODERNES
 */
console.log('\n🎮 Demo 4: Interactions modernes');

const interactiveModule = new Module({
    id: 'interactive-demo',
    name: 'Interactive Effects',
    attach: 'body',
    x: 350,
    y: 250,
    width: 200,
    height: 120
});

// Activer les effets de survol modernes
interactiveModule.enableModernHoverEffects();

// Événements personnalisés
interactiveModule.addEventListener('click', () => {
    // Animation de click
    interactiveModule.animateParticle('width', 200, 220, 200, 'ease-out')
        .then(() => {
            return interactiveModule.animateParticle('width', 220, 200, 200, 'ease-in');
        });
});

/**
 * 🔧 DEMO 5: UTILITAIRES MODERNES
 */
console.log('\n🔧 Demo 5: Utilitaires modernes');

// Créer des éléments avec particules en une ligne
const quickElement = ParticleUtils.createElement('div', {
    x: 600,
    y: 50,
    width: 150,
    height: 80,
    backgroundColor: '#9b59b6',
    opacity: 0.8,
    smooth: true
}, 'Quick Element');

document.body.appendChild(quickElement);

// Mise à jour batch de plusieurs éléments
const elements = [modernModule, batchModule, fxModule];
ParticleUtils.updateElements(elements, {
    smooth: true,
    opacity: 0.95
}).then(() => {
    console.log('✅ Batch update terminé');
});

/**
 * 📈 DEMO 6: MONITORING DE PERFORMANCE
 */
console.log('\n📈 Demo 6: Monitoring de performance');

// Afficher les métriques initiales
displayMetrics();

// Mettre à jour les métriques toutes les 3 secondes
setInterval(displayMetrics, 3000);

// Test de stress
function stressTest() {
    console.log('\n💥 Stress test démarré...');
    
    const promises = [];
    for (let i = 0; i < 10; i++) {
        const module = new Module({
            id: `stress-${i}`,
            name: `Stress ${i}`,
            attach: 'body',
            x: 100 + (i % 5) * 120,
            y: 450 + Math.floor(i / 5) * 100,
            width: 100,
            height: 80
        });
        
        // Animation aléatoire
        promises.push(
            module.animateParticle('opacity', 0, 1, 500 + Math.random() * 500, 'ease-out')
        );
    }
    
    Promise.all(promises).then(() => {
        console.log('✅ Stress test terminé');
        displayMetrics();
    });
}

// Démarrer le stress test après 2 secondes
setTimeout(stressTest, 2000);

/**
 * 🎯 DEMO 7: MIGRATION FRAMEWORK A
 */
console.log('\n🎯 Demo 7: Test de compatibilité Framework A');

// Simuler l'ancien système Framework A
if (!window.setParticle) {
    window.setParticle = function(element, name, value, options) {
        console.log(`🔄 Legacy Framework A: ${name} = ${value}`);
        // Simulation basique
        if (element && element.style) {
            element.style[name] = value;
        }
        return true;
    };
    
    window.defineParticle = function(config) {
        console.log(`📝 Legacy Framework A particle defined: ${config.name}`);
        return true;
    };
}

// Test de fallback
const legacyModule = new Module({
    id: 'legacy-test',
    name: 'Legacy Compatibility',
    attach: 'body',
    x: 600,
    y: 250,
    width: 180,
    height: 100
});

// Particule inexistante pour tester le fallback
legacyModule.setParticle('customProperty', 'test-value');

/**
 * 🎊 CONTROLS POUR TESTING
 */
console.log('\n🎊 Creating interactive controls...');

const controlsDiv = document.createElement('div');
controlsDiv.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: rgba(255, 255, 255, 0.9);
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    font-family: Arial, sans-serif;
    z-index: 10000;
`;

controlsDiv.innerHTML = `
    <h4>🎮 Modern Particle System Controls</h4>
    <button id="optimize-btn">⚡ Optimize Performance</button>
    <button id="reset-btn">🔄 Reset System</button>
    <button id="clear-cache-btn">🧹 Clear Cache</button>
    <button id="stress-btn">💥 Stress Test</button>
    <br><br>
    <label>
        <input type="checkbox" id="batch-mode" checked> Batch Mode
    </label>
    <br>
    <label>
        <input type="checkbox" id="performance-mode" checked> Performance Mode
    </label>
`;

document.body.appendChild(controlsDiv);

// Event listeners pour les contrôles
document.getElementById('optimize-btn').addEventListener('click', () => {
    ParticleUtils.optimize();
    console.log('⚡ Performance optimized');
    displayMetrics();
});

document.getElementById('reset-btn').addEventListener('click', () => {
    ParticleUtils.reset();
    console.log('🔄 System reset');
    displayMetrics();
});

document.getElementById('clear-cache-btn').addEventListener('click', () => {
    particleProcessor.clearCache();
    console.log('🧹 Cache cleared');
    displayMetrics();
});

document.getElementById('stress-btn').addEventListener('click', stressTest);

document.getElementById('batch-mode').addEventListener('change', (e) => {
    particleProcessor.batchMode = e.target.checked;
    console.log(`🔄 Batch mode: ${e.target.checked}`);
    displayMetrics();
});

document.getElementById('performance-mode').addEventListener('change', (e) => {
    particleProcessor.performanceMode = e.target.checked;
    console.log(`🎯 Performance mode: ${e.target.checked}`);
    displayMetrics();
});

console.log('\n🎉 Modern Particle System Demo completed!');
console.log('✨ Check the browser console and UI for interactive controls');

// Export pour usage externe
window.ModernParticleDemo = {
    modules: { modernModule, batchModule, fxModule, interactiveModule, legacyModule },
    utils: ParticleUtils,
    processor: particleProcessor,
    metrics: displayMetrics,
    stressTest
};
