import { $ } from '../squirrel.js';
import { tableStyles } from './table_visual_contract.js';

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

  const tableId = id || `table_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const defaultStyling = {
    rowHeight: 40,
    ...tableStyles[variant] || tableStyles.default,
    ...styling
  };

  const tableState = {
    cellsMap: new Map(),
    rowsMap: new Map(),
    selectedRows: new Set(),
    sortConfig: { column: null, direction: 'asc' },
    columns: [...columns],
    rows: [...rows]
  };

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

  if (skin.container) {
    containerStyles = { ...containerStyles, ...skin.container };
  }

  const table = $('table-container', {
    id: tableId,
    css: containerStyles,
    ...otherProps
  });

  const header = $('table-header', {
    id: `${tableId}_header`,
    css: skin.header || {}
  });

  tableState.columns.forEach((column) => {
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

    if (options.sortable !== false && column.sortable !== false) {
      const sortIndicator = document.createElement('span');
      sortIndicator.style.marginLeft = '8px';
      sortIndicator.style.opacity = '0.5';
      sortIndicator.textContent = '⇅';
      headerCell.appendChild(sortIndicator);
    }

    header.appendChild(headerCell);
  });

  const body = $('table-body', {
    id: `${tableId}_body`,
    css: skin.body || {}
  });

  const createRow = (rowData, rowIndex) => {
    const row = $('table-row', {
      id: `${tableId}_row_${rowData.id || rowIndex}`,
      css: {
        height: `${defaultStyling.rowHeight}px`,
        ...(rowIndex % 2 === 1 ? defaultStyling.alternateRowStyle : {}),
        ...(skin.row || {})
      }
    });

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

  const handleSort = (columnId) => {
    const currentDirection = tableState.sortConfig.column === columnId ? 
      tableState.sortConfig.direction : 'asc';
    const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
    
    tableState.sortConfig = { column: columnId, direction: newDirection };

    tableState.rows.sort((a, b) => {
      const aValue = a.cells?.[columnId]?.content || '';
      const bValue = b.cells?.[columnId]?.content || '';
      
      const comparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true });
      return newDirection === 'asc' ? comparison : -comparison;
    });

    table.refresh();

    if (onSort) {
      onSort(columnId, newDirection);
    }

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
      tableState.selectedRows.forEach(selectedId => {
        const selectedRow = tableState.rowsMap.get(selectedId);
        if (selectedRow) {
          Object.assign(selectedRow.element.style, { backgroundColor: '#ffffff' });
        }
      });
      tableState.selectedRows.clear();

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

  table.refresh = () => {
    body.innerHTML = '';
    
    tableState.rows.forEach((rowData, index) => {
      const row = createRow(rowData, index);
      body.appendChild(row);
    });
  };

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

  table.appendChild(header);
  table.appendChild(body);

  table.refresh();

  if (attach) {
    const parentElement = typeof attach === 'string' ? 
      document.querySelector(attach) : attach;
    if (parentElement) {
      parentElement.appendChild(table);
    }
  }

  return table;
};

const createModernTable = (config) => createTable({ ...config, variant: 'modern' });
const createMinimalTable = (config) => createTable({ ...config, variant: 'minimal' });

export { createTable };

const Table = createTable;
export { Table };

export default createTable;

export {
  createModernTable,
  createMinimalTable,
  tableStyles
};
