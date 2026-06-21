
/**
 * Fonction de drag ultra-performante avec transform
 * @param {HTMLElement} element - L'élément à rendre draggable
 * @param {Object} options - Options de configuration
 */
function makeDraggable(element, options = {}) {
  const {
    onDragStart = () => { },
    onDragMove = () => { },
    onDragEnd = () => { },
    cursor = 'move',
    constrainToParent = false,
    bounds = null,
    rotationFactor = 0,
    scaleFactor = 0
  } = options;

  // Configuration CSS de base
  element.style.cursor = cursor;
  element.style.userSelect = 'none';
  element.style.touchAction = 'none';

  // Variables pour stocker la translation
  let currentX = 0;
  let currentY = 0;

  const startDrag = (startEvent, mode = 'mouse') => {
    let isDragging = false;  // Changé: ne commence pas à true
    let hasStarted = false;  // Nouveau: track si le drag a vraiment commencé
    let lastX = startEvent.clientX;
    let lastY = startEvent.clientY;
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const DRAG_THRESHOLD = 5; // Seuil de mouvement pour commencer le drag

    // Changer le curseur
    const originalCursor = element.style.cursor;

    const onMove = (e) => {
      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;
      const totalMoveX = e.clientX - startX;
      const totalMoveY = e.clientY - startY;
      const totalDistance = Math.sqrt(totalMoveX * totalMoveX + totalMoveY * totalMoveY);

      // Vérifier si on dépasse le seuil pour commencer le drag
      if (!hasStarted && totalDistance > DRAG_THRESHOLD) {
        hasStarted = true;
        isDragging = true;
        element.style.cursor = cursor === 'grab' ? 'grabbing' : cursor;
        onDragStart(element, startX, startY, currentX, currentY);
      }

      if (!isDragging) return;

      currentX += deltaX;
      currentY += deltaY;

      // Construire le transform avec les effets demandés
      let transformParts = [`translate(${currentX}px, ${currentY}px)`];

      // Ajouter rotation si demandée
      if (rotationFactor > 0) {
        const totalDeltaX = currentX;
        const totalDeltaY = currentY;
        if (Math.abs(totalDeltaX) > 5 || Math.abs(totalDeltaY) > 5) {
          const rotation = Math.atan2(totalDeltaY, totalDeltaX) * (180 / Math.PI) * rotationFactor;
          transformParts.push(`rotate(${rotation}deg)`);
        }
      }

      // Ajouter scale si demandé
      if (scaleFactor > 0) {
        const distance = Math.sqrt(currentX * currentX + currentY * currentY);
        const scale = 1 + (distance * scaleFactor * 0.001);
        transformParts.push(`scale(${Math.min(scale, 1.5)})`); // Max scale 1.5
      }

      // Appliquer la transformation
      element.style.transform = transformParts.join(' ');

      // Callback de mouvement (peut modifier le transform)
      onDragMove(element, currentX, currentY, deltaX, deltaY);

      // Mettre à jour les positions de référence
      lastX = e.clientX;
      lastY = e.clientY;

      e.preventDefault();
    };

    const onEnd = () => {
      element.style.cursor = originalCursor;

      // Ne déclencher onDragEnd que si le drag a vraiment commencé
      if (hasStarted) {
        onDragEnd(element, currentX, currentY, currentX, currentY);
      }

      isDragging = false;
      hasStarted = false;

      if (mode === 'pointer') {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onEnd);
        document.removeEventListener('pointercancel', onEnd);
      } else {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('mouseleave', onEnd);
      }
    };

    if (mode === 'pointer') {
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onEnd);
      document.addEventListener('pointercancel', onEnd);
    } else {
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('mouseleave', onEnd);
    }

    startEvent.preventDefault();
  };

  const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;
  const onPointerDown = (e) => {
    if (e.isPrimary === false) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startDrag(e, 'pointer');
  };
  const onMouseDown = (e) => startDrag(e, 'mouse');
  if (supportsPointer) {
    element.addEventListener('pointerdown', onPointerDown, { passive: false });
  } else {
    element.addEventListener('mousedown', onMouseDown);
  }

  return () => {
    if (supportsPointer) element.removeEventListener('pointerdown', onPointerDown);
    else element.removeEventListener('mousedown', onMouseDown);
    element.style.cursor = '';
    element.style.userSelect = '';
    element.style.touchAction = '';
    element.style.transform = '';
  };
}

export { makeDraggable };
