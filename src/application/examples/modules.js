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
// - Module sélectionné = contour bleu et légère mise à l'échelle

console.log('Modules créés:', { simpleModule, moduleAvecContenu, moduleTemplate });

// ========================================
// Interface complète (optionnelle)
// ========================================