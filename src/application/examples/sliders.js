// Import de la classe Slider paramétrée
import Slider from '../../a/components/Slider.js';

// Exemple 1: Slider horizontal classique
const volumeSlider = new Slider({
    attach: 'body',
    id: 'volume_slider',
    type: 'horizontal',
    x: 50,
    y: 100,
    width: 400,
    height: 30,
    trackWidth: 360,
    value: 30,
    callbacks: {
        onChange: (value) => console.log(`Volume: ${value}%`),
        onStart: () => console.log('Volume adjustment started'),
        onEnd: () => console.log('Volume adjustment ended')
    }
});

// Exemple 2: Slider vertical avec variation de couleurs
const brightnessSlider = new Slider({
    attach: 'body',
    id: 'brightness_slider',
    type: 'vertical',
    x: 500,
    y: 100,
    width: 80,
    height: 300,
    trackWidth: 8,     // Épaisseur de la barre verticale (petite valeur)
    trackHeight: 200,  // Longueur de déplacement vertical (grande valeur)
    value: 70,
  
    grip: {
        width: 28,
        height: 28,
        backgroundColor: '#e74c3c',
        border: '3px solid #ffffff',
        borderRadius: '8px',  // Coins arrondis au lieu d'un cercle
        boxShadow: '0 6px 20px rgba(231, 76, 60, 0.4)',
        cursor: 'grab'
    },
    
    support: {
        backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: 'none',
        borderRadius: '20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
        padding: '20px'
    },
    
    rail: {
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: '6px',
        height: 12
    },
    
    progress: {
        backgroundColor: 'linear-gradient(90deg, #ff6b6b, #feca57)',
        borderRadius: '6px',
        boxShadow: '0 4px 15px rgba(255, 107, 107, 0.4)'
    }
    ,
    variation: [
        { color: '#0099ff', position: { x: '0%' } },    // Froid (bleu)
        { color: '#00ff99', position: { x: '30%' } },   // Frais (vert)
        { color: '#ffff00', position: { x: '60%' } },   // Tiède (jaune)
        { color: '#ff6600', position: { x: '80%' } },   // Chaud (orange)
        { color: '#ff0000', position: { x: '100%' } }   // Très chaud (rouge)
    ],
    callbacks: {
        onChange: (value) => console.log(`Brightness: ${value}%`)
    }
});

// Exemple 3: Slider de température avec variation de couleurs
const tempSlider = new Slider({
    attach: 'body',
    id: 'temperature_slider',
    type: 'horizontal',
    x: 50,
    y: 300,
    width: 350,
    height: 100,
    trackWidth: 300,
    trackHeight: 12,
    value: 21,
    min: -10,
    max: 40,
    step: 0.5,
    theme: 'material',
    variation: [
        { color: 'red', position: { x: '0%' } },    // Froid (bleu)
        { color: 'yellow', position: { x: '30%' } },   // Frais (vert)
        { color: 'green', position: { x: '60%' } },   // Tiède (jaune)
        { color: 'black', position: { x: '80%' } },   // Chaud (orange)
        { color: 'white', position: { x: '100%' } }   // Très chaud (rouge)
    ],
    callbacks: {
        onChange: (value) => {
            console.log(`Temperature: ${value}°C`);
        }
    }
});

// Exemple 4: Slider de volume avec design flat
const bassSlider = new Slider({
    attach: 'body',
    id: 'bass_slider',
    type: 'horizontal',
    x: 50,
    y: 450,
    width: 250,
    height: 80,
    trackWidth: 200,
    trackHeight: 4,
    thumbSize: 20,
    value: 50,
    min: 0,
    max: 100,
    step: 5,
    theme: 'flat',
    colors: {
        container: '#2c3e50',
        track: '#34495e',
        progress: '#e74c3c',
        thumb: '#c0392b',
        text: '#ecf0f1'
    },
    animations: {
        enabled: true,
        duration: 0.3,
        easing: 'ease-out'
    }
});

console.log('🎚️ Sliders paramétriques créés avec succès!');

// Exemple 5: Slider avec variation de couleurs avancée
const radialSlider = new Slider({
    attach: 'body',
    id: 'radial_gradient_slider',
    type: 'horizontal',
    x: 350,
    y: 450,
    width: 300,
    height: 100,
    trackWidth: 250,
    trackHeight: 10,
    thumbSize: 26,
    value: 60,
    min: 0,
    max: 100,
    step: 2,
    theme: 'material',
    colors: {
        container: '#ffffff',
        track: '#f0f0f0',
        text: '#424242'
    },
    variation: [
        { color: '#6200ea', position: { x: '0%' } },
        { color: '#3700b3', position: { x: '50%' } },
        { color: '#03dac6', position: { x: '100%' } }
    ],
    animations: {
        enabled: true,
        duration: 0.15,
        easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)'
    },
    callbacks: {
        onChange: (value) => {
            console.log(`🌀 Radial Effect: ${value}%`);
        },
        onStart: () => console.log('🎯 Radial adjustment started'),
        onEnd: () => console.log('✅ Radial adjustment completed')
    }
});

// Test de mise à jour programmée des valeurs
setTimeout(() => {
    console.log('📊 Test de mise à jour programmée des sliders...');
    
    // Changer la valeur du volume
    if (volumeSlider.setValue) {
        volumeSlider.setValue(85);
        console.log('🔊 Volume mis à jour à 85%');
    }
    
    // Changer la température
    if (tempSlider.setValue) {
        tempSlider.setValue(25);
        console.log('🌡️ Température mise à jour à 25°C');
    }
    
    // Tester l'effet radial
    if (radialSlider.setValue) {
        radialSlider.setValue(90);
        console.log('🌀 Effet radial mis à jour à 90%');
    }
    
}, 3000);

// Exemple 6: Slider circulaire - NOUVEAU TYPE!
const circularVolumeSlider = new Slider({
    attach: 'body',
    id: 'circular_volume_slider',
    type: 'circular',
    x: 700,
    y: 100,
    value: 45,
    min: 0,
    max: 100,
    step: 1,
    circular: {
        radius: 60,
        strokeWidth: 12,
        startAngle: -135,  // Commence à 7h30
        endAngle: 135      // Finit à 4h30 (270° de rotation)
    },
    colors: {
        container: '#ffffff',
        track: '#e3f2fd',
        progress: '#2196f3',
        thumb: '#1976d2'
    },
    variation: [
        { color: '#4caf50', position: { x: '0%' } },   // Vert (faible volume)
        { color: '#ff9800', position: { x: '70%' } },  // Orange (volume moyen)
        { color: '#f44336', position: { x: '100%' } }  // Rouge (volume élevé)
    ],
    callbacks: {
        onChange: (value) => {
            console.log(`🎛️ Volume circulaire: ${Math.round(value)}%`);
            // Exemple d'effet visuel basé sur la valeur
            if (value > 80) {
                console.log('⚠️ Volume élevé détecté!');
            }
        },
        onStart: () => console.log('🎚️ Ajustement du volume circulaire commencé'),
        onEnd: () => console.log('✅ Ajustement du volume circulaire terminé')
    }
});

// Exemple 7: Slider circulaire pour température avec demi-cercle
const circularTempSlider = new Slider({
    attach: 'body',
    id: 'circular_temp_slider',
    type: 'circular',
    x: 900,
    y: 100,
    value: 22,
    min: 10,
    max: 35,
    step: 0.5,
    circular: {
        radius: 80,
        strokeWidth: 16,
        startAngle: -180,  // Demi-cercle gauche
        endAngle: 0        // Demi-cercle droit
    },
    colors: {
        container: '#ffffff',
        track: '#f5f5f5',
        progress: '#ff5722',
        thumb: '#d84315'
    },
    variation: [
        { color: '#2196f3', position: { x: '0%' } },   // Bleu (froid)
        { color: '#4caf50', position: { x: '40%' } },  // Vert (tempéré)
        { color: '#ff9800', position: { x: '70%' } },  // Orange (chaud)
        { color: '#f44336', position: { x: '100%' } }  // Rouge (très chaud)
    ],
    callbacks: {
        onChange: (value) => {
            console.log(`🌡️ Température: ${value}°C`);
            if (value < 15) console.log('🥶 Il fait froid!');
            else if (value > 28) console.log('🔥 Il fait chaud!');
            else console.log('😊 Température agréable');
        }
    }
});

console.log('🎚️ Sliders paramétriques créés avec succès!');
console.log('📋 Types de sliders disponibles:');
console.log('   - Slider horizontal classique (Volume)');
console.log('   - Slider vertical avec gradient (Brightness)'); 
console.log('   - Slider avec gradient complexe (Temperature)');
console.log('   - Slider avec thème flat (Bass)');
console.log('   - Slider avec gradient radial (Radial Effect)');
console.log('   🆕 - Slider circulaire - Volume (270°)');
console.log('   🆕 - Slider circulaire - Température (180°)');

// ...existing code...

