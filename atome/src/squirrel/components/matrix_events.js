// Extracted from matrix_builder.js: Matrix events methods (prototype mixin; `this` bound to the Matrix instance).
export const matrixEventsMethods = {
  setupEventListeners() {
    // Event delegation sur le container
    this.container.addEventListener('click', this.handleCellClick.bind(this));
    this.container.addEventListener('dblclick', this.handleCellDoubleClick.bind(this));
    this.container.addEventListener('mousedown', this.handleCellMouseDown.bind(this));
    this.container.addEventListener('mouseup', this.handleCellMouseUp.bind(this));
    this.container.addEventListener('mouseenter', this.handleCellHover.bind(this), true);
    this.container.addEventListener('mouseleave', this.handleCellLeave.bind(this), true);
    this.container.addEventListener('keydown', this.handleCellKeyDown.bind(this));
  },

  handleCellClick(event) {
    const cellData = this.getCellFromEvent(event);
    if (!cellData) return;

    const { x, y, id, element } = cellData;

    // Callback
    if (this.callbacks.onCellClick) {
      this.callbacks.onCellClick(element, x, y, id, event);
    }
  },

  handleCellDoubleClick(event) {
    const cellData = this.getCellFromEvent(event);
    if (!cellData) return;

    const { x, y, id, element } = cellData;

    // Callback
    if (this.callbacks.onCellDoubleClick) {
      this.callbacks.onCellDoubleClick(element, x, y, id, event);
    }
  },

  handleCellMouseDown(event) {
    const cellData = this.getCellFromEvent(event);
    if (!cellData) return;

    const { x, y, id, element } = cellData;

    // Démarrage du timer pour long click
    this.longClickTimer = setTimeout(() => {
      if (this.callbacks.onCellLongClick) {
        this.callbacks.onCellLongClick(element, x, y, id, event);
      }
    }, 500);
  },

  handleCellMouseUp(event) {
    // Annulation du long click
    if (this.longClickTimer) {
      clearTimeout(this.longClickTimer);
      this.longClickTimer = null;
    }
  },

  handleCellHover(event) {
    const cellData = this.getCellFromEvent(event);
    if (!cellData || !event.target.classList.contains('matrix-cell')) return;

    const { x, y, id, element } = cellData;

    // Application du style hover s'il est défini
    if (this.config.states.hover) {
      this.applyStylesToElement(element, this.config.states.hover, true);
    }

    // Callback
    if (this.callbacks.onCellHover) {
      this.callbacks.onCellHover(element, x, y, id, event);
    }
  },

  handleCellLeave(event) {
    const cellData = this.getCellFromEvent(event);
    if (!cellData || !event.target.classList.contains('matrix-cell')) return;

    const { x, y, id, element } = cellData;

    // Suppression du style hover et réapplication des styles d'états
    this.reapplyCellStyles(x, y);

    // Callback
    if (this.callbacks.onCellLeave) {
      this.callbacks.onCellLeave(element, x, y, id, event);
    }
  },

  handleCellKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.handleCellClick(event);
    }
  },

  getCellFromEvent(event) {
    const cellElement = event.target.closest('.matrix-cell');
    if (!cellElement) return null;

    const x = parseInt(cellElement.getAttribute('data-x'));
    const y = parseInt(cellElement.getAttribute('data-y'));
    const id = cellElement.getAttribute('data-cell-id');
    const cellKey = `${x},${y}`;
    const cellData = this.cellsMap.get(cellKey);

    return { x, y, id, element: cellElement, cellData };
  },

  // ========================================
  // 🗂️ GESTION D'ÉTAT DES CELLULES
  // ========================================

};
