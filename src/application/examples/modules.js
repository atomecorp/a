/**
 * Exemple minimaliste du Module Builder
 */

// === EXEMPLE SIMPLE ===
// Créer un module basique en une ligne
const simpleModule = $.module({
  id: 'mon-module',
  title: 'Mon Premier Module',
  position: { x: 50, y: 50 },
  inputs: [{ label: 'Input' }],
  outputs: [{ label: 'Output' }],
  callbacks: {
    onRename: (id, newName, oldName) => {
      console.log(`Module ${id} renommé: "${oldName}" → "${newName}"`);
    },
    onSelect: (id) => {
      console.log(`Module ${id} sélectionné`);
    },
    onDeselect: (id) => {
      console.log(`Module ${id} désélectionné`);
    }
  }
});

// === EXEMPLE AVEC CONTENU ===
// Module avec contenu personnalisé
const moduleAvecContenu = $.module({
  id: 'module-slider',
  title: 'Volume Control',
  position: { x: 300, y: 50 },
  inputs: [{ label: 'Audio In', color: '#FF5722' }],
  outputs: [{ label: 'Audio Out', color: '#FF5722' }],
  content: () => {
    const slider = $('input', {
      type: 'range',
      min: '0',
      max: '100',
      value: '50',
      css: { width: '100%' }
    });
    
    const label = $('div', {
      text: 'Volume: 50%',
      css: { textAlign: 'center', fontSize: '12px' }
    });
    
    slider.addEventListener('input', (e) => {
      label.textContent = `Volume: ${e.target.value}%`;
    });
    
    const container = $('div', { css: { padding: '10px' } });
    container.appendChild(label);
    container.appendChild(slider);
    return container;
  }
});

// === EXEMPLE AVEC TEMPLATE ===
// Utiliser un template prédéfini
const moduleTemplate = $.module({
  ...$.moduleTemplates.audioControl,
  id: 'audio-template',
  title: 'Audio Template',
  position: { x: 50, y: 250 }
});

// === INTERACTIONS DISPONIBLES ===
// CONNEXIONS :
// 1. DRAG & DROP : Maintenez enfoncé sur un connecteur et glissez vers un autre
// 2. CLIC SIMPLE : Cliquez sur un connecteur, puis sur un autre pour les connecter
//                  Si déjà connectés, cela les déconnecte !
//                  (recliquez sur le même pour annuler la sélection)
//
// RENOMMAGE :
// - Double-cliquez sur le titre d'un module pour le renommer
// - Entrée pour valider, Échap pour annuler
// - Le drag est désactivé pendant l'édition
//
// SÉLECTION :
// - Clic simple sur un module pour le sélectionner (désélectionne les autres)
// - Double-clic sur le contenu d'un module pour désélectionner tout
// - Module(s) sélectionné(s) = contour bleu et légère mise à l'échelle
// - Utilisez le bouton "Déconnecter modules sélectionnés" pour supprimer toutes leurs connexions

console.log('Modules créés:', { simpleModule, moduleAvecContenu, moduleTemplate });

// ========================================
// EXEMPLES D'API PROGRAMMATIQUE
// ========================================

// Ajouter des boutons pour tester l'API programmatique
const controlsContainer = $('div', {
  css: {
    position: 'fixed',
    top: '10px',
    right: '10px',
    backgroundColor: '#f0f0f0',
    padding: '15px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    zIndex: '2000',
    fontFamily: 'Arial, sans-serif',
    maxWidth: '250px'
  }
});

const title = $('h4', {
  text: 'API Programmatique',
  css: { margin: '0 0 10px 0', fontSize: '14px', color: '#333' }
});
controlsContainer.appendChild(title);

// Bouton pour créer une connexion programmatiquement
const btnCreateConnection = $('button', {
  text: 'Créer connexion simple→contenu',
  css: {
    display: 'block',
    width: '220px',
    margin: '5px 0',
    padding: '5px 8px',
    fontSize: '11px',
    cursor: 'pointer',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '3px'
  }
});
btnCreateConnection.addEventListener('click', () => {
  const created = window.moduleBuilderInstance.createConnection('mon-module', '0', 'module-slider', '0');
  console.log(created ? '✅ Connexion créée !' : '❌ Échec de la création (voir console)');
});
controlsContainer.appendChild(btnCreateConnection);

// Bouton pour supprimer une connexion spécifique
const btnRemoveConnection = $('button', {
  text: 'Supprimer connexion mon-module→module-slider',
  css: {
    display: 'block',
    width: '220px',
    margin: '5px 0',
    padding: '5px 8px',
    fontSize: '11px',
    cursor: 'pointer'
  }
});
btnRemoveConnection.addEventListener('click', () => {
  const removed = window.moduleBuilderInstance.removeConnection('mon-module', '0', 'module-slider', '0');
  console.log(removed ? '✅ Connexion supprimée !' : '⚠️ Connexion non trouvée');
});
controlsContainer.appendChild(btnRemoveConnection);

// Bouton pour déconnecter un module
const btnDisconnectModule = $('button', {
  text: 'Déconnecter module "mon-module"',
  css: {
    display: 'block',
    width: '220px',
    margin: '5px 0',
    padding: '5px 8px',
    fontSize: '11px',
    cursor: 'pointer'
  }
});
btnDisconnectModule.addEventListener('click', () => {
  const count = window.moduleBuilderInstance.disconnectModule('mon-module');
  console.log(`🔌 Module "mon-module" déconnecté: ${count} connexion(s) supprimée(s)`);
});
controlsContainer.appendChild(btnDisconnectModule);

// Bouton pour supprimer un module
const btnRemoveModule = $('button', {
  text: 'Supprimer module "template"',
  css: {
    display: 'block',
    width: '220px',
    margin: '5px 0',
    padding: '5px 8px',
    fontSize: '11px',
    cursor: 'pointer',
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '3px'
  }
});
btnRemoveModule.addEventListener('click', () => {
  window.moduleBuilderInstance.removeModule('audio-template');
  console.log('🗑️ Module "audio-template" supprimé !');
});
controlsContainer.appendChild(btnRemoveModule);

// Bouton pour vérifier les connexions
const btnCheckConnection = $('button', {
  text: 'Vérifier connexion mon-module→module-slider',
  css: {
    display: 'block',
    width: '220px',
    margin: '5px 0',
    padding: '5px 8px',
    fontSize: '11px',
    cursor: 'pointer'
  }
});
btnCheckConnection.addEventListener('click', () => {
  const connected = window.moduleBuilderInstance.areConnectorsConnected('mon-module', '0', 'module-slider', '0');
  console.log(connected ? '✅ Connecteurs connectés !' : '❌ Pas de connexion');
});
controlsContainer.appendChild(btnCheckConnection);

// Bouton pour info sur les connexions
const btnInfo = $('button', {
  text: 'Info connexions & modules',
  css: {
    display: 'block',
    width: '220px',
    margin: '5px 0',
    padding: '5px 8px',
    fontSize: '11px',
    cursor: 'pointer',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '3px'
  }
});
btnInfo.addEventListener('click', () => {
  const totalConnections = window.moduleBuilderInstance.getConnectionCount();
  const moduleConnections = window.moduleBuilderInstance.getModuleConnections('mon-module');
  const modules = window.moduleBuilderInstance.getModuleIds();
  
  console.log('=== INFO CONNEXIONS & MODULES ===');
  console.log('Total connexions:', totalConnections);
  console.log('Modules existants:', modules);
  console.log('Connexions module "mon-module":', moduleConnections);
  console.log('Module "mon-module" existe:', window.moduleBuilderInstance.moduleExists('mon-module'));
  console.log('Connecteur "mon-module_output_0" existe:', window.moduleBuilderInstance.connectorExists('mon-module', '0'));
  
  console.log(`📊 Résumé: ${totalConnections} connexions | Modules: ${modules.join(', ')}`);
});
controlsContainer.appendChild(btnInfo);

// Ajouter un séparateur
const separator = $('hr', {
  css: { margin: '10px 0', border: 'none', borderTop: '1px solid #ccc' }
});
controlsContainer.appendChild(separator);

// Bouton pour tester les callbacks
const btnTestCallbacks = $('button', {
  text: 'Activer logs connexions',
  css: {
    display: 'block',
    width: '220px',
    margin: '5px 0',
    padding: '5px 8px',
    fontSize: '11px',
    cursor: 'pointer',
    backgroundColor: '#FF9800',
    color: 'white',
    border: 'none',
    borderRadius: '3px'
  }
});

let callbacksActive = false;
btnTestCallbacks.addEventListener('click', () => {
  if (!callbacksActive) {
    // Ajouter des callbacks de test
    window.moduleBuilderInstance.onConnect((connection) => {
      console.log('🔗 Connexion créée:', connection);
    });
    
    window.moduleBuilderInstance.onDisconnect((connection) => {
      console.log('❌ Connexion supprimée:', connection);
    });
    
    window.moduleBuilderInstance.onConnectionAttempt((data) => {
      console.log('🔄 Tentative de connexion:', data);
    });
    
    btnTestCallbacks.textContent = 'Logs activés ✓';
    btnTestCallbacks.style.backgroundColor = '#4CAF50';
    callbacksActive = true;
    
    console.log('🔊 Callbacks activés ! Vous verrez maintenant les logs d\'événements.');
  } else {
    console.log('ℹ️ Les callbacks sont déjà actifs !');
  }
});
controlsContainer.appendChild(btnTestCallbacks);

// Bouton pour déconnecter le module sélectionné
const btnDisconnectSelected = $('button', {
  text: 'Déconnecter modules sélectionnés',
  css: {
    display: 'block',
    width: '220px',
    margin: '5px 0',
    padding: '5px 8px',
    fontSize: '11px',
    cursor: 'pointer',
    backgroundColor: '#FF9800',
    color: 'white',
    border: 'none',
    borderRadius: '3px'
  }
});
btnDisconnectSelected.addEventListener('click', () => {
  const result = window.moduleBuilderInstance.disconnectSelectedModules();
  if (result.count > 0) {
    console.log(`🔌 Modules déconnectés:`, result.moduleIds);
    console.log(`📊 Total: ${result.count} connexion(s) supprimée(s)`);
    result.modules.forEach(module => {
      console.log(`  - "${module.id}": ${module.connectionsRemoved} connexion(s)`);
    });
  } else {
    console.log('⚠️ Aucun module sélectionné ou aucune connexion à supprimer');
    console.log('💡 Cliquez sur un ou plusieurs modules pour les sélectionner');
  }
});
controlsContainer.appendChild(btnDisconnectSelected);

document.body.appendChild(controlsContainer);

// ========================================
// Interface complète (optionnelle)
// ========================================