/**
 * Exemple du Unit Builder (anciennement Module Builder)
 */

// === EXEMPLE SIMPLE ===
// Créer un unit basique en une ligne
const simpleUnit = $.unit({
  id: 'mon-unit',
  title: 'Mon Premier Unit',
  position: { x: 50, y: 50 },
  inputs: [{ label: 'Input' }],
  outputs: [{ label: 'Output' }],
  callbacks: {
    onRename: (id, newName, oldName) => {
      console.log(`Unit ${id} renommé: "${oldName}" → "${newName}"`);
    },
    onSelect: (id) => {
      console.log(`Unit ${id} sélectionné`);
    },
    onDeselect: (id) => {
      console.log(`Unit ${id} désélectionné`);
    }
  }
});

// === EXEMPLE AVEC CONTENU ===
// Unit avec contenu personnalisé
const unitAvecContenu = $.unit({
  id: 'unit-slider',
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
const unitTemplate = $.unit({
  ...$.unitTemplates.audioControl,
  id: 'audio-template',
  title: 'Audio Template',
  position: { x: 50, y: 250 }
});

// === EXEMPLE AVEC ICÔNE SVG ===
// Unit avec icône SVG centré et texte en dessous
const unitAvecIcone = $.unit({
  id: 'unit-icone',
  title: 'Audio Processor',
  position: { x: 550, y: 50 },
  inputs: [{ label: 'Input', color: '#4CAF50' }],
  outputs: [{ label: 'Output', color: '#2196F3' }],
  content: () => {
    // Créer le conteneur principal
    const container = $('div', {
      css: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '15px',
        height: '100%'
      }
    });
    
    // Créer l'icône SVG avec la méthode native
    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('width', '40');
    iconSvg.setAttribute('height', '40');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'none');
    iconSvg.setAttribute('stroke', '#2196F3');
    iconSvg.setAttribute('stroke-width', '2');
    iconSvg.style.marginBottom = '8px';
    
    // Ajouter le chemin de l'icône (exemple: icône de validation)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm9 12 2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z');
    iconSvg.appendChild(path);
    
    // Créer le texte en dessous
    const label = $('div', {
      text: 'Processing',
      css: {
        fontSize: '11px',
        color: '#666',
        textAlign: 'center',
        fontWeight: '500'
      }
    });
    
    // Assembler le contenu
    container.appendChild(iconSvg);
    container.appendChild(label);
    
    return container;
  }
});

// === EXEMPLE AVEC ICÔNE PLUS COMPLEXE ===
// Unit avec icône SVG personnalisé et interaction
const unitIconeAvance = $.unit({
  id: 'unit-synth',
  title: 'Synthesizer',
  position: { x: 550, y: 250 },
  size: { width: 180, height: 140 },
  inputs: [
    { label: 'Freq', color: '#FF9800' },
    { label: 'Amp', color: '#E91E63' }
  ],
  outputs: [{ label: 'Audio', color: '#FF5722' }],
  content: () => {
    const container = $('div', {
      css: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px',
        height: '100%'
      }
    });
    
    // Icône SVG de synthétiseur (méthode native)
    const synthIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    synthIcon.setAttribute('width', '50');
    synthIcon.setAttribute('height', '50');
    synthIcon.setAttribute('viewBox', '0 0 100 100');
    synthIcon.style.marginBottom = '10px';
    synthIcon.style.cursor = 'pointer';
    synthIcon.style.transition = 'transform 0.2s';
    synthIcon.innerHTML = `
      <rect x="20" y="30" width="60" height="40" fill="none" stroke="#4CAF50" stroke-width="2" rx="5"/>
      <circle cx="35" cy="45" r="6" fill="#4CAF50"/>
      <circle cx="50" cy="45" r="6" fill="#2196F3"/>
      <circle cx="65" cy="45" r="6" fill="#FF5722"/>
      <rect x="30" y="55" width="4" height="10" fill="#666"/>
      <rect x="45" y="55" width="4" height="10" fill="#666"/>
      <rect x="60" y="55" width="4" height="10" fill="#666"/>
    `;
    
    // Animation au survol
    synthIcon.addEventListener('mouseenter', () => {
      synthIcon.style.transform = 'scale(1.1)';
    });
    synthIcon.addEventListener('mouseleave', () => {
      synthIcon.style.transform = 'scale(1)';
    });
    
    // Texte descriptif
    const description = $('div', {
      text: 'Wave Generator',
      css: {
        fontSize: '11px',
        color: '#666',
        textAlign: 'center',
        fontWeight: '500'
      }
    });
    
    // Indicateur de statut
    const statusDot = $('div', {
      css: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: '#4CAF50',
        marginTop: '5px',
        boxShadow: '0 0 6px rgba(76, 175, 80, 0.6)'
      }
    });
    
    container.appendChild(synthIcon);
    container.appendChild(description);
    container.appendChild(statusDot);
    
    return container;
  }
});

// === EXEMPLE AVEC ICÔNE DEPUIS LE DISQUE ===
// Unit avec icône SVG chargée depuis un fichier
const unitAvecIconeDuDisque = $.unit({
  id: 'unit-fichier-svg',
  title: 'File Icon',
  position: { x: 800, y: 50 },
  inputs: [{ label: 'Input', color: '#9C27B0' }],
  outputs: [{ label: 'Output', color: '#FF9800' }],
  content: () => {
    const container = $('div', {
      css: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '15px',
        height: '100%'
      }
    });
    
    // Méthode 1: Utiliser une balise img avec un fichier SVG
    const iconImg = $('img', {
      src: 'assets/images/atome.svg', // Chemin relatif depuis la racine servie
      css: {
        width: '40px',
        height: '40px',
        marginBottom: '8px'
      }
    });
    
    const label = $('div', {
      text: 'From File',
      css: {
        fontSize: '11px',
        color: '#666',
        textAlign: 'center',
        fontWeight: '500'
      }
    });
    
    container.appendChild(iconImg);
    container.appendChild(label);
    return container;
  }
});

// === EXEMPLE AVEC ICÔNE PNG/JPG ===
// Unit avec icône bitmap depuis le disque
const unitAvecIconePng = $.unit({
  id: 'unit-fichier-png',
  title: 'PNG Icon',
  position: { x: 800, y: 250 },
  inputs: [{ label: 'Input', color: '#795548' }],
  outputs: [{ label: 'Output', color: '#607D8B' }],
  content: () => {
    const container = $('div', {
      css: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '15px',
        height: '100%'
      }
    });
    
    // Icône PNG/JPG avec gestion d'erreur
    const iconImg = $('img', {
      src: 'assets/images/green_planet.png',
      css: {
        width: '45px',
        height: '45px',
        marginBottom: '8px',
        borderRadius: '8px',
        objectFit: 'cover'
      }
    });
    
    // Gestion d'erreur si l'image n'existe pas
    iconImg.addEventListener('error', () => {
      iconImg.style.display = 'none';
      fallbackText.style.display = 'block';
    });
    
    const label = $('div', {
      text: 'Planet Icon',
      css: {
        fontSize: '11px',
        color: '#666',
        textAlign: 'center',
        fontWeight: '500'
      }
    });
    
    // Texte de fallback si l'image ne charge pas
    const fallbackText = $('div', {
      text: '🖼️',
      css: {
        fontSize: '30px',
        marginBottom: '8px',
        display: 'none'
      }
    });
    
    container.appendChild(fallbackText);
    container.appendChild(iconImg);
    container.appendChild(label);
    return container;
  }
});

// === EXEMPLE AVEC SVG CHARGÉ DYNAMIQUEMENT ===
// Unit qui charge et affiche un SVG depuis le disque
const unitAvecSvgCharge = $.unit({
  id: 'unit-svg-dynamique',
  title: 'Dynamic SVG',
  position: { x: 1000, y: 50 },
  inputs: [{ label: 'Input', color: '#3F51B5' }],
  outputs: [{ label: 'Output', color: '#F44336' }],
  content: () => {
    const container = $('div', {
      css: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '15px',
        height: '100%'
      }
    });
    
    // Conteneur pour le SVG
    const svgContainer = $('div', {
      css: {
        width: '40px',
        height: '40px',
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    });
    
    // Charger le SVG depuis le fichier
    fetch('assets/images/atome.svg')
      .then(response => response.text())
      .then(svgText => {
        svgContainer.innerHTML = svgText;
        // Optionnel: modifier les styles du SVG chargé
        const svg = svgContainer.querySelector('svg');
        if (svg) {
          svg.style.width = '100%';
          svg.style.height = '100%';
          svg.style.fill = '#4CAF50'; // Changer la couleur
        }
      })
      .catch(error => {
        console.log('Erreur chargement SVG:', error);
        svgContainer.innerHTML = '⚡'; // Fallback emoji
        svgContainer.style.fontSize = '30px';
      });
    
    const label = $('div', {
      text: 'Loaded SVG',
      css: {
        fontSize: '11px',
        color: '#666',
        textAlign: 'center',
        fontWeight: '500'
      }
    });
    
    container.appendChild(svgContainer);
    container.appendChild(label);
    return container;
  }
});

// === SOLUTION SAFARI: ICÔNES INLINE ===
// Unit avec SVG inline (compatible Safari)
const unitSafariCompatible = $.unit({
  id: 'unit-safari-svg',
  title: 'Safari Compatible',
  position: { x: 1200, y: 50 },
  inputs: [{ label: 'Input', color: '#FF6B6B' }],
  outputs: [{ label: 'Output', color: '#4ECDC4' }],
  content: () => {
    const container = $('div', {
      css: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '15px',
        height: '100%'
      }
    });
    
    // SVG inline directement dans le code (fonctionne partout)
    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('width', '40');
    iconSvg.setAttribute('height', '40');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.style.marginBottom = '8px';
    
    // Icône d'atome (similaire à atome.svg)
    iconSvg.innerHTML = `
      <circle cx="12" cy="12" r="2" fill="#4CAF50"/>
      <path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z" 
            fill="none" stroke="#4CAF50" stroke-width="2"/>
      <ellipse cx="12" cy="12" rx="8" ry="3" 
               fill="none" stroke="#2196F3" stroke-width="1.5" 
               transform="rotate(45 12 12)"/>
      <ellipse cx="12" cy="12" rx="8" ry="3" 
               fill="none" stroke="#FF5722" stroke-width="1.5" 
               transform="rotate(-45 12 12)"/>
    `;
    
    const label = $('div', {
      text: 'Inline SVG',
      css: {
        fontSize: '11px',
        color: '#666',
        textAlign: 'center',
        fontWeight: '500'
      }
    });
    
    container.appendChild(iconSvg);
    container.appendChild(label);
    return container;
  }
});

// === SOLUTION SAFARI: BASE64 EMBEDDED ===
// Unit avec image encodée en base64 (compatible Safari)
const unitBase64 = $.unit({
  id: 'unit-base64',
  title: 'Base64 Icon',
  position: { x: 1200, y: 250 },
  inputs: [{ label: 'Input', color: '#9B59B6' }],
  outputs: [{ label: 'Output', color: '#E67E22' }],
  content: () => {
    const container = $('div', {
      css: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '15px',
        height: '100%'
      }
    });
    
    // Approche simplifiée : utiliser directement l'encodage URL (plus fiable que base64)
    const svgString = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="#4CAF50" stroke="#2E7D32" stroke-width="2"/><circle cx="20" cy="20" r="8" fill="#81C784"/><circle cx="20" cy="20" r="3" fill="white"/></svg>';
    
    // Utiliser directement l'encodage URL au lieu de base64 (plus compatible)
    const encodedIcon = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
    
    console.log('🔍 Debug unit base64:', {
      svgLength: svgString.length,
      encodedLength: encodedIcon.length,
      encodedStart: encodedIcon.substring(0, 50) + '...'
    });
    
    const iconImg = $('img', {
      src: encodedIcon,
      css: {
        width: '40px',
        height: '40px',
        marginBottom: '8px'
      }
    });
    
    // Gestion d'erreur simple
    iconImg.addEventListener('error', () => {
      console.log('Erreur chargement image encodée, basculement vers emoji');
      iconImg.style.display = 'none';
      fallbackIcon.style.display = 'block';
      label.textContent = 'Encoded SVG (Fallback)';
    });
    
    iconImg.addEventListener('load', () => {
      console.log('✅ Image encodée chargée avec succès');
    });
    
    // Icône de fallback (emoji)
    const fallbackIcon = $('div', {
      text: '🎵',
      css: {
        fontSize: '35px',
        marginBottom: '5px',
        display: 'none',
        lineHeight: '1'
      }
    });
    
    const label = $('div', {
      text: 'Encoded SVG',
      css: {
        fontSize: '11px',
        color: '#666',
        textAlign: 'center',
        fontWeight: '500'
      }
    });
    
    container.appendChild(fallbackIcon);
    container.appendChild(iconImg);
    container.appendChild(label);
    return container;
  }
});

// === TEST SIMPLE: BASE64 MINIMAL ===
// Unit avec vraie image base64 ultra-simple pour test
const unitBase64Test = $.unit({
  id: 'unit-base64-test',
  title: 'Base64 Test',
  position: { x: 1200, y: 450 },
  inputs: [{ label: 'Input', color: '#FF4081' }],
  outputs: [{ label: 'Output', color: '#536DFE' }],
  content: () => {
    const container = $('div', {
      css: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '15px',
        height: '100%'
      }
    });
    
    // Image base64 ultra-simple : un carré rouge de 20x20 pixels
    const simpleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    const iconImg = $('img', {
      src: simpleBase64,
      css: {
        width: '40px',
        height: '40px',
        marginBottom: '8px',
        backgroundColor: '#ff0000',
        border: '2px solid #333'
      }
    });
    
    iconImg.addEventListener('error', () => {
      console.log('❌ Erreur chargement base64 simple');
    });
    
    iconImg.addEventListener('load', () => {
      console.log('✅ Base64 simple chargé');
    });
    
    const label = $('div', {
      text: 'Base64 PNG',
      css: {
        fontSize: '11px',
        color: '#666',
        textAlign: 'center',
        fontWeight: '500'
      }
    });
    
    container.appendChild(iconImg);
    container.appendChild(label);
    return container;
  }
});

// === SOLUTION SAFARI: FONT ICONS ===
// Unit avec icônes de font/emoji (toujours compatible)
const unitFontIcon = $.unit({
  id: 'unit-font-icon',
  title: 'Font Icons',
  position: { x: 1400, y: 50 },
  inputs: [{ label: 'Input', color: '#1ABC9C' }],
  outputs: [{ label: 'Output', color: '#E74C3C' }],
  content: () => {
    const container = $('div', {
      css: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '15px',
        height: '100%'
      }
    });
    
    // Utiliser des emojis ou symboles Unicode
    const iconText = $('div', {
      text: '⚡', // Ou d'autres: 🎵 🔊 📡 ⚙️ 🎛️ 🔧 💾 📊
      css: {
        fontSize: '35px',
        marginBottom: '5px',
        lineHeight: '1'
      }
    });
    
    const label = $('div', {
      text: 'Emoji Icon',
      css: {
        fontSize: '11px',
        color: '#666',
        textAlign: 'center',
        fontWeight: '500'
      }
    });
    
    container.appendChild(iconText);
    container.appendChild(label);
    return container;
  }
});

// === INTERACTIONS DISPONIBLES ===
// CONNEXIONS :
// 1. DRAG & DROP : Maintenez enfoncé sur un connecteur et glissez vers un autre
// 2. CLIC SIMPLE : Cliquez sur un connecteur, puis sur un autre pour les connecter
//                  Si déjà connectés, cela les déconnecte !
//                  (recliquez sur le même pour annuler la sélection)
//
// RENOMMAGE :
// - Double-cliquez sur le titre d.un unit pour le renommer
// - Entrée pour valider, Échap pour annuler
// - Le drag est désactivé pendant l'édition
//
// SÉLECTION :
// - Clic simple sur un unit pour le sélectionner (désélectionne les autres)
// - Double-clic sur le contenu d.un unit pour désélectionner tout
// - Unit(s) sélectionné(s) = contour bleu et légère mise à l'échelle
// - Utilisez le bouton "Déconnecter units sélectionnés" pour supprimer toutes leurs connexions
//
// API PROGRAMMATIVE :
// - Consultez le panneau "🎛️ API Tests" en haut à droite de l'écran
// - Testez toutes les fonctions d'API avec feedback console en temps réel

console.log('Units créés:', { simpleUnit, unitAvecContenu, unitTemplate, unitAvecIcone, unitIconeAvance, unitAvecIconeDuDisque, unitAvecIconePng, unitAvecSvgCharge, unitSafariCompatible, unitBase64, unitBase64Test, unitFontIcon });

// Ajout d'un indicateur de statut pour le unit builder
console.log('🎛️ Unit Builder initialized');
console.log('📊 Status: Ready | Units: 12 | API Panel: Visible (top-right)');
console.log('💡 Interact with units using drag&drop, click, or double-click for renaming');
console.log('🔗 Use API panel buttons to test programmatic functions');
console.log('📝 All actions are logged to this console for debugging');

// ========================================
// EXEMPLES D'API PROGRAMMATIQUE
// ========================================

// Ajouter des boutons pour tester l'API programmatique
const controlsContainer = $('div', {
  css: {
    position: 'fixed',
    top: '10px',
    right: '10px',
    backgroundColor: 'rgba(240, 240, 240, 0.98)',
    padding: '15px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: '99999',
    fontFamily: 'Arial, sans-serif',
    maxWidth: '280px',
    border: '2px solid #4CAF50',
    maxHeight: '80vh',
    overflowY: 'auto',
    display: 'block',
    visibility: 'visible'
  }
});

// Bouton pour masquer/afficher le panneau
const toggleBtn = $('button', {
  text: '−',
  css: {
    position: 'absolute',
    top: '5px',
    right: '5px',
    width: '20px',
    height: '20px',
    padding: '0',
    fontSize: '16px',
    lineHeight: '1',
    cursor: 'pointer',
    backgroundColor: '#999',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    textAlign: 'center'
  }
});

let panelMinimized = false;
let originalContent = null;

toggleBtn.addEventListener('click', () => {
  if (!panelMinimized) {
    // Minimiser le panneau
    originalContent = controlsContainer.innerHTML;
    controlsContainer.innerHTML = '';
    const restoreBtn = $('button', {
      text: '🎛️ Tests API',
      css: {
        padding: '8px 12px',
        fontSize: '12px',
        cursor: 'pointer',
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '4px'
      }
    });
    restoreBtn.addEventListener('click', () => {
      controlsContainer.innerHTML = originalContent;
      panelMinimized = false;
      // Re-attacher les événements
      setupPanelEvents();
    });
    controlsContainer.appendChild(restoreBtn);
    controlsContainer.style.maxWidth = 'auto';
    controlsContainer.style.padding = '8px';
    panelMinimized = true;
  }
});

function setupPanelEvents() {
  // Cette fonction sera appelée après restauration du panneau
  // pour re-attacher tous les événements
}

const title = $('h4', {
  text: '🎛️ API Tests',
  css: { 
    margin: '0 0 12px 0', 
    fontSize: '16px', 
    color: '#333',
    textAlign: 'center',
    borderBottom: '2px solid #4CAF50',
    paddingBottom: '5px'
  }
});
controlsContainer.appendChild(toggleBtn);
controlsContainer.appendChild(title);

// Bouton pour créer une connexion programmatiquement
const btnCreateConnection = $('button', {
  text: '🔗 Créer connexion simple→contenu',
  css: {
    display: 'block',
    width: '240px',
    margin: '5px 0',
    padding: '8px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  }
});
btnCreateConnection.addEventListener('click', () => {
  const created = window.unitBuilderInstance.createConnection('mon-unit', '0', 'unit-slider', '0');
  console.log(created ? '✅ Connexion créée !' : '❌ Échec de la création (voir console)');
});

// Ajout d'effets hover
btnCreateConnection.addEventListener('mouseenter', () => {
  btnCreateConnection.style.backgroundColor = '#45a049';
});
btnCreateConnection.addEventListener('mouseleave', () => {
  btnCreateConnection.style.backgroundColor = '#4CAF50';
});

controlsContainer.appendChild(btnCreateConnection);

// Bouton pour supprimer une connexion spécifique
const btnRemoveConnection = $('button', {
  text: '❌ Supprimer connexion mon-unit→unit-slider',
  css: {
    display: 'block',
    width: '240px',
    margin: '5px 0',
    padding: '8px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    backgroundColor: '#FF5722',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  }
});
btnRemoveConnection.addEventListener('click', () => {
  const removed = window.unitBuilderInstance.removeConnection('mon-unit', '0', 'unit-slider', '0');
  console.log(removed ? '✅ Connexion supprimée !' : '⚠️ Connexion non trouvée');
});
controlsContainer.appendChild(btnRemoveConnection);

// Bouton pour déconnecter un unit
const btnDisconnectUnit = $('button', {
  text: '🔌 Déconnecter unit "mon-unit"',
  css: {
    display: 'block',
    width: '240px',
    margin: '5px 0',
    padding: '8px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    backgroundColor: '#FF9800',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  }
});
btnDisconnectUnit.addEventListener('click', () => {
  const count = window.unitBuilderInstance.disconnectModule('mon-unit');
  console.log(`🔌 Unit "mon-unit" déconnecté: ${count} connexion(s) supprimée(s)`);
});
controlsContainer.appendChild(btnDisconnectUnit);

// Bouton pour supprimer un unit
const btnRemoveUnit = $('button', {
  text: '🗑️ Supprimer unit "template"',
  css: {
    display: 'block',
    width: '240px',
    margin: '5px 0',
    padding: '8px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  }
});
btnRemoveUnit.addEventListener('click', () => {
  window.unitBuilderInstance.removeModule('audio-template');
  console.log('🗑️ Unit "audio-template" supprimé !');
});
controlsContainer.appendChild(btnRemoveUnit);

// Bouton pour vérifier les connexions
const btnCheckConnection = $('button', {
  text: '✅ Vérifier connexion mon-unit→unit-slider',
  css: {
    display: 'block',
    width: '240px',
    margin: '5px 0',
    padding: '8px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    backgroundColor: '#9C27B0',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  }
});
btnCheckConnection.addEventListener('click', () => {
  const connected = window.unitBuilderInstance.areConnectorsConnected('mon-unit', '0', 'unit-slider', '0');
  console.log(connected ? '✅ Connecteurs connectés !' : '❌ Pas de connexion');
});
controlsContainer.appendChild(btnCheckConnection);

// Bouton pour info sur les connexions
const btnInfo = $('button', {
  text: '📊 Info connexions & units',
  css: {
    display: 'block',
    width: '240px',
    margin: '5px 0',
    padding: '8px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  }
});
btnInfo.addEventListener('click', () => {
  const totalConnections = window.unitBuilderInstance.getConnectionCount();
  const unitConnections = window.unitBuilderInstance.getModuleConnections('mon-unit');
  const units = window.unitBuilderInstance.getModuleIds();
  
  console.log('=== INFO CONNEXIONS & UNITS ===');
  console.log('Total connexions:', totalConnections);
  console.log('Units existants:', units);
  console.log('Connexions unit "mon-unit":', unitConnections);
  console.log('Unit "mon-unit" existe:', window.unitBuilderInstance.unitExists('mon-unit'));
  console.log('Connecteur "mon-unit_output_0" existe:', window.unitBuilderInstance.connectorExists('mon-unit', '0'));
  
  console.log(`📊 Résumé: ${totalConnections} connexions | Units: ${units.join(', ')}`);
});
controlsContainer.appendChild(btnInfo);

// Ajouter un séparateur
const separator = $('hr', {
  css: { margin: '10px 0', border: 'none', borderTop: '1px solid #ccc' }
});
controlsContainer.appendChild(separator);

// Bouton pour tester les callbacks
const btnTestCallbacks = $('button', {
  text: '🔊 Activer logs connexions',
  css: {
    display: 'block',
    width: '240px',
    margin: '5px 0',
    padding: '8px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    backgroundColor: '#FF9800',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  }
});

let callbacksActive = false;
btnTestCallbacks.addEventListener('click', () => {
  if (!callbacksActive) {
    // Ajouter des callbacks de test
    window.unitBuilderInstance.onConnect((connection) => {
      console.log('🔗 Connexion créée:', connection);
    });
    
    window.unitBuilderInstance.onDisconnect((connection) => {
      console.log('❌ Connexion supprimée:', connection);
    });
    
    window.unitBuilderInstance.onConnectionAttempt((data) => {
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

// Bouton pour déconnecter le unit sélectionné
const btnDisconnectSelected = $('button', {
  text: '🎯 Déconnecter units sélectionnés',
  css: {
    display: 'block',
    width: '240px',
    margin: '5px 0',
    padding: '8px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    backgroundColor: '#FF9800',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  }
});
btnDisconnectSelected.addEventListener('click', () => {
  const result = window.unitBuilderInstance.disconnectSelectedModules();
  if (result.count > 0) {
    console.log(`🔌 Units déconnectés:`, result.unitIds);
    console.log(`📊 Total: ${result.count} connexion(s) supprimée(s)`);
    result.modules.forEach(unit => {
      console.log(`  - "${unit.id}": ${unit.connectionsRemoved} connexion(s)`);
    });
  } else {
    console.log('⚠️ Aucun unit sélectionné ou aucune connexion à supprimer');
    console.log('💡 Cliquez sur un ou plusieurs units pour les sélectionner');
  }
});
controlsContainer.appendChild(btnDisconnectSelected);

document.body.appendChild(controlsContainer);

// S'assurer que le panneau est visible
setTimeout(() => {
  console.log('🎛️ API Panel Status:', {
    attached: document.body.contains(controlsContainer),
    visible: controlsContainer.style.display !== 'none',
    position: controlsContainer.getBoundingClientRect()
  });
  
  // Force la visibilité si nécessaire
  if (!document.body.contains(controlsContainer)) {
    document.body.appendChild(controlsContainer);
    console.log('🔄 API Panel re-attached to document body');
  }
}, 100);

// ========================================
// Interface complète (optionnelle)
// ========================================