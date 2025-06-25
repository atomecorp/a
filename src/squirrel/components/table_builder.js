/**
 * 📊 TABLE COMPONENT - VERSION 2.0 FUNCTIONAL
 * Composant Table suivant le pattern fonctionnel de button_builder.js
 */

import { $, define } from '../squirrel.js';

// === DÉFINITION DES TEMPLATES DE BASE ===

// Template pour le conteneur principal de la table
define('table-container', {
  tag: 'div',
  class: 'hs-table',
  css: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '14px'
  }
});

// Template pour l'en-tête de la table
define('table-header', {
  tag: 'div',
  class: 'hs-table-header',
  css: {
    display: 'flex',
    flexShrink: 0,
    borderBottom: '2px solid #dee2e6',
    backgroundColor: '#343a40'
  }
});

// Template pour une cellule d'en-tête
define('table-header-cell', {
  tag: 'div',
  class: 'hs-table-header-cell',
  css: {
    padding: '12px',
    backgroundColor: '#343a40',
    color: '#ffffff',
    fontWeight: '600',
    fontSize: '14px',
    borderRight: '1px solid #495057',
    cursor: 'pointer',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  }
});

// Template pour le corps de la table
define('table-body', {
  tag: 'div',
  class: 'hs-table-body',
  css: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden'
  }
});

// Template pour une ligne
define('table-row', {
  tag: 'div',
  class: 'hs-table-row',
  css: {
    display: 'flex',
    borderBottom: '1px solid #dee2e6',
    backgroundColor: '#ffffff',
    transition: 'all 0.2s ease'
  }
});

// Template pour une cellule
define('table-cell', {
  tag: 'div',
  class: 'hs-table-cell',
  css: {
    padding: '8px 12px',
    borderRight: '1px solid #dee2e6',
    backgroundColor: '#ffffff',
    color: '#212529',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center'
  }
});

// === STYLES PRÉDÉFINIS ===

const tableStyles = {
  default: {
    headerStyle: {
      backgroundColor: '#343a40',
      color: '#ffffff'
    },
    cellStyle: {
      backgroundColor: '#ffffff',
      color: '#212529'
    },
    alternateRowStyle: {
      backgroundColor: '#f8f9fa'
    }
  },
  modern: {
    headerStyle: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: '#ffffff'
    },
    cellStyle: {
      backgroundColor: '#ffffff',
      color: '#2c3e50'
    },
    alternateRowStyle: {
      backgroundColor: '#f8f9fa'
    }
  },
  minimal: {
    headerStyle: {
      backgroundColor: '#f8f9fa',
      color: '#495057',
      borderBottom: '2px solid #dee2e6'
    },
    cellStyle: {
      backgroundColor: '#ffffff',
      color: '#212529',
      border: 'none',
      borderBottom: '1px solid #f1f3f4'
    },
    alternateRowStyle: {
      backgroundColor: '#fbfbfb'
    }
  }
};

// === COMPOSANT TABLE PRINCIPAL ===

/**
 * Crée une table entièrement skinnable
 * @param {Object} config - Configuration de la table
 * @param {string} config.id - ID personnalisé
 * @param {Array} config.columns - Colonnes de la table
 * @param {Array} config.rows - Données des lignes
 * @param {Object} config.styling - Styles personnalisés
 * @param {Object} config.options - Options fonctionnelles
 * @param {Object} config.skin - Styles personnalisés pour chaque partie
 */
const createTable = (config = {}) => {
  const {
    id,
    columns = [],
    rows = [],
    styling = {},
    options = {},
    skin = {},
    onCellClick,
    onSort,
    onRowSelect,
    position,
    size,
    attach,
    variant = 'default',
    ...otherProps
  } = config;

  // Génération d'ID unique si non fourni
  const tableId = id || `table_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Configuration par défaut fusionnée avec les styles de variante
  const defaultStyling = {
    cellPadding: 12,
    rowHeight: 40,
    ...tableStyles[variant] || tableStyles.default,
    ...styling
  };

  // État interne de la table
  const tableState = {
    cellsMap: new Map(),
    rowsMap: new Map(),
    selectedRows: new Set(),
    selectedCells: new Set(),
    sortConfig: { column: null, direction: 'asc' },
    columns: [...columns],
    rows: [...rows]
  };

  // Styles du conteneur principal
  let containerStyles = {
    width: size?.width ? `${size.width}px` : '800px',
    height: size?.height ? `${size.height}px` : '600px'
  };

  if (position) {
    containerStyles = {
      ...containerStyles,
      position: 'absolute',
      left: `${position.x}px`,
      top: `${position.y}px`
    };
  }

  // Application des styles personnalisés
  if (skin.container) {
    containerStyles = { ...containerStyles, ...skin.container };
  }

  // Création du conteneur principal
  const table = $('table-container', {
    id: tableId,
    css: containerStyles,
    ...otherProps
  });

  // Création de l'en-tête
  const header = $('table-header', {
    id: `${tableId}_header`,
    css: skin.header || {}
  });

  // Création des cellules d'en-tête
  tableState.columns.forEach((column, index) => {
    const headerCell = $('table-header-cell', {
      id: `${tableId}_header_${column.id}`,
      text: column.header || column.id,
      css: {
        width: column.width ? `${column.width}px` : 'auto',
        flex: column.width ? 'none' : '1',
        ...defaultStyling.headerStyle,
        ...column.style,
        ...(skin.headerCell || {})
      },
      onclick: () => {
        if (options.sortable !== false && column.sortable !== false) {
          handleSort(column.id);
        }
      }
    });

    // Ajouter indicateur de tri si nécessaire
    if (options.sortable !== false && column.sortable !== false) {
      const sortIndicator = document.createElement('span');
      sortIndicator.style.marginLeft = '8px';
      sortIndicator.style.opacity = '0.5';
      sortIndicator.textContent = '⇅';
      headerCell.appendChild(sortIndicator);
    }

    header.appendChild(headerCell);
  });

  // Création du corps de la table
  const body = $('table-body', {
    id: `${tableId}_body`,
    css: skin.body || {}
  });

  // Fonction pour créer une ligne
  const createRow = (rowData, rowIndex) => {
    const row = $('table-row', {
      id: `${tableId}_row_${rowData.id || rowIndex}`,
      css: {
        height: `${defaultStyling.rowHeight}px`,
        ...(rowIndex % 2 === 1 ? defaultStyling.alternateRowStyle : {}),
        ...(skin.row || {})
      }
    });

    // États interactifs
    if (options.selectable !== false) {
      row.style.cursor = 'pointer';
      
      row.addEventListener('mouseenter', () => {
        if (!tableState.selectedRows.has(rowData.id)) {
          Object.assign(row.style, defaultStyling.states?.hover || {
            backgroundColor: '#e9ecef'
          });
        }
      });

      row.addEventListener('mouseleave', () => {
        if (!tableState.selectedRows.has(rowData.id)) {
          Object.assign(row.style, rowIndex % 2 === 1 ? 
            defaultStyling.alternateRowStyle : 
            { backgroundColor: '#ffffff' }
          );
        }
      });

      row.addEventListener('click', () => {
        handleRowSelect(rowData.id, row);
      });
    }

    // Création des cellules
    tableState.columns.forEach((column, colIndex) => {
      const cellData = rowData.cells?.[column.id] || { content: '', style: {} };
      
      const cell = $('table-cell', {
        id: `${tableId}_cell_${rowData.id}_${column.id}`,
        text: cellData.content || '',
        css: {
          width: column.width ? `${column.width}px` : 'auto',
          flex: column.width ? 'none' : '1',
          ...defaultStyling.cellStyle,
          ...column.style,
          ...cellData.style,
          ...(skin.cell || {})
        },
        onclick: (event) => {
          event.stopPropagation();
          if (onCellClick) {
            onCellClick(cellData, rowIndex, colIndex);
          }
        }
      });

      tableState.cellsMap.set(`${rowData.id}_${column.id}`, {
        element: cell,
        data: cellData,
        rowId: rowData.id,
        columnId: column.id
      });

      row.appendChild(cell);
    });

    tableState.rowsMap.set(rowData.id, {
      element: row,
      data: rowData,
      index: rowIndex
    });

    return row;
  };

  // Fonction de gestion du tri
  const handleSort = (columnId) => {
    const currentDirection = tableState.sortConfig.column === columnId ? 
      tableState.sortConfig.direction : 'asc';
    const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
    
    tableState.sortConfig = { column: columnId, direction: newDirection };

    // Trier les données
    tableState.rows.sort((a, b) => {
      const aValue = a.cells?.[columnId]?.content || '';
      const bValue = b.cells?.[columnId]?.content || '';
      
      const comparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true });
      return newDirection === 'asc' ? comparison : -comparison;
    });

    // Rafraîchir l'affichage
    table.refresh();

    // Callback
    if (onSort) {
      onSort(columnId, newDirection);
    }

    // Mettre à jour les indicateurs de tri
    header.querySelectorAll('.hs-table-header-cell span').forEach(indicator => {
      indicator.textContent = '⇅';
      indicator.style.opacity = '0.5';
    });

    const activeHeader = header.querySelector(`#${tableId}_header_${columnId} span`);
    if (activeHeader) {
      activeHeader.textContent = newDirection === 'asc' ? '↑' : '↓';
      activeHeader.style.opacity = '1';
    }
  };

  // Fonction de gestion de la sélection de ligne
  const handleRowSelect = (rowId, rowElement) => {
    if (options.multiSelect) {
      if (tableState.selectedRows.has(rowId)) {
        tableState.selectedRows.delete(rowId);
        Object.assign(rowElement.style, { backgroundColor: '#ffffff' });
      } else {
        tableState.selectedRows.add(rowId);
        Object.assign(rowElement.style, defaultStyling.states?.selected || {
          backgroundColor: '#007bff',
          color: '#ffffff'
        });
      }
    } else {
      // Désélectionner toutes les autres lignes
      tableState.selectedRows.forEach(selectedId => {
        const selectedRow = tableState.rowsMap.get(selectedId);
        if (selectedRow) {
          Object.assign(selectedRow.element.style, { backgroundColor: '#ffffff' });
        }
      });
      tableState.selectedRows.clear();

      // Sélectionner la ligne actuelle
      tableState.selectedRows.add(rowId);
      Object.assign(rowElement.style, defaultStyling.states?.selected || {
        backgroundColor: '#007bff',
        color: '#ffffff'
      });
    }

    if (onRowSelect) {
      onRowSelect(rowId, Array.from(tableState.selectedRows));
    }
  };

  // Fonction pour rafraîchir la table
  table.refresh = () => {
    // Vider le corps
    body.innerHTML = '';
    
    // Recréer les lignes
    tableState.rows.forEach((rowData, index) => {
      const row = createRow(rowData, index);
      body.appendChild(row);
    });
  };

  // Méthodes utilitaires de la table
  table.addRow = (rowData) => {
    tableState.rows.push(rowData);
    const row = createRow(rowData, tableState.rows.length - 1);
    body.appendChild(row);
    return table;
  };

  table.removeRow = (rowId) => {
    const index = tableState.rows.findIndex(row => row.id === rowId);
    if (index !== -1) {
      tableState.rows.splice(index, 1);
      tableState.rowsMap.delete(rowId);
      tableState.selectedRows.delete(rowId);
      table.refresh();
    }
    return table;
  };

  table.updateCell = (rowId, columnId, newData) => {
    const cellKey = `${rowId}_${columnId}`;
    const cell = tableState.cellsMap.get(cellKey);
    if (cell) {
      cell.data = { ...cell.data, ...newData };
      cell.element.textContent = newData.content || '';
      if (newData.style) {
        Object.assign(cell.element.style, newData.style);
      }
    }
    return table;
  };

  table.getSelectedRows = () => {
    return Array.from(tableState.selectedRows);
  };

  table.clearSelection = () => {
    tableState.selectedRows.forEach(rowId => {
      const row = tableState.rowsMap.get(rowId);
      if (row) {
        Object.assign(row.element.style, { backgroundColor: '#ffffff' });
      }
    });
    tableState.selectedRows.clear();
    return table;
  };

  table.sort = (columnId, direction = 'asc') => {
    tableState.sortConfig = { column: columnId, direction };
    handleSort(columnId);
    return table;
  };

  table.getData = () => {
    return {
      columns: tableState.columns,
      rows: tableState.rows,
      selected: Array.from(tableState.selectedRows)
    };
  };

  // Assemblage de la structure
  table.appendChild(header);
  table.appendChild(body);

  // Création initiale des lignes
  table.refresh();

  // Attachement au DOM si spécifié
  if (attach) {
    const parentElement = typeof attach === 'string' ? 
      document.querySelector(attach) : attach;
    if (parentElement) {
      parentElement.appendChild(table);
    }
  }

  return table;
};

// === FACTORY FUNCTIONS POUR VARIANTES COMMUNES ===

const createModernTable = (config) => createTable({ ...config, variant: 'modern' });
const createMinimalTable = (config) => createTable({ ...config, variant: 'minimal' });

// === EXPORTS ===
export { createTable };

// Alias pour compatibilité avec l'ancien pattern
const Table = createTable;
export { Table };

// Export par défaut - fonction directe pour usage: Table({...})
export default createTable;

// Export des utilitaires supplémentaires
export {
  createModernTable,
  createMinimalTable,
  tableStyles
};
