function draggable(element, options = {}) {
  const {
    onDragStart = () => {},
    onDragMove = () => {},
    onDragEnd = () => {},
    cursor = 'move'
  } = options;

  // Configuration CSS de base
  element.style.cursor = cursor;
  element.style.userSelect = 'none';

  // Variables pour stocker la translation
  let currentX = 0;
  let currentY = 0;

  const onMouseDown = (e) => {
    let isDragging = true;
    let lastX = e.clientX;
    let lastY = e.clientY;

    console.log('🟡 DEBUG transform drag start:', { lastX, lastY, currentX, currentY });

    // Changer le curseur
    const originalCursor = element.style.cursor;
    element.style.cursor = cursor === 'grab' ? 'grabbing' : cursor;

    onDragStart(element, lastX, lastY, currentX, currentY);

    const onMouseMove = (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;

      currentX += deltaX;
      currentY += deltaY;

      // Appliquer la transformation de base
      element.style.transform = `translate(${currentX}px, ${currentY}px)`;

      console.log('🟡 DEBUG transform move:', { deltaX, deltaY, currentX, currentY });

      // Callback de mouvement (peut modifier le transform)
      onDragMove(element, currentX, currentY, deltaX, deltaY);

      // Mettre à jour les positions de référence
      lastX = e.clientX;
      lastY = e.clientY;

      e.preventDefault();
    };

    const onMouseUp = (e) => {
      isDragging = false;
      element.style.cursor = originalCursor;

      onDragEnd(element, currentX, currentY, currentX, currentY);

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mouseleave', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mouseleave', onMouseUp);

    e.preventDefault();
  };

  element.addEventListener('mousedown', onMouseDown);

  return () => {
    element.removeEventListener('mousedown', onMouseDown);
    element.style.cursor = '';
    element.style.userSelect = '';
    element.style.transform = '';
  };
}