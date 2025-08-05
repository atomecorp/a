// Test de diagnostic Squirrel - Passer onAction à la création
console.log('🎵 Test diagnostic Squirrel');

// Fonction pour créer la démo audio
function createAudioDemo() {
  console.log('🚀 Test: onClick passé à la création vs assigné après...');
  
  // Nettoyer le conteneur
  const view = document.getElementById('view');
  if (view) {
    view.innerHTML = '';
  }
  
  // Créer le titre
  const title = document.createElement('h1');
  title.textContent = '🎵 Test Diagnostic Squirrel Button';
  title.style.cssText = `
    font-size: 24px;
    font-weight: bold;
    color: #e74c3c;
    text-align: center;
    margin: 20px 0;
  `;
  view.appendChild(title);
  
  // Créer la description
  const description = document.createElement('p');
  description.textContent = 'Test: onClick lors de la création vs assigné après';
  description.style.cssText = `
    font-size: 16px;
    color: #ecf0f1;
    text-align: center;
    margin-bottom: 30px;
  `;
  view.appendChild(description);
  
  // Créer le conteneur des boutons
  const controlsContainer = document.createElement('div');
  controlsContainer.style.cssText = `
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 15px;
    margin-bottom: 30px;
    flex-wrap: wrap;
  `;
  view.appendChild(controlsContainer);
  
  // Créer le statut
  const status = document.createElement('div');
  status.id = 'status';
  status.textContent = '✅ Prêt - Testez les boutons !';
  status.style.cssText = `
    text-align: center;
    padding: 20px;
    background-color: #34495e;
    border-radius: 10px;
    color: #ecf0f1;
    margin: 20px auto;
    width: 80%;
    font-size: 16px;
  `;
  view.appendChild(status);
  
  // Vérifier que Button est disponible
  if (typeof Button === 'undefined') {
    status.textContent = '❌ Button component not available';
    return;
  }
  
  // TEST 1: Bouton avec onClick passé lors de la création (DEVRAIT MARCHER)
  const testBtn1 = Button({
    text: '✅ onClick à la création',
    parent: controlsContainer,
    onClick: () => {
      console.log('✅ SUCCESS: onClick passé à la création marche !');
      status.textContent = '✅ SUCCESS: onClick à la création fonctionne !';
      alert('✅ onClick passé à la création fonctionne !');
    },
    css: {
      padding: '15px 25px',
      backgroundColor: '#27ae60',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: 'bold',
      minWidth: '200px'
    }
  });
  
  // TEST 2: Bouton avec onClick assigné APRÈS (NE DEVRAIT PAS MARCHER)
  const testBtn2 = Button({
    text: '❌ onClick assigné après',
    parent: controlsContainer,
    css: {
      padding: '15px 25px',
      backgroundColor: '#e74c3c',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: 'bold',
      minWidth: '200px'
    }
  });
  
  // Assigner onClick APRÈS la création (problématique)
  testBtn2.onClick = () => {
    console.log('❌ FAIL: onClick assigné après ne marche PAS !');
    status.textContent = '❌ FAIL: onClick assigné après ne fonctionne pas !';
    alert('❌ Si vous voyez ça, notre diagnostic est faux !');
  };
  
  // TEST 3: Bouton avec onClick passé lors de la création (DEVRAIT MARCHER)
  const testBtn3 = Button({
    text: '🔵 onClick à la création',
    parent: controlsContainer,
    onClick: () => {
      console.log('🔵 onClick passé à la création marche !');
      status.textContent = '🔵 onClick à la création fonctionne !';
      alert('🔵 onClick passé à la création fonctionne !');
    },
    css: {
      padding: '15px 25px',
      backgroundColor: '#3498db',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: 'bold',
      minWidth: '200px'
    }
  });
  
  // TEST 4: Test audio avec onClick à la création
  const audioTestBtn = Button({
    text: '🎵 Test Audio Web API',
    parent: controlsContainer,
    onClick: async () => {
      console.log('🎵 Test audio avec Squirrel Button...');
      status.textContent = '🎵 Test audio Web API en cours...';
      
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 1);
        
        console.log('🎵 Audio Squirrel lancé !');
        status.textContent = '🎵 Audio Squirrel: Bip en cours...';
        
        setTimeout(() => {
          status.textContent = '✅ Test audio Squirrel réussi !';
          audioContext.close();
        }, 1100);
        
      } catch (error) {
        console.error('❌ Erreur audio Squirrel:', error);
        status.textContent = '❌ Erreur audio Squirrel: ' + error.message;
      }
    },
    css: {
      padding: '15px 25px',
      backgroundColor: '#9b59b6',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: 'bold',
      minWidth: '200px'
    }
  });
  
  // TEST 5: Tests avancés Tone.js
  const toneTestsContainer = document.createElement('div');
  toneTestsContainer.style.cssText = `
    margin-top: 30px;
    padding: 20px;
    background-color: #2c3e50;
    border-radius: 10px;
    width: 90%;
    margin-left: auto;
    margin-right: auto;
  `;
  view.appendChild(toneTestsContainer);
  
  const toneTitle = document.createElement('h2');
  toneTitle.textContent = '🎹 Tests Tone.js Avancés';
  toneTitle.style.cssText = `
    color: #f39c12;
    text-align: center;
    margin-bottom: 20px;
  `;
  toneTestsContainer.appendChild(toneTitle);
  
  const toneButtonsContainer = document.createElement('div');
  toneButtonsContainer.style.cssText = `
    display: flex;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  `;
  toneTestsContainer.appendChild(toneButtonsContainer);
  
  // Test 1: Son simple Tone.js
  const toneSimpleBtn = Button({
    text: '🔈 Note Simple',
    parent: toneButtonsContainer,
    onClick: async () => {
      console.log('🎹 Test Tone.js - Note simple...');
      status.textContent = '🎹 Tone.js: Note simple en cours...';
      
      try {
        // Vérifier si Tone est disponible
        if (typeof Tone === 'undefined') {
          throw new Error('Tone.js non disponible');
        }
        
        await Tone.start();
        console.log('✅ Tone.js démarré');
        
        // Créer un oscillateur simple
        const synth = new Tone.Oscillator(440, "sine").toDestination();
        synth.start();
        synth.stop("+1");
        
        status.textContent = '🎹 Note 440Hz jouée avec Tone.js !';
        
      } catch (error) {
        console.error('❌ Erreur Tone.js:', error);
        status.textContent = '❌ Erreur Tone.js: ' + error.message;
      }
    },
    css: {
      padding: '10px 15px',
      backgroundColor: '#e67e22',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '14px'
    }
  });
  
  // Test 2: Synthétiseur Tone.js
  const toneSynthBtn = Button({
    text: '🎹 Synthé',
    parent: toneButtonsContainer,
    onClick: async () => {
      console.log('🎹 Test Tone.js - Synthétiseur...');
      status.textContent = '🎹 Tone.js: Synthétiseur en cours...';
      
      try {
        await Tone.start();
        
        // Créer un synthétiseur
        const synth = new Tone.Synth().toDestination();
        
        // Jouer une mélodie
        const notes = ["C4", "E4", "G4", "B4"];
        let time = Tone.now();
        
        notes.forEach((note, i) => {
          synth.triggerAttackRelease(note, "8n", time + i * 0.3);
        });
        
        status.textContent = '🎹 Mélodie jouée avec Tone.js !';
        
      } catch (error) {
        console.error('❌ Erreur Synthé Tone.js:', error);
        status.textContent = '❌ Erreur Synthé: ' + error.message;
      }
    },
    css: {
      padding: '10px 15px',
      backgroundColor: '#8e44ad',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '14px'
    }
  });
  
  // Test 3: Effets Tone.js
  const toneEffectsBtn = Button({
    text: '✨ Effets',
    parent: toneButtonsContainer,
    onClick: async () => {
      console.log('🎹 Test Tone.js - Effets...');
      status.textContent = '🎹 Tone.js: Effets en cours...';
      
      try {
        await Tone.start();
        
        // Créer une chaîne d'effets
        const reverb = new Tone.Reverb(4).toDestination();
        const distortion = new Tone.Distortion(0.8).connect(reverb);
        const synth = new Tone.Synth().connect(distortion);
        
        // Jouer avec effets
        synth.triggerAttackRelease("A4", "2n");
        
        status.textContent = '🎹 Note avec effets (reverb + distortion) !';
        
      } catch (error) {
        console.error('❌ Erreur Effets Tone.js:', error);
        status.textContent = '❌ Erreur Effets: ' + error.message;
      }
    },
    css: {
      padding: '10px 15px',
      backgroundColor: '#16a085',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '14px'
    }
  });
  
  // Test 4: Séquenceur Tone.js
  let sequenceActive = false;
  let sequence = null;
  
  const toneSequenceBtn = Button({
    text: '🔄 Séquenceur',
    parent: toneButtonsContainer,
    onClick: async () => {
      console.log('🎹 Test Tone.js - Séquenceur...');
      
      try {
        await Tone.start();
        
        if (!sequenceActive) {
          // Démarrer le séquenceur
          const synth = new Tone.Synth().toDestination();
          
          sequence = new Tone.Sequence((time, note) => {
            synth.triggerAttackRelease(note, "16n", time);
          }, ["C4", "E4", "G4", "C5"], "8n").start(0);
          
          Tone.Transport.start();
          sequenceActive = true;
          toneSequenceBtn.text = '⏹️ Stop Séq';
          status.textContent = '🎹 Séquenceur démarré !';
          
        } else {
          // Arrêter le séquenceur
          Tone.Transport.stop();
          if (sequence) {
            sequence.dispose();
          }
          sequenceActive = false;
          toneSequenceBtn.text = '🔄 Séquenceur';
          status.textContent = '🎹 Séquenceur arrêté';
        }
        
      } catch (error) {
        console.error('❌ Erreur Séquenceur Tone.js:', error);
        status.textContent = '❌ Erreur Séquenceur: ' + error.message;
      }
    },
    css: {
      padding: '10px 15px',
      backgroundColor: '#c0392b',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '14px'
    }
  });
  
  // Test 5: Drum Machine
  const toneDrumBtn = Button({
    text: '🥁 Drums',
    parent: toneButtonsContainer,
    onClick: async () => {
      console.log('🎹 Test Tone.js - Drum Machine...');
      status.textContent = '🎹 Tone.js: Drum Machine...';
      
      try {
        await Tone.start();
        
        // Créer des sons de batterie
        const kick = new Tone.MembraneSynth().toDestination();
        const snare = new Tone.NoiseSynth().toDestination();
        const hihat = new Tone.MetalSynth().toDestination();
        
        // Pattern de batterie simple
        const now = Tone.now();
        
        // Kick (grosse caisse)
        kick.triggerAttackRelease("C2", "8n", now);
        kick.triggerAttackRelease("C2", "8n", now + 0.5);
        kick.triggerAttackRelease("C2", "8n", now + 1);
        
        // Snare (caisse claire)
        snare.triggerAttackRelease("16n", now + 0.25);
        snare.triggerAttackRelease("16n", now + 0.75);
        
        // Hi-hat
        hihat.triggerAttackRelease("32n", now + 0.125);
        hihat.triggerAttackRelease("32n", now + 0.375);
        hihat.triggerAttackRelease("32n", now + 0.625);
        hihat.triggerAttackRelease("32n", now + 0.875);
        
        status.textContent = '🥁 Pattern de batterie joué !';
        
      } catch (error) {
        console.error('❌ Erreur Drums Tone.js:', error);
        status.textContent = '❌ Erreur Drums: ' + error.message;
      }
    },
    css: {
      padding: '10px 15px',
      backgroundColor: '#2c3e50',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '14px'
    }
  });
  
  // Test 6: Sampler avec fichier audio
  let sampler = null;
  let samplerLoaded = false;
  
  const toneSamplerBtn = Button({
    text: '🎸 Sampler',
    parent: toneButtonsContainer,
    onClick: async () => {
      console.log('🎹 Test Tone.js - Sampler...');
      status.textContent = '🎹 Tone.js: Chargement sampler...';
      
      try {
        await Tone.start();
        
        if (!sampler) {
          // Créer le sampler avec le fichier riff.m4a
          console.log('🎸 Création du sampler avec riff.m4a...');
          
          sampler = new Tone.Sampler({
            urls: {
              "C4": "assets/audios/riff.m4a"
            },
            onload: () => {
              console.log('✅ Sampler chargé !');
              samplerLoaded = true;
              status.textContent = '🎸 Sampler chargé ! Cliquez encore pour jouer.';
              toneSamplerBtn.updateText('🎸 Jouer Riff');
            },
            onerror: (error) => {
              console.error('❌ Erreur chargement sampler:', error);
              status.textContent = '❌ Erreur chargement: ' + error;
            }
          }).toDestination();
          
          status.textContent = '🎸 Chargement du sampler en cours...';
          
        } else if (samplerLoaded) {
          // Jouer le sample
          console.log('🎸 Lecture du sample...');
          status.textContent = '🎸 Lecture du riff...';
          
          // Jouer le sample à différentes hauteurs
          const notes = ["C4", "D4", "E4", "F4"];
          let time = Tone.now();
          
          notes.forEach((note, i) => {
            sampler.triggerAttackRelease(note, "4n", time + i * 0.5);
          });
          
          status.textContent = '🎸 Riff joué à différentes hauteurs !';
          
        } else {
          status.textContent = '⏳ Sampler en cours de chargement...';
        }
        
      } catch (error) {
        console.error('❌ Erreur Sampler Tone.js:', error);
        status.textContent = '❌ Erreur Sampler: ' + error.message;
      }
    },
    css: {
      padding: '10px 15px',
      backgroundColor: '#d35400',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '14px'
    }
  });
  
  // Test 7: Sampler avancé avec patterns
  const toneSamplerPatternBtn = Button({
    text: '🎼 Pattern Riff',
    parent: toneButtonsContainer,
    onClick: async () => {
      console.log('🎹 Test Tone.js - Pattern Sampler...');
      status.textContent = '🎹 Tone.js: Pattern de riff...';
      
      try {
        await Tone.start();
        
        if (!sampler || !samplerLoaded) {
          status.textContent = '⚠️ Chargez d\'abord le sampler !';
          return;
        }
        
        // Créer un pattern rythmique avec le riff
        const pattern = new Tone.Pattern((time, note) => {
          sampler.triggerAttackRelease(note, "8n", time);
          console.log('🎸 Note jouée:', note, 'à', time);
        }, ["C4", "C4", "E4", "C4", "G4", "C4"], "up");
        
        pattern.start(0);
        Tone.Transport.bpm.value = 120;
        Tone.Transport.start();
        
        status.textContent = '🎼 Pattern de riff démarré !';
        
        // Arrêter après 8 secondes
        setTimeout(() => {
          Tone.Transport.stop();
          pattern.dispose();
          status.textContent = '🎼 Pattern de riff terminé';
        }, 8000);
        
      } catch (error) {
        console.error('❌ Erreur Pattern Sampler:', error);
        status.textContent = '❌ Erreur Pattern: ' + error.message;
      }
    },
    css: {
      padding: '10px 15px',
      backgroundColor: '#8e44ad',
      color: 'white',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '14px'
    }
  });
  
  console.log('✅ Test buttons créés:');
  console.log('- testBtn1 (onClick création):', testBtn1);
  console.log('- testBtn2 (onClick après):', testBtn2);
  console.log('- testBtn3 (onClick création):', testBtn3);
  console.log('- audioTestBtn (audio test):', audioTestBtn);
  console.log('- Tone.js tests:', { toneSimpleBtn, toneSynthBtn, toneEffectsBtn, toneSequenceBtn, toneDrumBtn, toneSamplerBtn, toneSamplerPatternBtn });
  
  // === TEST DE VÉRIFICATION DE LA CORRECTION ===
  console.log('🔧 TEST: Vérification des propriétés dynamiques...');
  
  // Test 1: Vérifier que onClick est accessible
  console.log('testBtn2.onClick défini ?', typeof testBtn2.onClick);
  
  // Test 2: Tester la modification dynamique
  setTimeout(() => {
    console.log('🔄 Test de modification dynamique du handler...');
    const originalHandler = testBtn2.onClick;
    
    testBtn2.onClick = () => {
      console.log('🎉 SUCCÈS ! Le handler dynamique fonctionne !');
      status.textContent = '🎉 CORRECTION RÉUSSIE ! onClick dynamique fonctionne !';
      alert('🎉 CORRECTION RÉUSSIE ! Handler dynamique fonctionne !');
    };
    
    console.log('Handler modifié avec succès. Testez le bouton rouge !');
    
    // Changer le texte du bouton pour indiquer qu'il est modifié
    testBtn2.updateText('✅ Handler modifié !');
    testBtn2.$({ css: { backgroundColor: '#f39c12' } }); // Orange pour indiquer le changement
  }, 1000);
}

// Lancer le test de diagnostic
console.log('🚀 Lancement du test diagnostic Squirrel...');
createAudioDemo();
