/**
 * 📊 TABLE COMPONENT - VERSION 1.0 PROFESSIONAL
 * Composant Table avec gestion complète des cellules, styles et fonctionnalités
 */

class Table {
  constructor(options = {}) {
    console.log('🏗️ Création du composant Table avec options:', options);
    
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
      console.log(`🚀 Initialisation de la table "${this.config.id}"...`);
      this.createContainer();
      this.createTable();
      this.setupEventListeners();
      this.isInitialized = true;

      if (this.config.debug) {
        console.log(`✅ Table "${this.config.id}" initialisée avec succès`);
        console.log(`📊 ${this.config.columns.length} colonnes, ${this.config.rows.length} lignes`);
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
    
    console.log(`📦 Container table créé et attaché à "${this.config.attach}"`);
  }

  applyContainerStyles() {
    const defaultStyles = {
      position: 'absolute',
      left: `${this.config.position.x}px`,
      top: `${this.config.position.y}px`,
      width: `${this.config.size.width}px`,
      height: `${this.config.size.height}px`,
      overflow: 'auto',
      background: '#ffffff',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    };

    Object.assign(this.container.style, defaultStyles);
  }

  createTable() {
    // Créer l'élément table
    this.tableElement = document.createElement('table');
    this.tableElement.className = 'professional-table';
    this.tableElement.style.cssText = `
      width: 100%;
      border-collapse: separate;
      border-spacing: ${this.config.styling.borderSpacing}px;
      margin: 0;
    `;

    // Créer l'en-tête
    this.createHeader();
    
    // Créer le corps
    this.createBody();
    
    this.container.appendChild(this.tableElement);
  }

  createHeader() {
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    this.config.columns.forEach(column => {
      const th = document.createElement('th');
      th.id = `header-${column.id}`;
      th.textContent = column.header || column.id;
      th.style.width = `${column.width || 100}px`;
      
      // Appliquer les styles d'en-tête
      Object.assign(th.style, this.config.styling.headerStyle);
      
      // Styles spécifiques à la colonne
      if (column.style) {
        Object.assign(th.style, column.style);
      }
      
      // Ajouter l'indicateur de tri si sortable
      if (this.config.options.sortable && column.sortable !== false) {
        th.style.cursor = 'pointer';
        th.style.userSelect = 'none';
        th.dataset.columnId = column.id;
        th.innerHTML += ' <span class="sort-indicator">⚌</span>';
      }
      
      headerRow.appendChild(th);
      
      // Stocker la colonne
      this.columnsMap.set(column.id, column);
    });
    
    thead.appendChild(headerRow);
    this.tableElement.appendChild(thead);
  }

  createBody() {
    const tbody = document.createElement('tbody');
    
    this.config.rows.forEach((rowData, rowIndex) => {
      const tr = this.createRow(rowData, rowIndex);
      tbody.appendChild(tr);
    });
    
    this.tableElement.appendChild(tbody);
  }

  createRow(rowData, rowIndex) {
    const tr = document.createElement('tr');
    tr.id = rowData.id || `row-${rowIndex}`;
    tr.className = 'table-row';
    
    // Appliquer le style de ligne alternée
    if (rowIndex % 2 === 1) {
      Object.assign(tr.style, this.config.styling.alternateRowStyle);
    }
    
    // Style spécifique à la ligne
    if (rowData.style) {
      Object.assign(tr.style, rowData.style);
    }
    
    // Créer les cellules
    this.config.columns.forEach(column => {
      const td = this.createCell(rowData, column, rowIndex);
      tr.appendChild(td);
    });
    
    // Stocker la ligne
    this.rowsMap.set(tr.id, rowData);
    
    return tr;
  }

  createCell(rowData, column, rowIndex) {
    const td = document.createElement('td');
    const cellData = rowData.cells[column.id];
    
    if (cellData) {
      // ID de la cellule
      td.id = cellData.id || `cell-${rowIndex}-${column.id}`;
      td.textContent = cellData.content || '';
      
      // Appliquer les styles par défaut
      Object.assign(td.style, this.config.styling.cellStyle);
      
      // Style spécifique à la cellule
      if (cellData.style) {
        Object.assign(td.style, cellData.style);
      }
      
      // Stocker la cellule
      this.cellsMap.set(td.id, {
        ...cellData,
        rowId: rowData.id || `row-${rowIndex}`,
        columnId: column.id
      });
    }
    
    td.dataset.rowId = rowData.id || `row-${rowIndex}`;
    td.dataset.columnId = column.id;
    
    return td;
  }

  setupEventListeners() {
    // Événements de clic sur les cellules
    this.tableElement.addEventListener('click', (e) => {
      if (e.target.tagName === 'TD') {
        this.handleCellClick(e.target, e);
      } else if (e.target.tagName === 'TH' && e.target.dataset.columnId) {
        this.handleHeaderClick(e.target, e);
      }
    });

    // Événements de survol
    this.tableElement.addEventListener('mouseover', (e) => {
      if (e.target.tagName === 'TD') {
        this.handleCellHover(e.target);
      }
    });

    this.tableElement.addEventListener('mouseout', (e) => {
      if (e.target.tagName === 'TD') {
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

    console.log(`📋 Cell clicked: ${cell.id}`);
  }

  handleHeaderClick(header, event) {
    const columnId = header.dataset.columnId;
    
    if (this.config.options.sortable) {
      this.sortByColumn(columnId);
    }
  }

  handleCellHover(cell) {
    Object.assign(cell.style, this.config.styling.states.hover);
  }

  handleCellLeave(cell) {
    const cellData = this.cellsMap.get(cell.id);
    
    // Restaurer les styles originaux
    Object.assign(cell.style, this.config.styling.cellStyle);
    if (cellData && cellData.style) {
      Object.assign(cell.style, cellData.style);
    }
  }

  // ========================================
  // 🔧 API PUBLIQUE
  // ========================================

  addRow(rowData) {
    const tbody = this.tableElement.querySelector('tbody');
    const rowIndex = this.config.rows.length;
    
    this.config.rows.push(rowData);
    const tr = this.createRow(rowData, rowIndex);
    tbody.appendChild(tr);
    
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
    const tbody = this.tableElement.querySelector('tbody');
    tbody.innerHTML = '';
    this.createBody();
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
