// Point d'entrée du bundle CDN
import Squirrel from '../src/squirrel/squirrel.js';

// Expose $ globalement et initialise le conteneur + event ready
if (typeof window !== 'undefined') {
  window.$ = Squirrel.$;
  if (!document.getElementById('view')) {
    const view = document.createElement('div');
    view.id = 'view';
    document.body.appendChild(view);
  }
  // Déclenche l'événement squirrel:ready de façon asynchrone pour garantir la capture
  setTimeout(() => {
    window.squirrelReady = true;
    window.dispatchEvent(new Event('squirrel:ready'));
  }, 0);
}

export default Squirrel;
