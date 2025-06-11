/**
 * 🎚️ Démo Sliders Ultra Simple - Squirrel Framework
 */


function createAdvancedSliders() {
    console.log('🚀 Création des 6 sliders avancés...');
    
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
                trackColor: '#e0e0e0',
                thumbShadow: '0 3px 3px rgba(0, 0, 0, 1)' // Ombre orange personnalisée
            },
            callbacks: {
                onChange: (value) => console.log('Circulaire borné:', value + '%')
            }
        });
        console.log('✅ Slider circulaire borné créé:', slider5);

        // 6. Slider ultra-stylé avec toutes les fonctionnalités avancées
        console.log('Création slider 6 ultra-stylé...');
        const slider6 = new SliderCompatible({
            attach: 'body',
            x: 50,
            y: 280,
            width: 400,
            height: 80,
            min: 0,
            max: 100,
            value: 30,
            type: 'horizontal',
            styling: {
                backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                trackColor: 'rgba(255,255,255,0.2)',
                trackBackground: 'rgba(255,255,255,0.2)',
                thumbSize: 32,
                trackHeight: 12,
                containerPadding: 16,
                borderRadius: '20px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                
                // Advanced styling
                thumbColor: '#ffffff',
                thumbBoxShadow: '0 4px 20px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.2)',
                thumbBorderRadius: '50%',
                thumbHoverTransform: 'scale(1.1)',
                thumbDragTransform: 'scale(1.2)',
                
                progressBorderRadius: '6px',
                progressDragTransform: 'scaleY(1.2)',
                trackBorderRadius: '6px',
                
                // Gradient progress variation based on position
                progressVariation: (percentage) => {
                    if (percentage < 0.33) {
                        return `linear-gradient(90deg, #ff6b6b ${percentage * 300}%, #feca57 100%)`;
                    } else if (percentage < 0.66) {
                        return `linear-gradient(90deg, #feca57 0%, #48dbfb ${(percentage - 0.33) * 300}%, #0abde3 100%)`;
                    } else {
                        return `linear-gradient(90deg, #0abde3 0%, #006ba6 ${(percentage - 0.66) * 300}%, #1dd1a1 100%)`;
                    }
                }
            },
            callbacks: {
                onChange: (value) => console.log('🎨 Ultra-stylé:', value + '%'),
                onStart: () => console.log('🎨 Ultra-stylé: Start drag'),
                onEnd: () => console.log('🎨 Ultra-stylé: End drag'),
                onDrag: (value) => console.log('🎨 Ultra-stylé: Dragging:', value + '%'),
                onDoubleClick: () => console.log('🎨 Ultra-stylé: Double-click reset!')
            }
        });
        console.log('✅ Slider ultra-stylé créé:', slider6);

        console.log('✅ Tous les sliders créés (6/6) !');
        
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
    createAdvancedSliders();
} else {
    console.error('❌ Impossible de créer les sliders: SliderCompatible non disponible');
    // Essayer de nouveau dans 100ms
    setTimeout(() => {
        if (typeof SliderCompatible !== 'undefined') {
            console.log('✅ SliderCompatible maintenant disponible, création des sliders...');
            createAdvancedSliders();
        } else {
            console.error('❌ SliderCompatible toujours pas disponible après délai');
        }
    }, 100);
}

