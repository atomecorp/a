// Extracted from matrix_builder.js: Matrix query methods (prototype mixin; `this` bound to the Matrix instance).
export const matrixQueryMethods = {
  getCellsByState(stateName) {
    const result = [];

    this.cellStates.forEach((states, cellKey) => {
      if (states.has(stateName)) {
        const [x, y] = cellKey.split(',').map(Number);
        const cell = this.cellsMap.get(cellKey);
        result.push({ x, y, id: cell.id, element: cell.element });
      }
    });

    return result;
  },

  getCellsWithAnyState(stateNames) {
    const result = [];

    this.cellStates.forEach((states, cellKey) => {
      const hasAnyState = stateNames.some(stateName => states.has(stateName));
      if (hasAnyState) {
        const [x, y] = cellKey.split(',').map(Number);
        const cell = this.cellsMap.get(cellKey);
        result.push({
          x, y,
          id: cell.id,
          element: cell.element,
          states: Array.from(states)
        });
      }
    });

    return result;
  },

  getCellsWithAllStates(stateNames) {
    const result = [];

    this.cellStates.forEach((states, cellKey) => {
      const hasAllStates = stateNames.every(stateName => states.has(stateName));
      if (hasAllStates) {
        const [x, y] = cellKey.split(',').map(Number);
        const cell = this.cellsMap.get(cellKey);
        result.push({
          x, y,
          id: cell.id,
          element: cell.element,
          states: Array.from(states)
        });
      }
    });

    return result;
  },

  getStateCount(stateName) {
    let count = 0;
    this.cellStates.forEach(states => {
      if (states.has(stateName)) count++;
    });
    return count;
  },

  getAllStates() {
    const allStates = new Set();
    this.cellStates.forEach(states => {
      states.forEach(state => allStates.add(state));
    });
    return Array.from(allStates);
  },

  getStateDistribution() {
    const distribution = {};
    this.cellStates.forEach(states => {
      states.forEach(state => {
        distribution[state] = (distribution[state] || 0) + 1;
      });
    });
    return distribution;
  },

  // ========================================
  // 🔍 RECHERCHE AVANCÉE
  // ========================================

  findCells(criteria) {
    const result = [];

    this.cellsMap.forEach((cell, cellKey) => {
      const [x, y] = cellKey.split(',').map(Number);
      let matches = true;

      // Vérification des critères
      if (criteria.state && !this.hasCellState(x, y, criteria.state)) {
        matches = false;
      }

      if (criteria.hasContent !== undefined) {
        const hasContent = cell.content && cell.content.trim().length > 0;
        if (criteria.hasContent !== hasContent) {
          matches = false;
        }
      }

      if (criteria.position) {
        if (criteria.position.x) {
          if (criteria.position.x.min !== undefined && x < criteria.position.x.min) matches = false;
          if (criteria.position.x.max !== undefined && x > criteria.position.x.max) matches = false;
        }
        if (criteria.position.y) {
          if (criteria.position.y.min !== undefined && y < criteria.position.y.min) matches = false;
          if (criteria.position.y.max !== undefined && y > criteria.position.y.max) matches = false;
        }
      }

      if (matches) {
        result.push({
          x, y,
          id: cell.id,
          element: cell.element,
          content: cell.content,
          states: this.getCellStates(x, y)
        });
      }
    });

    return result;
  },

  getCellsInRange(x1, y1, x2, y2) {
    const result = [];
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cellKey = `${x},${y}`;
        const cell = this.cellsMap.get(cellKey);
        if (cell) {
          result.push({
            x, y,
            id: cell.id,
            element: cell.element
          });
        }
      }
    }

    return result;
  },

  getCellsInRow(rowIndex) {
    const result = [];
    for (let x = 0; x < this.config.grid.x; x++) {
      const cellKey = `${x},${rowIndex}`;
      const cell = this.cellsMap.get(cellKey);
      if (cell) {
        result.push({
          x,
          y: rowIndex,
          id: cell.id,
          element: cell.element
        });
      }
    }
    return result;
  },

  getCellsInColumn(columnIndex) {
    const result = [];
    for (let y = 0; y < this.config.grid.y; y++) {
      const cellKey = `${columnIndex},${y}`;
      const cell = this.cellsMap.get(cellKey);
      if (cell) {
        result.push({
          x: columnIndex,
          y,
          id: cell.id,
          element: cell.element
        });
      }
    }
    return result;
  },

  compareCellStates(x1, y1, x2, y2) {
    const states1 = new Set(this.getCellStates(x1, y1));
    const states2 = new Set(this.getCellStates(x2, y2));

    const same = [...states1].every(state => states2.has(state)) &&
      [...states2].every(state => states1.has(state));

    const common = [...states1].filter(state => states2.has(state));
    const different1 = [...states1].filter(state => !states2.has(state));
    const different2 = [...states2].filter(state => !states1.has(state));

    return { same, common, different1, different2 };
  },

  findSimilarCells(x, y) {
    const referenceStates = new Set(this.getCellStates(x, y));
    const result = [];

    this.cellStates.forEach((states, cellKey) => {
      const [cellX, cellY] = cellKey.split(',').map(Number);

      // Skip la cellule de référence
      if (cellX === x && cellY === y) return;

      // Vérifier si les états sont identiques
      const same = states.size === referenceStates.size &&
        [...states].every(state => referenceStates.has(state));

      if (same) {
        const cell = this.cellsMap.get(cellKey);
        result.push({
          x: cellX,
          y: cellY,
          id: cell.id,
          element: cell.element
        });
      }
    });

    return result;
  },

  groupCellsByState() {
    const groups = {};

    this.cellStates.forEach((states, cellKey) => {
      const [x, y] = cellKey.split(',').map(Number);
      const cell = this.cellsMap.get(cellKey);

      states.forEach(stateName => {
        if (!groups[stateName]) {
          groups[stateName] = [];
        }
        groups[stateName].push({
          x, y,
          id: cell.id,
          element: cell.element
        });
      });
    });

    return groups;
  },

  // ========================================
  // 📝 GESTION DU CONTENU ET STYLES
  // ========================================

};
