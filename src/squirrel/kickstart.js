// === 🎉 SQUIRREL KICKSTART ===
// Fonction d'initialisation à appeler après que $ et define soient disponibles

export function runKickstart() {
  console.log('🚀 Début du kickstart...');
  
  // 1. Template basique
  console.log('📝 Définition du template view...');
  define('view', {
      tag: 'div',
      class: 'atome',
      id: 'view',
  });
  console.log('✅ Template view défini');

  // 2. Animation avec CSS
  console.log('🎨 Création de l\'élément view...');
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
  
  console.log('🔍 Élément créé:', viewElement);
  console.log('🔍 Element avec id="view" dans le DOM:', document.getElementById('view'));
  
  console.log('🎯 Kickstart exécuté avec succès!');
}

// Export par défaut
export default { runKickstart };