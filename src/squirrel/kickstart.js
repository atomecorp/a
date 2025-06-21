// === 🎉 KICKSTART INDÉPENDANT ===
// Créer view et déclencher squirrel:ready quand tout est prêt

function initKickstart() {
  // Vérifier que les fonctions globales sont disponibles
  if (typeof window.$ !== 'function' || typeof window.define !== 'function') {
    console.error('❌ Kickstart: Fonctions $ ou define non disponibles');
    return;
  }

  // 1. Template basique pour view
  window.define('view', {
      tag: 'div',
      class: 'atome',
      id: 'view',
  });

  // 2. Créer l'élément view
  window.$('view', {
      parent: document.body,
      css: {
          background: '#272727',
          color: 'lightgray',
          left: '0px',
          top: '0px',
          position: 'absolute',
          width: '100%',
          height: '100%',
          overflow: 'auto',
      }
  });
  
  // console.log('✅ Kickstart demo initialized');
  
  // === ÉVÉNEMENT READY MAINTENANT ===
  // Framework vraiment prêt : Core + Kickstart fini !
  window.dispatchEvent(new CustomEvent('squirrel:ready'));
  // console.log('🎉 Framework Squirrel vraiment prêt !');
}

// Exécuter kickstart dès que ce fichier est chargé
// Les fonctions globales sont déjà exposées par spark.js
initKickstart();