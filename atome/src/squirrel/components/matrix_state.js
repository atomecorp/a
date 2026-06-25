// Extracted from matrix_builder.js: Matrix state methods (prototype mixin; `this` bound to the Matrix instance).
export const matrixStateMethods = {
  getCellState(x, y) {
    const cellKey = `${x},${y}`;
    const states = this.cellStates.get(cellKey);
    if (!states || states.size === 0) return null;

    // Retourne l'état principal (le dernier ajouté qui n'est pas 'normal')
    const statesArray = Array.from(states);
    return statesArray.find(state => state !== 'normal') || 'normal';
  },

  getCellStates(x, y) {
    const cellKey = `${x},${y}`;
    const states = this.cellStates.get(cellKey);
    return states ? Array.from(states) : [];
  },

  hasCellState(x, y, stateName) {
    const cellKey = `${x},${y}`;
    const states = this.cellStates.get(cellKey);
    return states ? states.has(stateName) : false;
  },

  setCellState(x, y, stateName, active = true) {
    const cellKey = `${x},${y}`;
    const states = this.cellStates.get(cellKey) || new Set();
    const cell = this.cellsMap.get(cellKey);

    if (!cell) return;

    const wasActive = states.has(stateName);

    if (active && !wasActive) {
      states.add(stateName);
      this.applyCellStateStyle(x, y, stateName);
    } else if (!active && wasActive) {
      states.delete(stateName);
      this.removeCellStateStyle(x, y, stateName);
    }

    this.cellStates.set(cellKey, states);

    // Gestion de la sélection
    if (stateName === 'selected') {
      if (active) {
        this.selectedCells.add(cellKey);
      } else {
        this.selectedCells.delete(cellKey);
      }
      this.triggerSelectionChange();
    }

    // Callback
    if (this.callbacks.onCellStateChange && wasActive !== active) {
      this.callbacks.onCellStateChange(cell.element, x, y, stateName, active);
    }
  },

  addCellState(x, y, stateName) {
    this.setCellState(x, y, stateName, true);
  },

  removeCellState(x, y, stateName) {
    this.setCellState(x, y, stateName, false);
  },

  toggleCellState(x, y, stateName) {
    const hasState = this.hasCellState(x, y, stateName);
    this.setCellState(x, y, stateName, !hasState);
    return !hasState;
  },

  clearCellStates(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);

    if (!cell) return;

    // Retour au style par défaut
    this.resetCellStyle(x, y);

    // Réinitialisation avec état normal uniquement
    this.cellStates.set(cellKey, new Set(['normal']));

    // Suppression de la sélection
    this.selectedCells.delete(cellKey);
    this.triggerSelectionChange();
  },

  applyCellStateStyle(x, y, stateName) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    const stateStyle = this.config.states[stateName];

    if (cell && stateStyle) {
      // Application des styles avec priorité !important pour éviter les conflits
      this.applyStylesToElement(cell.element, stateStyle, true);
    }
  },

  removeCellStateStyle(x, y, stateName) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);

    if (!cell) return;

    // Suppression spécifique des propriétés CSS de cet état
    const stateStyle = this.config.states[stateName];
    if (stateStyle) {
      Object.keys(stateStyle).forEach(property => {
        const cssProp = property.replace(/([A-Z])/g, '-$1').toLowerCase();
        cell.element.style.removeProperty(cssProp);
      });
    }

    // Réapplication des styles d'états restants
    this.reapplyCellStyles(x, y);
  },

  reapplyCellStyles(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    const states = this.cellStates.get(cellKey);

    if (!cell || !states) return;

    // Reset et réapplication des styles de base
    this.resetCellStyle(x, y);

    // Réapplication des styles d'états actifs avec priorité !important
    states.forEach(stateName => {
      if (stateName !== 'normal' && this.config.states[stateName]) {
        this.applyStylesToElement(cell.element, this.config.states[stateName], true);
      }
    });
  },

  // ========================================
  // 📐 MÉTHODES DE REDIMENSIONNEMENT
  // ========================================

  /**
   * Force un redimensionnement manuel de la matrice
   * @param {number} width - Nouvelle largeur (optionnel)
   * @param {number} height - Nouvelle hauteur (optionnel)
   */
};
