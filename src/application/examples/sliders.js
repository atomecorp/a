/**
 * 🎚️ Démo Sliders Ultra Simple - Squirrel Framework
 */

console.log('📊 Début de la démo sliders ultra simple');

// Vérifier si SliderCompatible est disponible
console.log('🔍 SliderCompatible disponible ?', typeof SliderCompatible !== 'undefined');
if (typeof SliderCompatible !== 'undefined') {
    console.log('✅ SliderCompatible trouvé:', SliderCompatible);
} else {
    console.error('❌ SliderCompatible non trouvé!');
    console.log('🔍 Variables globales disponibles:', Object.keys(window).filter(k => k.includes('Slider')));
}

function createSimpleSliders() {
    console.log('🚀 Création des 5 sliders simples...');
    
    try {
        // 1. Slider horizontal basique (0-100)
        console.log('Création slider 1...');
        const slider1 = new SliderCompatible({
            attach: 'body',
            x: 50,
            y: 50,
            width: 300,
            height: 60,
            min: 0,
            max: 100,
            value: 50,
            type: 'horizontal',
            callbacks: {
                onChange: (value) => console.log('Horizontal 1:', value)
            }
        });
        console.log('✅ Slider horizontal 1 créé:', slider1);

        // 2. Slider horizontal -100 à +100
        console.log('Création slider 2...');
        const slider2 = new SliderCompatible({
            attach: 'body',
            x: 50,
            y: 130,
            width: 300,
            height: 60,
            min: -100,
            max: 100,
            value: 0,
            type: 'horizontal',
            styling: {
                progressColor: '#ff5722',
                thumbColor: '#ff5722'
            },
            callbacks: {
                onChange: (value) => console.log('Horizontal 2 (-100/+100):', value)
            }
        });
        console.log('✅ Slider horizontal 2 créé:', slider2);

        // 3. Slider vertical
        console.log('Création slider 3...');
        const slider3 = new SliderCompatible({
            attach: 'body',
            x: 400,
            y: 50,
            width: 60,
            height: 200,
            min: 0,
            max: 100,
            value: 75,
            type: 'vertical',
            styling: {
                progressColor: '#4caf50',
                thumbColor: '#4caf50'
            },
            callbacks: {
                onChange: (value) => console.log('Vertical:', value)
            }
        });
        console.log('✅ Slider vertical créé:', slider3);

        // 4. Slider circulaire
        console.log('Création slider 4...');
        const slider4 = new SliderCompatible({
            attach: 'body',
            x: 500,
            y: 50,
            width: 150,
            height: 150,
            min: 0,
            max: 360,
            value: 180,
            type: 'circular',
            styling: {
                progressColor: '#9c27b0',
                thumbColor: '#9c27b0'
            },
            callbacks: {
                onChange: (value) => console.log('Circulaire:', value + '°')
            }
        });
        console.log('✅ Slider circulaire créé:', slider4);

        // 5. Slider circulaire borné (quart de cercle)
        console.log('Création slider 5...');
        const slider5 = new SliderCompatible({
            attach: 'body',
            x: 700,
            y: 50,
            width: 150,
            height: 150,
            min: 0,
            max: 100,
            value: 50,
            type: 'circular',
            circularConfig: {
                startAngle: -45,   // Commence à -45°
                endAngle: 45,      // Finit à 45° (arc de 90°)
                clockwise: true
            },
            styling: {
                progressColor: '#ff9800',
                thumbColor: '#ff9800',
                trackColor: '#e0e0e0'
            },
            callbacks: {
                onChange: (value) => console.log('Circulaire borné:', value + '%')
            }
        });
        console.log('✅ Slider circulaire borné créé:', slider5);

        console.log('✅ Tous les sliders simples créés !');
        
        // Vérifier que tous les sliders sont dans le DOM
        setTimeout(() => {
            const sliders = document.querySelectorAll('squirrel-slider');
            console.log(`📊 ${sliders.length} sliders trouvés dans le DOM`);
            sliders.forEach((slider, index) => {
                console.log(`Slider ${index + 1}:`, slider, 'Visible:', slider.offsetParent !== null);
            });
        }, 100);
        
    } catch (error) {
        console.error('❌ Erreur lors de la création des sliders:', error);
    }
}

// Lancer directement la création des sliders
if (typeof SliderCompatible !== 'undefined') {
    createSimpleSliders();
} else {
    console.error('❌ Impossible de créer les sliders: SliderCompatible non disponible');
    // Essayer de nouveau dans 100ms
    setTimeout(() => {
        if (typeof SliderCompatible !== 'undefined') {
            console.log('✅ SliderCompatible maintenant disponible, création des sliders...');
            createSimpleSliders();
        } else {
            console.error('❌ SliderCompatible toujours pas disponible après délai');
        }
    }, 100);
}

