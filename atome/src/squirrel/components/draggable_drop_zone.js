/**
 * Fonction pour créer des zones de drop
 * @param {HTMLElement|string} element - L'élément ou sélecteur de la drop zone
 * @param {Object} options - Options de configuration
 */
function makeDropZone(element, options = {}) {
  const {
    onDragEnter = () => { },
    onDragOver = () => { },
    onDragLeave = () => { },
    onDrop = () => { },
    acceptTypes = [], // Types de données acceptées
    hoverClass = 'drop-hover',
    activeClass = 'drop-active',
    acceptClass = 'drop-accept',
    rejectClass = 'drop-reject'
  } = options;

  const dropElement = typeof element === 'string' ? document.querySelector(element) : element;
  if (!dropElement) return;

  let dragCounter = 0; // Pour gérer les événements imbriqués

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragCounter++;

    if (dragCounter === 1) {
      dropElement.classList.add(hoverClass);
      onDragEnter(e, dropElement);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onDragOver(e, dropElement);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounter--;

    if (dragCounter === 0) {
      dropElement.classList.remove(hoverClass, acceptClass, rejectClass);
      onDragLeave(e, dropElement);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;

    dropElement.classList.remove(hoverClass, acceptClass, rejectClass);

    // Récupérer les données transférées
    const transferData = {};
    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        Object.assign(transferData, JSON.parse(jsonData));
      }
    } catch (err) {
    }

    // Récupérer les données texte
    transferData.text = e.dataTransfer.getData('text/plain');

    // Trouver l'élément source par son ID de drag
    let sourceElement = null;
    if (transferData.dragId) {
      sourceElement = document.querySelector(`[data-drag-id="${transferData.dragId}"]`);
    }

    // CRUCIAL: Marquer l'élément source comme ayant un drop réussi IMMÉDIATEMENT
    if (sourceElement) {
      sourceElement.setAttribute('data-drop-successful', 'true');
      sourceElement.setAttribute('data-moved', 'true');

      // Utiliser la fonction pour marquer le drop comme réussi
      if (sourceElement._markDropSuccessful) {
        sourceElement._markDropSuccessful();
      }

    }

    // Appeler la fonction de drop
    onDrop(e, dropElement, transferData, sourceElement);
  };

  // Attacher les événements
  dropElement.addEventListener('dragenter', handleDragEnter);
  dropElement.addEventListener('dragover', handleDragOver);
  dropElement.addEventListener('dragleave', handleDragLeave);
  dropElement.addEventListener('drop', handleDrop);

  // Fonction de nettoyage
  return () => {
    dropElement.removeEventListener('dragenter', handleDragEnter);
    dropElement.removeEventListener('dragover', handleDragOver);
    dropElement.removeEventListener('dragleave', handleDragLeave);
    dropElement.removeEventListener('drop', handleDrop);
    dropElement.classList.remove(hoverClass, activeClass, acceptClass, rejectClass);
  };
}

export { makeDropZone };
