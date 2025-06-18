// === 🎉 SQUIRREL KICKSTART ===
// Fonction d'initialisation à appeler après que $ et define soient disponibles

export function runKickstart() {
  // 1. Template basique
  define('view', {
      tag: 'div',
      class: 'atome',
      id: 'view',
  });

  // 2. Création de l'élément view
  const viewElement = $('view', {
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
}

// Export par défaut
export default { runKickstart };