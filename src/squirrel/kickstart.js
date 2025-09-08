// === 🎉 INDEPENDENT KICKSTART ===
// Create the view and dispatch 'squirrel:ready' when everything is ready

function initKickstart() {
  // Verify that the global helper functions are available
  if (typeof window.$ !== 'function' || typeof window.define !== 'function') {
    console.error('❌ Kickstart: Fonctions $ ou define non disponibles');
    return;
  }

  // 1. Basic template for the view
  window.define('view', {
      tag: 'div',
      class: 'atome',
      id: 'view',
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

  // 2. Create the view element
  window.$('view', {
      parent: document.body,

  });
  // 1. Basic template for the intuition layer
  window.define('intuition', {
	  tag: 'div',
	  class: 'atome',
	  id: 'intuition',
			css: {
        zIndex: 9999999,
		  background: 'transparent',
		  color: 'lightgray',
		  left: '0px',
		  top: '0px',
		  position: 'absolute',
		  width: 'px',
		  height: '0px',
		  overflow: 'visible',
	  }
  });

  // 2. Create the view element
  window.$('intuition', {
	  parent: document.body,

  });
  
  // console.log('✅ Kickstart demo initialized');
  
  // === READY EVENT NOW ===
  // Framework truly ready: Core + Kickstart finished!
  window.dispatchEvent(new CustomEvent('squirrel:ready'));
  // console.log('🎉 Squirrel framework is truly ready!');
}





// Run kickstart as soon as this file is loaded
// Global helpers are already exposed by spark.js
initKickstart();

console.log('Squirrel 1.0.5 ©atome');
console.log('Current platform: '+current_platform());