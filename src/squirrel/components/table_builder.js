/**
 * 📊 TABLE COMPONENT - VERSION 1.0 PROFESSIONAL
 * Composant Table avec gestion complète des cellules, styles et fonctionnalités
 */

class Table {
  constructor(options = {}) {
// console.log('🏗️ Création du composant Table avec options:', options);
    
    // Configuration par défaut
    this.config = {
      id: options.id || `table-${Date.now()}`,
      position: { x: 0, y: 0, ...options.position },
      size: { width: 800, height: 600, ...options.size },
      attach: options.attach || 'body',
      
      // Colonnes avec configuration complète
      columns: options.columns || [],
      
      // Lignes avec cellules
      rows: options.rows || [],
      
      // Styles personnalisables
      styling: {
        cellPadding: options.styling?.cellPadding ?? 12,
        cellMargin: options.styling?.cellMargin ?? 2,
        rowHeight: options.styling?.rowHeight ?? 40,
        borderSpacing: options.styling?.borderSpacing ?? 0,
        
        headerStyle: {
          backgroundColor: '#343a40',
          color: '#ffffff',
          fontWeight: '600',
          fontSize: '14px',
          padding: '12px',
          ...options.styling?.headerStyle
        },
        
        cellStyle: {
          backgroundColor: '#ffffff',
          color: '#212529',
          fontSize: '13px',
          border: '1px solid #dee2e6',
          padding: '8px 12px',
          ...options.styling?.cellStyle
        },
        
        alternateRowStyle: {
          backgroundColor: '#f8f9fa',
          ...options.styling?.alternateRowStyle
        },
        
        states: {
          hover: {
            backgroundColor: '#e9ecef',
            cursor: 'pointer',
            ...options.styling?.states?.hover
          },
          selected: {
            backgroundColor: '#007bff',
            color: '#ffffff',
            ...options.styling?.states?.selected
          },
          ...options.styling?.states
        },
        
        ...options.styling
      },
      
      // Options fonctionnelles
      options: {
        sortable: options.options?.sortable ?? true,
        selectable: options.options?.selectable ?? true,
        multiSelect: options.options?.multiSelect ?? false,
        resizableColumns: options.options?.resizableColumns ?? true,
        addRows: options.options?.addRows ?? true,
        deleteRows: options.options?.deleteRows ?? true,
        addColumns: options.options?.addColumns ?? true,
        deleteColumns: options.options?.deleteColumns ?? true,
        ...options.options
      },
      
      // Debug
      debug: options.debug || false
    };

    // Stockage interne
    this.cellsMap = new Map();           // Map des cellules avec leurs données
    this.rowsMap = new Map();            // Map des lignes
    this.columnsMap = new Map();         // Map des colonnes
    this.selectedRows = new Set();       // Lignes sélectionnées
    this.selectedCells = new Set();      // Cellules sélectionnées
    this.sortConfig = { column: null, direction: 'asc' };

    // Callbacks
    this.callbacks = {
      onCellClick: options.onCellClick || null,
      onCellEdit: options.onCellEdit || null,
      onRowSelect: options.onRowSelect || null,
      onSort: options.onSort || null,
      onRowAdd: options.onRowAdd || null,
      onRowDelete: options.onRowDelete || null,
      onColumnAdd: options.onColumnAdd || null,
      onColumnDelete: options.onColumnDelete || null
    };

    // État interne
    this.container = null;
    this.tableElement = null;
    this.isInitialized = false;

    // Initialisation
    this.init();
  }

  // ========================================
  // 🏗️ INITIALISATION
  // ========================================

  init() {
    try {
// console.log(`🚀 Initialisation de la table "${this.config.id}"...`);
      this.createContainer();
      this.createTable();
      this.setupEventListeners();
      this.isInitialized = true;

      if (this.config.debug) {
// console.log(`✅ Table "${this.config.id}" initialisée avec succès`);
// console.log(`📊 ${this.config.columns.length} colonnes, ${this.config.rows.length} lignes`);
      }
    } catch (error) {
      console.error(`❌ Erreur lors de l'initialisation de Table "${this.config.id}":`, error);
    }
  }

  createContainer() {
    const attachPoint = typeof this.config.attach === 'string' 
      ? document.querySelector(this.config.attach) 
      : this.config.attach;

    if (!attachPoint) {
      throw new Error(`Point d'attachement "${this.config.attach}" non trouvé`);
    }

    this.container = document.createElement('div');
    this.container.id = this.config.id;
    this.container.className = 'table-container';
    
    this.applyContainerStyles();
    attachPoint.appendChild(this.container);
    
// console.log(`📦 Container table créé et attaché à "${this.config.attach}"`);
  }

  applyContainerStyles() {
    const defaultStyles = {
      position: 'absolute',
      left: `${this.config.position.x}px`,
      top: `${this.config.position.y}px`,
      width: `${this.config.size.width}px`,
      height: `${this.config.size.height}px`,
      background: '#ffffff',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    };

    Object.assign(this.container.style, defaultStyles);
  }

  createTable() {
    // Créer l'en-tête fixe (div, pas table)
    this.headerContainer = document.createElement('div');
    this.headerContainer.className = 'table-header-container';
    this.headerContainer.style.cssText = `
      display: flex;
      flex-shrink: 0;
      border-bottom: 2px solid #dee2e6;
      background: ${this.config.styling.headerStyle.backgroundColor || '#343a40'};
    `;

    // Créer le conteneur de corps avec scroll
    this.bodyContainer = document.createElement('div');
    this.bodyContainer.className = 'table-body-container';
    this.bodyContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      max-height: calc(100% - 50px);
    `;

    // Créer l'en-tête et le corps
    this.createHeader();
    this.createBody();
    
    // Assembler la structure
    this.container.appendChild(this.headerContainer);
    this.container.appendChild(this.bodyContainer);
  }

  createHeader() {
    // Créer les colonnes d'en-tête comme des divs flexibles
    this.config.columns.forEach(column => {
      const headerCell = document.createElement('div');
      headerCell.id = `header-${column.id}`;
      headerCell.className = 'table-header-cell';
      headerCell.textContent = column.header || column.id;
      
      // Style de la cellule d'en-tête
      headerCell.style.cssText = `
        width: ${column.width || 100}px;
        min-width: ${column.width || 100}px;
        max-width: ${column.width || 100}px;
        padding: ${this.config.styling.headerStyle.padding || '12px'};
        font-size: ${this.config.styling.headerStyle.fontSize || '14px'};
        font-weight: ${this.config.styling.headerStyle.fontWeight || '600'};
        color: ${this.config.styling.headerStyle.color || '#ffffff'};
        border-right: 1px solid rgba(255,255,255,0.1);
        display: flex;
        align-items: center;
        justify-content: ${column.style?.textAlign === 'right' ? 'flex-end' : 
                          column.style?.textAlign === 'center' ? 'center' : 'flex-start'};
      `;
      
      // Styles spécifiques à la colonne
      if (column.style) {
        Object.assign(headerCell.style, column.style);
      }
      
      // Ajouter l'indicateur de tri si sortable
      if (this.config.options.sortable && column.sortable !== false) {
        headerCell.style.cursor = 'pointer';
        headerCell.style.userSelect = 'none';
        headerCell.dataset.columnId = column.id;
        headerCell.innerHTML += ' <span class="sort-indicator">⚌</span>';
      }
      
      this.headerContainer.appendChild(headerCell);
      
      // Stocker la colonne
      this.columnsMap.set(column.id, column);
    });
  }

  createBody() {
    this.config.rows.forEach((rowData, rowIndex) => {
      const rowElement = this.createRow(rowData, rowIndex);
      this.bodyContainer.appendChild(rowElement);
    });
  }

  createRow(rowData, rowIndex) {
    const row = document.createElement('div');
    row.id = rowData.id || `row-${rowIndex}`;
    row.className = 'table-row';
    row.style.cssText = `
      display: flex;
      min-height: ${this.config.styling.rowHeight || 40}px;
      border-bottom: 1px solid #e9ecef;
      ${rowIndex % 2 === 1 ? `background-color: ${this.config.styling.alternateRowStyle?.backgroundColor || '#f8f9fa'};` : ''}
    `;
    
    // Style spécifique à la ligne
    if (rowData.style) {
      Object.assign(row.style, rowData.style);
    }
    
    // Créer les cellules
    this.config.columns.forEach(column => {
      const cell = this.createCell(rowData, column, rowIndex);
      row.appendChild(cell);
    });
    
    // Stocker la ligne
    this.rowsMap.set(row.id, rowData);
    
    return row;
  }

  createCell(rowData, column, rowIndex) {
    const cell = document.createElement('div');
    const cellData = rowData.cells[column.id];
    
    // Style de base de la cellule
    cell.style.cssText = `
      width: ${column.width || 100}px;
      min-width: ${column.width || 100}px;
      max-width: ${column.width || 100}px;
      padding: ${this.config.styling.cellStyle.padding || '8px 12px'};
      display: flex;
      align-items: center;
      font-size: ${this.config.styling.cellStyle.fontSize || '13px'};
      color: ${this.config.styling.cellStyle.color || '#212529'};
      background-color: ${this.config.styling.cellStyle.backgroundColor || '#ffffff'};
      border-right: 1px solid #e9ecef;
      justify-content: ${column.style?.textAlign === 'right' ? 'flex-end' : 
                        column.style?.textAlign === 'center' ? 'center' : 'flex-start'};
    `;
    
    if (cellData) {
      // ID de la cellule
      cell.id = cellData.id || `cell-${rowIndex}-${column.id}`;
      cell.textContent = cellData.content || '';
      
      // Style spécifique à la cellule
      if (cellData.style) {
        Object.assign(cell.style, cellData.style);
      }
      
      // Stocker la cellule
      this.cellsMap.set(cell.id, {
        ...cellData,
        rowId: rowData.id || `row-${rowIndex}`,
        columnId: column.id
      });
    }
    
    cell.dataset.rowId = rowData.id || `row-${rowIndex}`;
    cell.dataset.columnId = column.id;
    cell.className = 'table-cell';
    
    return cell;
  }

  setupEventListeners() {
    // Événements de clic sur l'en-tête
    this.headerContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('table-header-cell') && e.target.dataset.columnId) {
        this.handleHeaderClick(e.target, e);
      }
    });

    // Événements de clic sur les cellules du corps
    this.bodyContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('table-cell')) {
        this.handleCellClick(e.target, e);
      }
    });

    // Événements de survol sur les lignes
    this.bodyContainer.addEventListener('mouseover', (e) => {
      if (e.target.classList.contains('table-cell')) {
        this.handleCellHover(e.target);
      }
    });

    this.bodyContainer.addEventListener('mouseout', (e) => {
      if (e.target.classList.contains('table-cell')) {
        this.handleCellLeave(e.target);
      }
    });
  }

  // ========================================
  // 🎭 GESTION DES ÉVÉNEMENTS
  // ========================================

  handleCellClick(cell, event) {
    const cellData = this.cellsMap.get(cell.id);
    const rowId = cell.dataset.rowId;
    const columnId = cell.dataset.columnId;

    if (this.config.options.selectable) {
      this.toggleCellSelection(cell.id);
    }

    if (this.callbacks.onCellClick) {
      this.callbacks.onCellClick(cellData, rowId, columnId, event);
    }

// console.log(`📋 Cell clicked: ${cell.id}`);
  }

  handleHeaderClick(header, event) {
    const columnId = header.dataset.columnId;
    
    if (this.config.options.sortable) {
      this.sortByColumn(columnId);
    }
  }

  handleCellHover(cell) {
    // Appliquer l'effet hover à toute la ligne
    const row = cell.parentElement;
    if (row && this.config.styling.states.hover) {
      Object.assign(row.style, this.config.styling.states.hover);
    }
  }

  handleCellLeave(cell) {
    // Restaurer le style original de la ligne
    const row = cell.parentElement;
    if (row) {
      const rowId = row.id;
      const rowData = this.rowsMap.get(rowId);
      const rowIndex = Array.from(this.bodyContainer.children).indexOf(row);
      
      // Réappliquer les styles de base
      row.style.cssText = `
        display: flex;
        min-height: ${this.config.styling.rowHeight || 40}px;
        border-bottom: 1px solid #e9ecef;
        ${rowIndex % 2 === 1 ? `background-color: ${this.config.styling.alternateRowStyle?.backgroundColor || '#f8f9fa'};` : ''}
      `;
      
      // Réappliquer le style spécifique de la ligne s'il existe
      if (rowData && rowData.style) {
        Object.assign(row.style, rowData.style);
      }
    }
  }

  // ========================================
  // 🔧 API PUBLIQUE
  // ========================================

  addRow(rowData) {
    const rowIndex = this.config.rows.length;
    
    this.config.rows.push(rowData);
    const rowElement = this.createRow(rowData, rowIndex);
    this.bodyContainer.appendChild(rowElement);
    
    if (this.callbacks.onRowAdd) {
      this.callbacks.onRowAdd(rowData);
    }
    
    return rowData.id || `row-${rowIndex}`;
  }

  removeRow(rowId) {
    const rowElement = document.getElementById(rowId);
    if (rowElement) {
      rowElement.remove();
      this.rowsMap.delete(rowId);
      this.selectedRows.delete(rowId);
      
      if (this.callbacks.onRowDelete) {
        this.callbacks.onRowDelete(rowId);
      }
    }
  }

  updateCell(rowId, columnId, newContent) {
    const cellId = `cell-${rowId.split('-')[1]}-${columnId}`;
    const cellElement = document.getElementById(cellId);
    const cellData = this.cellsMap.get(cellId);
    
    if (cellElement && cellData) {
      cellElement.textContent = newContent;
      cellData.content = newContent;
      
      if (this.callbacks.onCellEdit) {
        this.callbacks.onCellEdit(cellData, newContent);
      }
    }
  }

  sortByColumn(columnId) {
    const direction = this.sortConfig.column === columnId && this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
    this.sortConfig = { column: columnId, direction };
    
    // Tri des données
    this.config.rows.sort((a, b) => {
      const aVal = a.cells[columnId]?.content || '';
      const bVal = b.cells[columnId]?.content || '';
      
      const comparison = aVal.localeCompare(bVal, undefined, { numeric: true });
      return direction === 'asc' ? comparison : -comparison;
    });
    
    // Reconstruire le tableau
    this.refreshTable();
    
    // Mettre à jour l'indicateur de tri
    this.updateSortIndicators(columnId, direction);
    
    if (this.callbacks.onSort) {
      this.callbacks.onSort(columnId, direction);
    }
  }

  toggleCellSelection(cellId) {
    const cellElement = document.getElementById(cellId);
    
    if (this.selectedCells.has(cellId)) {
      this.selectedCells.delete(cellId);
      this.handleCellLeave(cellElement);
    } else {
      if (!this.config.options.multiSelect) {
        this.clearSelection();
      }
      this.selectedCells.add(cellId);
      Object.assign(cellElement.style, this.config.styling.states.selected);
    }
  }

  clearSelection() {
    this.selectedCells.forEach(cellId => {
      const cellElement = document.getElementById(cellId);
      if (cellElement) {
        this.handleCellLeave(cellElement);
      }
    });
    this.selectedCells.clear();
  }

  refreshTable() {
    // Vider le conteneur de corps
    this.bodyContainer.innerHTML = '';
    
    // Recréer toutes les lignes
    this.config.rows.forEach((rowData, rowIndex) => {
      const rowElement = this.createRow(rowData, rowIndex);
      this.bodyContainer.appendChild(rowElement);
    });
  }

  updateSortIndicators(activeColumn, direction) {
    // Réinitialiser tous les indicateurs
    this.config.columns.forEach(col => {
      const header = document.getElementById(`header-${col.id}`);
      if (header) {
        const indicator = header.querySelector('.sort-indicator');
        if (indicator) {
          indicator.textContent = col.id === activeColumn ? (direction === 'asc' ? '▲' : '▼') : '⚌';
        }
      }
    });
  }

  // Méthodes utilitaires
  exportToCSV() {
    let csv = '';
    
    // En-têtes
    csv += this.config.columns.map(col => col.header || col.id).join(',') + '\n';
    
    // Données
    this.config.rows.forEach(row => {
      const values = this.config.columns.map(col => {
        const cell = row.cells[col.id];
        return cell ? `"${cell.content}"` : '';
      });
      csv += values.join(',') + '\n';
    });
    
    return csv;
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    this.cellsMap.clear();
    this.rowsMap.clear();
    this.columnsMap.clear();
    this.selectedRows.clear();
    this.selectedCells.clear();
    
    this.isInitialized = false;
  }
}

export default Table;
