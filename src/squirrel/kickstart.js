// === 🎉 Démonstrations ===
// Attendre que les fonctions $ et define soient disponibles

function initKickstart() {
  // 1. Template basique
  define('view', {
      tag: 'div',
      class: 'atome',
      id: 'view',
  });

  // 2. Animation avec CSS
  $('view', {
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
  
  console.log('✅ Kickstart demo initialized');
}

// Attendre que squirrel:ready soit déclenché
if (typeof window !== 'undefined') {
  window.addEventListener('squirrel:ready', () => {
    // Attendre un tick pour s'assurer que tout est exposé
    setTimeout(initKickstart, 0);
  });
}