/**
 * 📊 Table Component FIXED - Squirrel Framework
 * 
 * CORRIGE LE BUG DE GÉNÉRATION EXCESSIVE DE DIVS
 * 
 * Cette version corrigée utilise une approche cohérente :
 * - Container principal en HTML standard 
 * - Structure de table HTML native (table, thead, tbody)
 * - Pas de mélange avec l'API A pour éviter les conflits de positionnement
 * 
 * @version 1.1.0 - FIXED
 * @author Squirrel Framework Team
 */

class TableFixed {
    static tables = new Map(); // Registry of all tables
    
    constructor(config = {}) {
        // Default configuration
        this.config = {
            id: config.id || `table_${Date.now()}`,
            attach: config.attach || 'body',
            x: config.x || 0,
            y: config.y || 0,
            width: config.width || 800,
            height: config.height || 400,
            
            // Data
            columns: config.columns || [],
            data: config.data || [],
            
            // Features
            sortable: config.sortable !== false,
            filterable: config.filterable || false,
            searchable: config.searchable || false,
            editable: config.editable || false,
            selectable: config.selectable || false,
            multiSelect: config.multiSelect || false,
            resizable: config.resizable || false,
            
            // Pagination
            pagination: {
                enabled: config.pagination?.enabled || false,
                pageSize: config.pagination?.pageSize || 10,
                showInfo: config.pagination?.showInfo !== false,
                showControls: config.pagination?.showControls !== false,
                ...config.pagination
            },
            
            // Styling
            style: {
                backgroundColor: '#ffffff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '14px',
                ...config.style
            },
            
            headerStyle: {
                backgroundColor: '#f8f9fa',
                fontWeight: 'bold',
                borderBottom: '2px solid #dee2e6',
                padding: '12px 8px',
                ...config.headerStyle
            },
            
            cellStyle: {
                padding: '8px',
                borderBottom: '1px solid #dee2e6',
                ...config.cellStyle
            },
            
            rowStyle: {
                '&:hover': {
                    backgroundColor: '#f8f9fa'
                },
                ...config.rowStyle
            },
            
            stripedRows: config.stripedRows !== false,
            stripedStyle: {
                backgroundColor: '#f8f9fa',
                ...config.stripedStyle
            },
            
            // Callbacks
            callbacks: {
                onRowClick: config.callbacks?.onRowClick || (() => {}),
                onRowDoubleClick: config.callbacks?.onRowDoubleClick || (() => {}),
                onCellClick: config.callbacks?.onCellClick || (() => {}),
                onCellEdit: config.callbacks?.onCellEdit || (() => {}),
                onSort: config.callbacks?.onSort || (() => {}),
                onFilter: config.callbacks?.onFilter || (() => {}),
                onSelectionChange: config.callbacks?.onSelectionChange || (() => {}),
                onPageChange: config.callbacks?.onPageChange || (() => {}),
                ...config.callbacks
            }
        };
        
        this.id = this.config.id;
        this.selectedRows = new Set();
        this.sortOrder = { column: null, direction: 'asc' };
        this.filters = new Map();
        this.searchQuery = '';
        this.currentPage = 1;
        this.filteredData = [...this.config.data];
        this.customFilter = null;
        
        this._createTable();
        this._setupEventHandlers();
        
        // Register table
        TableFixed.tables.set(this.id, this);
        
        console.log(`📊 Table FIXED created: ${this.id} (${this.config.data.length} rows)`);
    }
    
    _createTable() {
        // Get container
        const container = typeof this.config.attach === 'string' 
            ? document.querySelector(this.config.attach)
            : this.config.attach;

        if (!container) {
            throw new Error(`Container not found: ${this.config.attach}`);
        }

        // Create main table wrapper - UTILISATION HTML STANDARD uniquement
        this.wrapper = document.createElement('div');
        this.wrapper.id = this.id;
        this.wrapper.className = 'squirrel-table-wrapper';
        
        // Apply positioning and styling
        Object.assign(this.wrapper.style, {
            position: 'absolute',
            left: `${this.config.x}px`,
            top: `${this.config.y}px`,
            width: `${this.config.width}px`,
            height: `${this.config.height}px`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            ...this.config.style
        });

        // Create toolbar if needed
        if (this.config.searchable || this.config.filterable) {
            this._createToolbar();
        }

        // Create table container
        this._createTableContainer();
        
        // Create pagination if enabled
        if (this.config.pagination.enabled) {
            this._createPagination();
        }
        
        // Append to container
        container.appendChild(this.wrapper);
        
        // Render table
        this._renderTable();
    }
    
    _createToolbar() {
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'table-toolbar';
        Object.assign(this.toolbar.style, {
            padding: '12px 16px',
            borderBottom: '1px solid #e0e0e0',
            backgroundColor: '#fafafa',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexShrink: '0'
        });

        // Search input
        if (this.config.searchable) {
            this.searchInput = document.createElement('input');
            this.searchInput.type = 'text';
            this.searchInput.placeholder = 'Search table...';
            Object.assign(this.searchInput.style, {
                width: '250px',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                outline: 'none'
            });
            
            this.toolbar.appendChild(this.searchInput);
        }

        this.wrapper.appendChild(this.toolbar);
    }
    
    _createTableContainer() {
        // Create table container
        this.tableContainer = document.createElement('div');
        this.tableContainer.className = 'table-container';
        Object.assign(this.tableContainer.style, {
            flex: '1',
            overflow: 'auto',
            position: 'relative'
        });

        // Create actual HTML table - STRUCTURE NATIVE
        this.table = document.createElement('table');
        this.table.className = 'data-table';
        Object.assign(this.table.style, {
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: 'white',
            margin: '0',
            border: 'none'
        });

        this.tableContainer.appendChild(this.table);
        this.wrapper.appendChild(this.tableContainer);
    }
    
    _createPagination() {
        this.paginationContainer = document.createElement('div');
        this.paginationContainer.className = 'table-pagination';
        Object.assign(this.paginationContainer.style, {
            padding: '12px 16px',
            borderTop: '1px solid #e0e0e0',
            backgroundColor: '#fafafa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: '0'
        });

        // Info section
        if (this.config.pagination.showInfo) {
            this.paginationInfo = document.createElement('div');
            this.paginationInfo.className = 'pagination-info';
            Object.assign(this.paginationInfo.style, {
                fontSize: '14px',
                color: '#666'
            });
            this.paginationContainer.appendChild(this.paginationInfo);
        }

        // Controls section
        if (this.config.pagination.showControls) {
            this.paginationControls = document.createElement('div');
            this.paginationControls.className = 'pagination-controls';
            Object.assign(this.paginationControls.style, {
                display: 'flex',
                gap: '8px',
                alignItems: 'center'
            });

            // Previous button
            this.prevButton = document.createElement('button');
            this.prevButton.textContent = '← Previous';
            this.prevButton.className = 'pagination-btn prev-btn';
            Object.assign(this.prevButton.style, {
                padding: '6px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                backgroundColor: 'white'
            });

            // Page numbers container
            this.pageNumbers = document.createElement('div');
            this.pageNumbers.className = 'page-numbers';
            Object.assign(this.pageNumbers.style, {
                display: 'flex',
                gap: '4px'
            });

            // Next button
            this.nextButton = document.createElement('button');
            this.nextButton.textContent = 'Next →';
            this.nextButton.className = 'pagination-btn next-btn';
            Object.assign(this.nextButton.style, {
                padding: '6px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                backgroundColor: 'white'
            });

            this.paginationControls.appendChild(this.prevButton);
            this.paginationControls.appendChild(this.pageNumbers);
            this.paginationControls.appendChild(this.nextButton);
            this.paginationContainer.appendChild(this.paginationControls);
        }

        this.wrapper.appendChild(this.paginationContainer);
    }
    
    _renderTable() {
        // Clear existing content - MÉTHODE SÛRE
        this.table.innerHTML = '';
        
        // Create header
        this._createHeader();
        
        // Create body
        this._createBody();
        
        // Update pagination
        if (this.config.pagination.enabled) {
            this._updatePagination();
        }
    }
    
    _createHeader() {
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        // Selection column
        if (this.config.selectable && this.config.multiSelect) {
            const th = document.createElement('th');
            Object.assign(th.style, {
                ...this.config.cellStyle,
                ...this.config.headerStyle,
                width: '40px',
                textAlign: 'center'
            });
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.addEventListener('change', (e) => {
                this._handleSelectAll(e.target.checked);
            });
            
            th.appendChild(checkbox);
            headerRow.appendChild(th);
        }
        
        // Column headers
        this.config.columns.forEach((column, index) => {
            const th = document.createElement('th');
            Object.assign(th.style, {
                ...this.config.cellStyle,
                ...this.config.headerStyle,
                width: column.width || 'auto',
                textAlign: column.align || 'left',
                cursor: this.config.sortable && column.sortable !== false ? 'pointer' : 'default',
                position: 'relative'
            });
            
            // Header content container
            const headerContent = document.createElement('div');
            Object.assign(headerContent.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            });
            
            // Column title
            const titleSpan = document.createElement('span');
            titleSpan.textContent = column.title;
            headerContent.appendChild(titleSpan);
            
            // Sort indicator
            if (this.config.sortable && column.sortable !== false) {
                const sortIcon = document.createElement('span');
                sortIcon.className = 'sort-icon';
                sortIcon.textContent = '↕';
                Object.assign(sortIcon.style, {
                    marginLeft: '8px',
                    opacity: '0.5',
                    fontSize: '12px'
                });
                headerContent.appendChild(sortIcon);
                
                // Sort click handler
                th.addEventListener('click', () => {
                    this._handleSort(column.key);
                });
            }
            
            // Filter input
            if (this.config.filterable && column.filterable !== false) {
                const filterInput = document.createElement('input');
                filterInput.type = 'text';
                filterInput.placeholder = `Filter ${column.title}...`;
                Object.assign(filterInput.style, {
                    width: '100%',
                    marginTop: '4px',
                    padding: '4px 6px',
                    border: '1px solid #ddd',
                    borderRadius: '2px',
                    fontSize: '11px'
                });
                
                filterInput.addEventListener('input', (e) => {
                    this._handleFilter(column.key, e.target.value);
                });
                
                th.appendChild(document.createElement('br'));
                th.appendChild(filterInput);
            }
            
            th.appendChild(headerContent);
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        this.table.appendChild(thead);
    }
    
    _createBody() {
        const tbody = document.createElement('tbody');
        
        const pageData = this._getCurrentPageData();
        
        pageData.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            tr.dataset.rowIndex = rowIndex;
            tr.className = 'data-row';
            
            // Apply row styling
            Object.assign(tr.style, {
                ...this.config.rowStyle,
                ...(this.config.stripedRows && rowIndex % 2 === 1 ? this.config.stripedStyle : {})
            });
            
            // Add hover effect
            tr.addEventListener('mouseenter', () => {
                if (!this.selectedRows.has(rowIndex)) {
                    tr.style.backgroundColor = '#f8f9fa';
                }
            });
            
            tr.addEventListener('mouseleave', () => {
                if (!this.selectedRows.has(rowIndex)) {
                    tr.style.backgroundColor = this.config.stripedRows && rowIndex % 2 === 1 
                        ? this.config.stripedStyle.backgroundColor || '#f8f9fa'
                        : 'white';
                }
            });
            
            // Selection column
            if (this.config.selectable && this.config.multiSelect) {
                const td = document.createElement('td');
                Object.assign(td.style, {
                    ...this.config.cellStyle,
                    textAlign: 'center'
                });
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = this.selectedRows.has(rowIndex);
                checkbox.addEventListener('change', (e) => {
                    this._handleRowSelect(rowIndex, e.target.checked);
                });
                
                td.appendChild(checkbox);
                tr.appendChild(td);
            }
            
            // Data columns
            this.config.columns.forEach((column) => {
                const td = document.createElement('td');
                Object.assign(td.style, {
                    ...this.config.cellStyle,
                    textAlign: column.align || 'left'
                });
                
                let cellValue = row[column.key];
                
                // Format cell value
                if (column.formatter && typeof column.formatter === 'function') {
                    cellValue = column.formatter(cellValue, row, rowIndex);
                }
                
                // Handle different value types
                if (typeof cellValue === 'object' && cellValue !== null) {
                    if (cellValue.type === 'html') {
                        td.innerHTML = cellValue.content;
                    } else {
                        td.textContent = JSON.stringify(cellValue);
                    }
                } else {
                    td.textContent = cellValue || '';
                }
                
                // Cell click handler
                td.addEventListener('click', (e) => {
                    this.config.callbacks.onCellClick(cellValue, row, rowIndex, column.key, e);
                    e.stopPropagation();
                });
                
                tr.appendChild(td);
            });
            
            // Row click handler
            tr.addEventListener('click', (e) => {
                if (this.config.selectable && !this.config.multiSelect) {
                    this._handleRowSelect(rowIndex, true);
                }
                this.config.callbacks.onRowClick(row, rowIndex, e);
            });
            
            // Row double click handler
            tr.addEventListener('dblclick', (e) => {
                this.config.callbacks.onRowDoubleClick(row, rowIndex, e);
            });
            
            tbody.appendChild(tr);
        });
        
        this.table.appendChild(tbody);
    }
    
    _getCurrentPageData() {
        if (!this.config.pagination.enabled) {
            return this.filteredData;
        }
        
        const pageSize = this.config.pagination.pageSize;
        const start = (this.currentPage - 1) * pageSize;
        const end = start + pageSize;
        
        return this.filteredData.slice(start, end);
    }
    
    _updatePagination() {
        if (!this.config.pagination.enabled) return;
        
        const totalItems = this.filteredData.length;
        const pageSize = this.config.pagination.pageSize;
        const totalPages = Math.ceil(totalItems / pageSize);
        const start = (this.currentPage - 1) * pageSize + 1;
        const end = Math.min(start + pageSize - 1, totalItems);
        
        // Update info
        if (this.paginationInfo) {
            this.paginationInfo.textContent = `Showing ${start}-${end} of ${totalItems} items`;
        }
        
        // Update controls
        if (this.paginationControls) {
            this.prevButton.disabled = this.currentPage === 1;
            this.nextButton.disabled = this.currentPage === totalPages;
            
            // Update page numbers
            this.pageNumbers.innerHTML = '';
            const maxPages = 5;
            let startPage = Math.max(1, this.currentPage - Math.floor(maxPages / 2));
            let endPage = Math.min(totalPages, startPage + maxPages - 1);
            
            if (endPage - startPage < maxPages - 1) {
                startPage = Math.max(1, endPage - maxPages + 1);
            }
            
            for (let i = startPage; i <= endPage; i++) {
                const pageBtn = document.createElement('button');
                pageBtn.textContent = i;
                pageBtn.className = 'page-btn';
                Object.assign(pageBtn.style, {
                    padding: '6px 10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    backgroundColor: i === this.currentPage ? '#007bff' : 'white',
                    color: i === this.currentPage ? 'white' : 'black'
                });
                
                pageBtn.addEventListener('click', () => {
                    this.currentPage = i;
                    this._renderTable();
                });
                
                this.pageNumbers.appendChild(pageBtn);
            }
        }
    }
    
    _setupEventHandlers() {
        // Search functionality
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this._applyFilters();
                this.currentPage = 1;
                this._renderTable();
            });
        }
        
        // Pagination controls
        if (this.prevButton) {
            this.prevButton.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this._renderTable();
                }
            });
        }
        
        if (this.nextButton) {
            this.nextButton.addEventListener('click', () => {
                const totalPages = Math.ceil(this.filteredData.length / this.config.pagination.pageSize);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this._renderTable();
                }
            });
        }
    }
    
    _applyFilters() {
        this.filteredData = this.config.data.filter(row => {
            // Search filter
            if (this.searchQuery) {
                const searchMatch = this.config.columns.some(column => {
                    const value = row[column.key];
                    return value && value.toString().toLowerCase().includes(this.searchQuery);
                });
                if (!searchMatch) return false;
            }
            
            // Column filters
            for (const [columnKey, filterValue] of this.filters) {
                if (filterValue) {
                    const cellValue = row[columnKey];
                    if (!cellValue || !cellValue.toString().toLowerCase().includes(filterValue.toLowerCase())) {
                        return false;
                    }
                }
            }
            
            // Custom filter
            if (this.customFilter && typeof this.customFilter === 'function') {
                return this.customFilter(row);
            }
            
            return true;
        });
    }
    
    _handleSort(columnKey) {
        if (this.sortOrder.column === columnKey) {
            this.sortOrder.direction = this.sortOrder.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortOrder.column = columnKey;
            this.sortOrder.direction = 'asc';
        }
        
        this._sortData();
        this._renderTable();
        this.config.callbacks.onSort(columnKey, this.sortOrder.direction);
    }
    
    _sortData() {
        const { column, direction } = this.sortOrder;
        if (!column) return;
        
        this.filteredData.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];
            
            // Handle null/undefined values
            if (aVal == null) aVal = '';
            if (bVal == null) bVal = '';
            
            // Convert to strings for comparison
            aVal = aVal.toString();
            bVal = bVal.toString();
            
            // Numeric comparison if both values are numbers
            if (!isNaN(aVal) && !isNaN(bVal)) {
                aVal = parseFloat(aVal);
                bVal = parseFloat(bVal);
            }
            
            if (direction === 'asc') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            } else {
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            }
        });
    }
    
    _handleFilter(columnKey, filterValue) {
        if (filterValue) {
            this.filters.set(columnKey, filterValue);
        } else {
            this.filters.delete(columnKey);
        }
        
        this._applyFilters();
        this.currentPage = 1;
        this._renderTable();
        this.config.callbacks.onFilter(columnKey, filterValue);
    }
    
    _handleRowSelect(rowIndex, selected) {
        if (selected) {
            if (!this.config.multiSelect) {
                this.selectedRows.clear();
            }
            this.selectedRows.add(rowIndex);
        } else {
            this.selectedRows.delete(rowIndex);
        }
        
        this._renderTable();
        this.config.callbacks.onSelectionChange(Array.from(this.selectedRows));
    }
    
    _handleSelectAll(selected) {
        if (selected) {
            this._getCurrentPageData().forEach((_, index) => {
                this.selectedRows.add(index);
            });
        } else {
            this.selectedRows.clear();
        }
        
        this._renderTable();
        this.config.callbacks.onSelectionChange(Array.from(this.selectedRows));
    }
    
    // Public API Methods
    search(searchTerm) {
        this.searchQuery = searchTerm.toLowerCase();
        if (this.searchInput) {
            this.searchInput.value = searchTerm;
        }
        this._applyFilters();
        this.currentPage = 1;
        this._renderTable();
        return this;
    }
    
    sort(columnKey, direction = 'asc') {
        this.sortOrder = { column: columnKey, direction };
        this._sortData();
        this._renderTable();
        return this;
    }
    
    reset() {
        this.searchQuery = '';
        this.filters.clear();
        this.selectedRows.clear();
        this.sortOrder = { column: null, direction: 'asc' };
        this.currentPage = 1;
        this.filteredData = [...this.config.data];
        
        if (this.searchInput) {
            this.searchInput.value = '';
        }
        
        this._renderTable();
        return this;
    }
    
    destroy() {
        if (this.wrapper && this.wrapper.parentNode) {
            this.wrapper.parentNode.removeChild(this.wrapper);
        }
        TableFixed.tables.delete(this.id);
        console.log(`🗑️ Table FIXED destroyed: ${this.id}`);
    }
    
    // Getter for the main element
    getElement() {
        return this.wrapper;
    }
}

export default TableFixed;
