/**
 * 🎵 WaveSurfer Web Component - Demo Simple
 * Test de la nouvelle architecture Web Component
 */


        // 1. WaveSurfer basique avec contrôles
        console.log('Création WaveSurfer 1...');
        const wavesurfer1 = new WaveSurferCompatible({
            attach: 'body',
            x: 50,
            y: 50,
            width: 600,
            height: 150,
            url: './assets/audios/riff.m4a',
            waveColor: '#4A90E2',
            progressColor: '#2ECC71',
            cursorColor: '#E74C3C',
            controls: {
                enabled: true,
                play: true,
                pause: true,
                stop: true,
                volume: true,
                mute: true
            },
            callbacks: {
                onReady: () => console.log('🎵 WaveSurfer 1 ready!'),
                onPlay: () => console.log('▶️ WaveSurfer 1 playing'),
                onPause: () => console.log('⏸️ WaveSurfer 1 paused'),
                onFinish: () => console.log('⏹️ WaveSurfer 1 finished')
            }
        });
        console.log('✅ WaveSurfer 1 créé:', wavesurfer1);

        // 2. WaveSurfer avec régions
        console.log('Création WaveSurfer 2 avec régions...');
        const wavesurfer2 = new WaveSurferCompatible({
            attach: 'body',
            x: 50,
            y: 230,
            width: 600,
            height: 150,
            url: './assets/audios/clap.wav',
            waveColor: '#9C27B0',
            progressColor: '#FF5722',
            cursorColor: '#FFC107',
            regions: {
                enabled: true,
                dragSelection: true
            },
            timeline: {
                enabled: true,
                height: 20
            },
            controls: {
                enabled: true,
                play: true,
                pause: true,
                stop: true
            },
            callbacks: {
                onReady: () => {
                    console.log('🎵 WaveSurfer 2 ready with regions!');
                    // Ajouter une région d'exemple
                    setTimeout(() => {
                        wavesurfer2.addRegion({
                            start: 0.5,
                            end: 2.0,
                            color: 'rgba(255, 193, 7, 0.3)',
                            content: 'Région 1'
                        });
                    }, 1000);
                },
                onRegionCreate: (region) => console.log('🎯 Région créée:', region),
                onPlay: () => console.log('▶️ WaveSurfer 2 playing'),
                onPause: () => console.log('⏸️ WaveSurfer 2 paused')
            }
        });
        console.log('✅ WaveSurfer 2 avec régions créé:', wavesurfer2);

        // 3. WaveSurfer compact sans contrôles
        console.log('Création WaveSurfer 3 compact...');
        const wavesurfer3 = new WaveSurferCompatible({
            attach: 'body',
            x: 50,
            y: 410,
            width: 300,
            height: 80,
            url: './assets/audios/kick.wav',
            waveColor: '#00BCD4',
            progressColor: '#4CAF50',
            controls: {
                enabled: false // Pas de contrôles pour un style minimaliste
            },
            callbacks: {
                onReady: () => console.log('🎵 WaveSurfer 3 compact ready!')
            }
        });
        console.log('✅ WaveSurfer 3 compact créé:', wavesurfer3);

        // 4. WaveSurfer avec plugins avancés
        console.log('Création WaveSurfer 4 avec plugins...');
        const wavesurfer4 = new WaveSurferCompatible({
            attach: 'body',
            x: 400,
            y: 410,
            width: 400,
            height: 120,
            url: './assets/audios/snare.wav',
            waveColor: '#673AB7',
            progressColor: '#FF9800',
            minimap: {
                enabled: true,
                height: 30
            },
            zoom: {
                enabled: true,
                scale: 1
            },
            hover: {
                enabled: true,
                formatTimeCallback: (seconds) => {
                    const mins = Math.floor(seconds / 60);
                    const secs = Math.floor(seconds % 60);
                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                }
            },
            controls: {
                enabled: true,
                play: true,
                pause: true
            },
            callbacks: {
                onReady: () => console.log('🎵 WaveSurfer 4 avec plugins ready!')
            }
        });
        console.log('✅ WaveSurfer 4 avec plugins créé:', wavesurfer4);

        console.log('✅ Tous les WaveSurfer Web Components créés (4/4) !');
        
        // Vérifier que tous les Web Components sont dans le DOM
        setTimeout(() => {
            const wavesurfers = document.querySelectorAll('squirrel-wavesurfer');
            console.log(`📊 ${wavesurfers.length} WaveSurfer Web Components trouvés dans le DOM`);
            wavesurfers.forEach((wavesurfer, index) => {
                console.log(`WaveSurfer ${index + 1}:`, wavesurfer, 'Visible:', wavesurfer.offsetParent !== null);
            });
        }, 100);
        
