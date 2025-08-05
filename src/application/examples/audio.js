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
    text: '🎵 Test Audio Squirrel',
    parent: controlsContainer,
    onClick: async () => {
      console.log('🎵 Test audio avec Squirrel Button...');
      status.textContent = '🎵 Test audio Squirrel en cours...';
      
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
  
  console.log('✅ Test buttons créés:');
  console.log('- testBtn1 (onClick création):', testBtn1);
  console.log('- testBtn2 (onClick après):', testBtn2);
  console.log('- testBtn3 (onClick création):', testBtn3);
  console.log('- audioTestBtn (audio test):', audioTestBtn);
  
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
