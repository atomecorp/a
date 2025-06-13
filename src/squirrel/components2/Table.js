/**
 * 📊 Table Web Component - Squirrel Framework
 * 
 * Modern Web Component avec système de particules modernes:
 * - Particules partagées pour propriétés communes (x, y, width, height, etc.)
 * - Multiple shadows (boxShadow arrays) pour effets relief
 * - CSS gradients pour backgrounds sophistiqués
 * - Advanced animations and transitions avec particules
 * - Auto-attachment et positioning avec particules
 * - Interactive callbacks and cell-level styling
 * - Bombé effects with internal/external shadows
 * - Performance ultra-moderne avec batch processing
 * 
 * @version 3.0.0 - MODERN PARTICLE SYSTEM
 * @author Squirrel Framework Team
 */

// Import du système centralisé
import BaseComponent from './BaseComponent.js';

class Table extends BaseComponent {
    static tables = new Map(); // Registry of all tables
    
    constructor(config = {}) {
        super(); // Appeler le constructeur de BaseComponent
        
        // Traiter d'abord la configuration commune via BaseComponent
        this.processCommonConfig(config);
        
        // Default configuration with full CSS properties support
        this.config = this.mergeConfig(config);
        
        this.id = this.config.id;
        this.selectedRows = new Set();
        this.selectedCells = new Set();
        this.sortOrder = { column: null, direction: 'asc' };
        this.filters = new Map();
        this.searchQuery = '';
        this.currentPage = 1;
        this.filteredData = [...this.config.data];
        this.customFilter = null;
        
        // Create shadow DOM for encapsulation
        this.attachShadow({ mode: 'open' });
        
        this._createTable();
        this._setupEventHandlers();
        
        // Auto-attachment if specified
        if (this.config.attach) {
            this.performAutoAttach();
        }
        
        // Apply positioning with modern particles
        this.applyModernPositioning();
        
        // Register table
        Table.tables.set(this.id, this);
        
        console.log(`📊 Table Web Component created: ${this.id} (${this.config.data.length} rows) - MODERN PARTICLES ENABLED`);
    }
    
    mergeConfig(config) {
        const defaultConfig = {
            id: `table_${Date.now()}`,
            attach: null,
            x: undefined,
            y: undefined,
            width: 800,
            height: 400,
            
            // Data
            columns: [],
            data: [],
            
            // Features
            sortable: true,
            filterable: false,
            searchable: false,
            editable: false,
            selectable: false,
            multiSelect: false,
            resizable: false,
            
            // Pagination
            pagination: {
                enabled: false,
                pageSize: 10,
                showInfo: true,
                showControls: true
            },
            
            // Advanced styling with full CSS properties support
            style: {
                backgroundColor: '#ffffff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '14px',
                background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
                transition: 'all 0.3s ease'
            },
            
            headerStyle: {
                backgroundColor: '#f8f9fa',
                background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                fontWeight: 'bold',
                borderBottom: '2px solid #dee2e6',
                padding: '12px 8px',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
                transition: 'all 0.2s ease'
            },
            
            cellStyle: {
                padding: '8px',
                borderBottom: '1px solid #dee2e6',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                // Support for multiple shadows (bombé effect)
                boxShadow: [
                    '0 1px 3px rgba(0,0,0,0.12)',
                    'inset 0 1px 0 rgba(255,255,255,0.3)'
                ]
            },
            
            cellHoverStyle: {
                backgroundColor: '#f8f9fa',
                background: 'linear-gradient(135deg, #f8f9fa 0%, #e3f2fd 100%)',
                transform: 'scale(1.02)',
                boxShadow: [
                    '0 4px 8px rgba(0,0,0,0.15)',
                    'inset 0 1px 0 rgba(255,255,255,0.5)',
                    'inset 0 -1px 0 rgba(0,0,0,0.1)'
                ]
            },
            
            cellSelectedStyle: {
                backgroundColor: '#e3f2fd',
                background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                boxShadow: [
                    '0 4px 12px rgba(33,150,243,0.3)',
                    'inset 0 2px 4px rgba(33,150,243,0.2)'
                ]
            },
            
            rowStyle: {
                transition: 'all 0.2s ease'
            },
            
            stripedRows: true,
            stripedStyle: {
                backgroundColor: '#f8f9fa',
                background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)'
            },
            
            // Animation configuration
            animations: {
                cellHover: {
                    duration: '0.2s',
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
                },
                cellSelect: {
                    duration: '0.3s',
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
                }
            },
            
            // 🚀 CONFIGURATION MODERNE DES PARTICULES
            modernParticles: {
                // Activer le système moderne
                enabled: true,
                batchUpdates: true,
                performanceMonitoring: false,
                
                // Particules communes par défaut
                defaultParticles: {
                    smooth: true,
                    responsive: true,
                    optimize: true,
                    glow: false,
                    animate: {
                        type: 'smooth',
                        duration: 300,
                        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
                    }
                },
                
                // Configuration de fallback
                fallback: {
                    enableFrameworkA: true,
                    enableCSSDirect: true,
                    logErrors: true
                }
            },
            
            // Callbacks
            callbacks: {
                onRowClick: () => {},
                onRowDoubleClick: () => {},
                onCellClick: () => {},
                onCellHover: () => {},
                onCellLeave: () => {},
                onCellEdit: () => {},
                onSort: () => {},
                onFilter: () => {},
                onSelectionChange: () => {},
                onPageChange: () => {}
            }
        };
        
        // Deep merge with user config
        return {
            ...defaultConfig,
            ...config,
            x: config.x !== undefined ? config.x : defaultConfig.x,
            y: config.y !== undefined ? config.y : defaultConfig.y,
            width: config.width !== undefined ? config.width : defaultConfig.width,
            height: config.height !== undefined ? config.height : defaultConfig.height,
            pagination: { ...defaultConfig.pagination, ...config.pagination },
            style: { ...defaultConfig.style, ...config.style },
            headerStyle: { ...defaultConfig.headerStyle, ...config.headerStyle },
            cellStyle: { ...defaultConfig.cellStyle, ...config.cellStyle },
            cellHoverStyle: { ...defaultConfig.cellHoverStyle, ...config.cellHoverStyle },
            cellSelectedStyle: { ...defaultConfig.cellSelectedStyle, ...config.cellSelectedStyle },
            rowStyle: { ...defaultConfig.rowStyle, ...config.rowStyle },
            stripedStyle: { ...defaultConfig.stripedStyle, ...config.stripedStyle },
            animations: { ...defaultConfig.animations, ...config.animations },
            callbacks: { ...defaultConfig.callbacks, ...config.callbacks }
        };
    }
    
    performAutoAttach() {
        if (!this.config.attach) return;
        
        this._doAttach();
    }
    
    _doAttach() {
        let container;
        
        if (this.config.attach === 'body') {
            container = document.body;
        } else if (typeof this.config.attach === 'string') {
            container = document.querySelector(this.config.attach);
        } else if (this.config.attach instanceof HTMLElement) {
            container = this.config.attach;
        }
        
        if (container && !this.parentElement) {
            container.appendChild(this);
        }
    }
    
    applyPositioning() {
        if (this.config.x !== undefined && this.config.y !== undefined) {
            this.style.position = 'absolute';
            this.style.left = `${this.config.x}px`;
            this.style.top = `${this.config.y}px`;
            this.setAttribute('style', `position: absolute; left: ${this.config.x}px; top: ${this.config.y}px; width: ${this.config.width}px; height: ${this.config.height}px;`);
        } else {
            this.style.width = `${this.config.width}px`;
            this.style.height = `${this.config.height}px`;
        }
    }
    
    _createTable() {
        // Create styles for shadow DOM
        const styles = this._generateStyles();
        
        // Create main wrapper
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'table-wrapper';
        this.wrapper.id = this.id;
        
        // Create toolbar if needed
        if (this.config.searchable || this.config.filterable) {
            this._createToolbar();
        }
        
        // Create table container
        this.tableContainer = document.createElement('div');
        this.tableContainer.className = 'table-container';
        
        // Create HTML table structure
        this.table = document.createElement('table');
        this.table.className = 'data-table';
        
        this.thead = document.createElement('thead');
        this.tbody = document.createElement('tbody');
        
        this.table.appendChild(this.thead);
        this.table.appendChild(this.tbody);
        this.tableContainer.appendChild(this.table);
        this.wrapper.appendChild(this.tableContainer);
        
        // Create pagination if needed
        if (this.config.pagination.enabled) {
            this._createPagination();
        }
        
        // Append to shadow DOM
        this.shadowRoot.appendChild(styles);
        this.shadowRoot.appendChild(this.wrapper);
        
        // Generate headers and data
        this._generateHeaders();
        this._generateRows();
    }
    
    _generateStyles() {
        const style = document.createElement('style');
        
        // Helper function to handle boxShadow arrays
        const formatShadow = (shadow) => {
            if (Array.isArray(shadow)) {
                return shadow.join(', ');
            }
            return shadow || '';
        };
        
        // Helper function to generate CSS from style object
        const objectToCSS = (obj) => {
            return Object.entries(obj).map(([key, value]) => {
                // Convert camelCase to kebab-case
                const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                
                // Handle special cases
                if (key === 'boxShadow') {
                    value = formatShadow(value);
                }
                
                return `${cssKey}: ${value};`;
            }).join('\n    ');
        };
        
        style.textContent = `
            .table-wrapper {
                ${objectToCSS(this.config.style)}
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-sizing: border-box;
            }
            
            .table-container {
                flex: 1;
                overflow: auto;
                position: relative;
            }
            
            .data-table {
                width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                background: transparent;
            }
            
            .data-table th {
                ${objectToCSS(this.config.headerStyle)}
                position: sticky;
                top: 0;
                z-index: 10;
                user-select: none;
                white-space: nowrap;
            }
            
            .data-table th:first-child {
                border-top-left-radius: 8px;
            }
            
            .data-table th:last-child {
                border-top-right-radius: 8px;
            }
            
            .data-table th.sortable {
                cursor: pointer;
            }
            
            .data-table th.sortable:hover {
                background: linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%);
                transform: translateY(-1px);
            }
            
            .data-table td {
                ${objectToCSS(this.config.cellStyle)}
                position: relative;
                box-sizing: border-box;
            }
            
            .data-table td:hover {
                ${objectToCSS(this.config.cellHoverStyle)}
                animation: cellHover ${this.config.animations.cellHover.duration} ${this.config.animations.cellHover.easing};
            }
            
            .data-table td.selected {
                ${objectToCSS(this.config.cellSelectedStyle)}
                animation: cellSelect ${this.config.animations.cellSelect.duration} ${this.config.animations.cellSelect.easing};
            }
            
            .data-table tr {
                ${objectToCSS(this.config.rowStyle)}
            }
            
            .data-table tr.striped {
                ${objectToCSS(this.config.stripedStyle)}
            }
            
            .data-table tr.selected {
                background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
            }
            
            .toolbar {
                padding: 12px;
                border-bottom: 1px solid #dee2e6;
                background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
                display: flex;
                gap: 12px;
                align-items: center;
            }
            
            .search-input {
                padding: 8px 12px;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                background: white;
                box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
                transition: all 0.2s ease;
            }
            
            .search-input:focus {
                outline: none;
                border-color: #2196f3;
                box-shadow: 0 0 0 2px rgba(33,150,243,0.2);
            }
            
            .pagination {
                padding: 12px;
                border-top: 1px solid #dee2e6;
                background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .pagination-controls {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            
            .pagination-btn {
                padding: 6px 12px;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                background: white;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }
            
            .pagination-btn:hover:not(:disabled) {
                background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0,0,0,0.15);
            }
            
            .pagination-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .sort-indicator {
                margin-left: 8px;
                font-size: 12px;
                color: #666;
            }
            
            @keyframes cellHover {
                0% { transform: scale(1); }
                50% { transform: scale(1.02); }
                100% { transform: scale(1.02); }
            }
            
            @keyframes cellSelect {
                0% { transform: scale(1); }
                50% { transform: scale(1.05); }
                100% { transform: scale(1.02); }
            }
            
            /* Responsive design */
            @media (max-width: 768px) {
                .table-wrapper {
                    font-size: 12px;
                }
                
                .data-table th,
                .data-table td {
                    padding: 6px;
                }
                
                .toolbar {
                    flex-direction: column;
                    align-items: stretch;
                }
            }
        `;
        
        return style;
    }
    
    _generateHeaders() {
        const headerRow = document.createElement('tr');
        
        // Selection column
        if (this.config.selectable && this.config.multiSelect) {
            const th = document.createElement('th');
            th.style.width = '40px';
            th.style.textAlign = 'center';
            
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
            th.style.width = column.width || 'auto';
            th.style.textAlign = column.align || 'left';
            
            if (this.config.sortable && column.sortable !== false) {
                th.classList.add('sortable');
                th.addEventListener('click', () => this._handleSort(column.key));
            }
            
            // Header content
            const headerContent = document.createElement('div');
            headerContent.style.display = 'flex';
            headerContent.style.alignItems = 'center';
            headerContent.style.justifyContent = 'space-between';
            
            const titleSpan = document.createElement('span');
            titleSpan.textContent = column.title;
            headerContent.appendChild(titleSpan);
            
            // Sort indicator
            if (this.config.sortable && column.sortable !== false) {
                const sortIcon = document.createElement('span');
                sortIcon.className = 'sort-indicator';
                if (this.sortOrder.column === column.key) {
                    sortIcon.textContent = this.sortOrder.direction === 'asc' ? '↑' : '↓';
                } else {
                    sortIcon.textContent = '↕';
                }
                headerContent.appendChild(sortIcon);
            }
            
            th.appendChild(headerContent);
            headerRow.appendChild(th);
        });
        
        this.thead.appendChild(headerRow);
    }
    
    _generateRows() {
        // Clear existing rows
        this.tbody.innerHTML = '';
        
        // Get paginated data
        const data = this._getPaginatedData();
        
        data.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            tr.dataset.rowIndex = rowIndex;
            
            // Apply striped styling
            if (this.config.stripedRows && rowIndex % 2 === 1) {
                tr.classList.add('striped');
            }
            
            // Selection column
            if (this.config.selectable) {
                const td = document.createElement('td');
                td.style.width = '40px';
                td.style.textAlign = 'center';
                
                if (this.config.multiSelect) {
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = this.selectedRows.has(rowIndex);
                    checkbox.addEventListener('change', (e) => {
                        this._handleRowSelection(rowIndex, e.target.checked);
                    });
                    td.appendChild(checkbox);
                } else {
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = `${this.id}_selection`;
                    radio.checked = this.selectedRows.has(rowIndex);
                    radio.addEventListener('change', (e) => {
                        if (e.target.checked) {
                            this.selectedRows.clear();
                            this._handleRowSelection(rowIndex, true);
                        }
                    });
                    td.appendChild(radio);
                }
                
                tr.appendChild(td);
            }
            
            // Data columns
            this.config.columns.forEach((column, colIndex) => {
                const td = document.createElement('td');
                td.dataset.columnKey = column.key;
                td.dataset.rowIndex = rowIndex;
                td.dataset.colIndex = colIndex;
                
                // Get cell value
                let value = this._getCellValue(row, column.key);
                
                // Apply column renderer/formatter if available
                if (column.render && typeof column.render === 'function') {
                    const rendered = column.render(value, row, rowIndex);
                    if (typeof rendered === 'string') {
                        td.innerHTML = rendered;
                    } else if (rendered instanceof HTMLElement) {
                        td.appendChild(rendered);
                    } else {
                        td.textContent = rendered;
                    }
                } else if (column.formatter && typeof column.formatter === 'function') {
                    // Support for legacy formatter API
                    const formatted = column.formatter(value, row, rowIndex);
                    if (formatted && typeof formatted === 'object' && formatted.type === 'html') {
                        td.innerHTML = formatted.content;
                    } else if (typeof formatted === 'string') {
                        td.innerHTML = formatted;
                    } else {
                        td.textContent = formatted;
                    }
                } else {
                    td.textContent = value;
                }
                
                // Apply cell styling
                td.style.textAlign = column.align || 'left';
                
                // Cell event handlers
                td.addEventListener('click', (e) => {
                    this._handleCellClick(td, row, column, rowIndex, colIndex, e);
                });
                
                td.addEventListener('mouseenter', (e) => {
                    this._handleCellHover(td, row, column, rowIndex, colIndex, e);
                });
                
                td.addEventListener('mouseleave', (e) => {
                    this._handleCellLeave(td, row, column, rowIndex, colIndex, e);
                });
                
                tr.appendChild(td);
            });
            
            // Row event handlers
            tr.addEventListener('click', (e) => {
                this._handleRowClick(tr, row, rowIndex, e);
            });
            
            tr.addEventListener('dblclick', (e) => {
                this._handleRowDoubleClick(tr, row, rowIndex, e);
            });
            
            this.tbody.appendChild(tr);
        });
    }
    
    _setupEventHandlers() {
        // This method is called after table creation to set up global event handlers
        // Most event handlers are already set up in _generateHeaders and _generateRows
        
        // Handle window resize for responsive behavior
        window.addEventListener('resize', () => {
            this._handleResize();
        });
    }
    
    _createToolbar() {
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'toolbar';
        
        // Search input
        if (this.config.searchable) {
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Search...';
            searchInput.className = 'search-input';
            searchInput.addEventListener('input', (e) => {
                this._handleSearch(e.target.value);
            });
            this.toolbar.appendChild(searchInput);
        }
        
        // Filter controls would go here if needed
        if (this.config.filterable) {
            // Add filter controls
            const filterLabel = document.createElement('label');
            filterLabel.textContent = 'Filter: ';
            this.toolbar.appendChild(filterLabel);
        }
        
        this.wrapper.appendChild(this.toolbar);
    }
    
    _createPagination() {
        this.paginationContainer = document.createElement('div');
        this.paginationContainer.className = 'pagination';
        
        // Page info
        this.pageInfo = document.createElement('div');
        this.pageInfo.className = 'pagination-info';
        this.paginationContainer.appendChild(this.pageInfo);
        
        // Pagination controls
        this.paginationControls = document.createElement('div');
        this.paginationControls.className = 'pagination-controls';
        
        // Previous button
        this.prevButton = document.createElement('button');
        this.prevButton.textContent = '← Previous';
        this.prevButton.className = 'pagination-btn';
        this.prevButton.addEventListener('click', () => this._goToPreviousPage());
        
        // Page numbers
        this.pageNumbers = document.createElement('div');
        this.pageNumbers.className = 'page-numbers';
        
        // Next button
        this.nextButton = document.createElement('button');
        this.nextButton.textContent = 'Next →';
        this.nextButton.className = 'pagination-btn';
        this.nextButton.addEventListener('click', () => this._goToNextPage());
        
        this.paginationControls.appendChild(this.prevButton);
        this.paginationControls.appendChild(this.pageNumbers);
        this.paginationControls.appendChild(this.nextButton);
        this.paginationContainer.appendChild(this.paginationControls);
        
        this.wrapper.appendChild(this.paginationContainer);
    }
    
    // Event Handlers
    _handleCellClick(cell, row, column, rowIndex, colIndex, event) {
        // Toggle cell selection
        const cellId = `${rowIndex}-${colIndex}`;
        if (this.selectedCells.has(cellId)) {
            this.selectedCells.delete(cellId);
            cell.classList.remove('selected');
        } else {
            this.selectedCells.add(cellId);
            cell.classList.add('selected');
        }
        
        // Call user callback
        this.config.callbacks.onCellClick(cell, row, column, rowIndex, colIndex, event);
    }
    
    _handleCellHover(cell, row, column, rowIndex, colIndex, event) {
        // Call user callback
        this.config.callbacks.onCellHover(cell, row, column, rowIndex, colIndex, event);
    }
    
    _handleCellLeave(cell, row, column, rowIndex, colIndex, event) {
        // Call user callback
        this.config.callbacks.onCellLeave(cell, row, column, rowIndex, colIndex, event);
    }
    
    _handleRowClick(tr, row, rowIndex, event) {
        // Toggle row selection if selectable
        if (this.config.selectable) {
            this._handleRowSelection(rowIndex, !this.selectedRows.has(rowIndex));
        }
        
        // Call user callback
        this.config.callbacks.onRowClick(tr, row, rowIndex, event);
    }
    
    _handleRowDoubleClick(tr, row, rowIndex, event) {
        // Call user callback
        this.config.callbacks.onRowDoubleClick(tr, row, rowIndex, event);
    }
    
    _handleRowSelection(rowIndex, selected) {
        if (selected) {
            if (!this.config.multiSelect) {
                this.selectedRows.clear();
                // Remove selected class from all rows
                this.tbody.querySelectorAll('tr.selected').forEach(tr => {
                    tr.classList.remove('selected');
                });
            }
            this.selectedRows.add(rowIndex);
            const tr = this.tbody.querySelector(`tr[data-row-index="${rowIndex}"]`);
            if (tr) tr.classList.add('selected');
        } else {
            this.selectedRows.delete(rowIndex);
            const tr = this.tbody.querySelector(`tr[data-row-index="${rowIndex}"]`);
            if (tr) tr.classList.remove('selected');
        }
        
        // Call user callback
        this.config.callbacks.onSelectionChange(Array.from(this.selectedRows));
    }
    
    _handleSelectAll(selectAll) {
        const visibleData = this._getPaginatedData();
        
        if (selectAll) {
            visibleData.forEach((row, index) => {
                this.selectedRows.add(index);
                const tr = this.tbody.querySelector(`tr[data-row-index="${index}"]`);
                if (tr) tr.classList.add('selected');
                const checkbox = tr.querySelector('input[type="checkbox"]');
                if (checkbox) checkbox.checked = true;
            });
        } else {
            this.selectedRows.clear();
            this.tbody.querySelectorAll('tr.selected').forEach(tr => {
                tr.classList.remove('selected');
                const checkbox = tr.querySelector('input[type="checkbox"]');
                if (checkbox) checkbox.checked = false;
            });
        }
        
        // Call user callback
        this.config.callbacks.onSelectionChange(Array.from(this.selectedRows));
    }
    
    _handleSort(columnKey) {
        if (this.sortOrder.column === columnKey) {
            this.sortOrder.direction = this.sortOrder.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortOrder.column = columnKey;
            this.sortOrder.direction = 'asc';
        }
        
        // Sort data
        this.filteredData.sort((a, b) => {
            const aVal = this._getCellValue(a, columnKey);
            const bVal = this._getCellValue(b, columnKey);
            
            if (aVal < bVal) return this.sortOrder.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.sortOrder.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        // Regenerate headers and rows
        this._generateHeaders();
        this._generateRows();
        
        // Call user callback
        this.config.callbacks.onSort(columnKey, this.sortOrder.direction);
    }
    
    _handleSearch(query) {
        this.searchQuery = query;
        this._applyFilters();
        this._generateRows();
        
        // Reset to first page
        this.currentPage = 1;
        if (this.config.pagination.enabled) {
            this._updatePagination();
        }
    }
    
    _handleResize() {
        // Handle responsive behavior if needed
    }
    
    // Pagination methods
    _goToPreviousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this._generateRows();
            this._updatePagination();
            this.config.callbacks.onPageChange(this.currentPage);
        }
    }
    
    _goToNextPage() {
        const totalPages = this._getTotalPages();
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this._generateRows();
            this._updatePagination();
            this.config.callbacks.onPageChange(this.currentPage);
        }
    }
    
    _updatePagination() {
        if (!this.config.pagination.enabled) return;
        
        const totalPages = this._getTotalPages();
        const start = (this.currentPage - 1) * this.config.pagination.pageSize + 1;
        const end = Math.min(this.currentPage * this.config.pagination.pageSize, this.filteredData.length);
        
        // Update page info
        this.pageInfo.textContent = `Showing ${start}-${end} of ${this.filteredData.length} entries`;
        
        // Update buttons
        this.prevButton.disabled = this.currentPage === 1;
        this.nextButton.disabled = this.currentPage === totalPages;
        
        // Update page numbers
        this.pageNumbers.innerHTML = '';
        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.textContent = i;
            pageBtn.className = 'pagination-btn';
            if (i === this.currentPage) {
                pageBtn.style.backgroundColor = '#2196f3';
                pageBtn.style.color = 'white';
            }
            pageBtn.addEventListener('click', () => {
                this.currentPage = i;
                this._generateRows();
                this._updatePagination();
                this.config.callbacks.onPageChange(this.currentPage);
            });
            this.pageNumbers.appendChild(pageBtn);
        }
    }
    
    // Utility methods
    _getCellValue(row, key) {
        if (key.includes('.')) {
            // Handle nested keys like 'user.name'
            return key.split('.').reduce((obj, prop) => obj && obj[prop], row);
        }
        return row[key];
    }
    
    _getPaginatedData() {
        if (!this.config.pagination.enabled) {
            return this.filteredData;
        }
        
        const start = (this.currentPage - 1) * this.config.pagination.pageSize;
        const end = start + this.config.pagination.pageSize;
        return this.filteredData.slice(start, end);
    }
    
    _getTotalPages() {
        if (!this.config.pagination.enabled) return 1;
        return Math.ceil(this.filteredData.length / this.config.pagination.pageSize);
    }
    
    _applyFilters() {
        this.filteredData = this.config.data.filter(row => {
            // Search filter
            if (this.searchQuery) {
                const searchLower = this.searchQuery.toLowerCase();
                const matches = this.config.columns.some(column => {
                    const value = this._getCellValue(row, column.key);
                    return String(value).toLowerCase().includes(searchLower);
                });
                if (!matches) return false;
            }
            
            // Custom filters
            if (this.customFilter && !this.customFilter(row)) {
                return false;
            }
            
            return true;
        });
    }
    
    // Public API methods
    refresh() {
        this._applyFilters();
        this._generateHeaders();
        this._generateRows();
        if (this.config.pagination.enabled) {
            this._updatePagination();
        }
    }
    
    setData(data) {
        this.config.data = data;
        this.filteredData = [...data];
        this.currentPage = 1;
        this.selectedRows.clear();
        this.selectedCells.clear();
        this.refresh();
    }
    
    getSelectedRows() {
        return Array.from(this.selectedRows).map(index => this.filteredData[index]);
    }
    
    getSelectedCells() {
        return Array.from(this.selectedCells);
    }
    
    clearSelection() {
        this.selectedRows.clear();
        this.selectedCells.clear();
        this.tbody.querySelectorAll('.selected').forEach(el => {
            el.classList.remove('selected');
        });
        this.tbody.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
            checkbox.checked = false;
        });
    }
    
    // Backward compatibility methods for tables.js
    search(query) {
        this._handleSearch(query);
    }
    
    sort(column, direction = 'asc') {
        this.sortOrder.column = column;
        this.sortOrder.direction = direction;
        this._handleSort(column);
    }
    
    reset() {
        // Reset all filters and selections
        this.searchQuery = '';
        this.sortOrder = { column: null, direction: 'asc' };
        this.filters.clear();
        this.currentPage = 1;
        this.selectedRows.clear();
        this.selectedCells.clear();
        
        // Reset to original data
        this.filteredData = [...this.config.data];
        
        // Re-render
        this._generateHeaders();
        this._generateRows();
        if (this.config.pagination.enabled) {
            this._updatePagination();
        }
        
        // Clear search input if exists
        const searchInput = this.shadowRoot.querySelector('.search-input');
        if (searchInput) {
            searchInput.value = '';
        }
    }
    
    _renderTable() {
        // Alias for refresh method for backward compatibility
        this.refresh();
    }

    // ==========================================
    // 🚀 MODERN PARTICLE SYSTEM INTEGRATION
    // ==========================================

    /**
     * 🎯 APPLICATION DU POSITIONNEMENT MODERNE
     */
    applyModernPositioning() {
        if (this.config.x !== undefined && this.config.y !== undefined) {
            // Utiliser les particules modernes pour le positionnement
            this.setParticles({
                x: this.config.x,
                y: this.config.y,
                width: this.config.width,
                height: this.config.height
            });
        } else {
            // Juste les dimensions
            this.setParticles({
                width: this.config.width,
                height: this.config.height
            });
        }
    }

    /**
     * 🌟 MISE À JOUR CONFIGURATION MODERNE
     */
    updateModernConfig(newConfig) {
        const oldConfig = { ...this.config };
        this.config = this.mergeConfig({ ...this.config, ...newConfig });
        
        // Détecter les changements de propriétés communes
        const commonProps = ['x', 'y', 'width', 'height', 'backgroundColor', 'opacity'];
        const changedProps = {};
        
        commonProps.forEach(prop => {
            if (oldConfig[prop] !== this.config[prop]) {
                changedProps[prop] = this.config[prop];
            }
        });
        
        // Appliquer les changements via le système moderne
        if (Object.keys(changedProps).length > 0) {
            this.setParticles(changedProps, { force: true });
        }
        
        // Régénérer le tableau si nécessaire
        this._updateTableStructure();
        
        console.log(`📊 Table ${this.id} - Configuration moderne mise à jour:`, changedProps);
    }

    /**
     * 🎨 APPLICATION STYLING MODERNE
     */
    applyModernStyling(styleConfig) {
        // Appliquer les particules de style communes
        const modernParticles = {};
        
        if (styleConfig.backgroundColor) modernParticles.backgroundColor = styleConfig.backgroundColor;
        if (styleConfig.opacity !== undefined) modernParticles.opacity = styleConfig.opacity;
        if (styleConfig.borderRadius) modernParticles.borderRadius = styleConfig.borderRadius;
        if (styleConfig.boxShadow) modernParticles.boxShadow = styleConfig.boxShadow;
        if (styleConfig.gradient) modernParticles.gradient = styleConfig.gradient;
        if (styleConfig.glow) modernParticles.glow = styleConfig.glow;
        
        // Appliquer via le système moderne
        this.setParticles(modernParticles);
        
        // Mettre à jour la configuration
        this.config.style = { ...this.config.style, ...styleConfig };
        this._updateTableStyles();
    }

    /**
     * ⚡ OPTIMISATIONS MODERNES
     */
    enableModernOptimizations() {
        // Activer le rendu optimisé
        this.batchUpdates = true;
        
        // Optimisations CSS
        this.setParticles({
            smooth: true,
            responsive: true,
            animate: { 
                type: 'smooth',
                duration: 300,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
            }
        });
        
        // Performance monitoring
        this._enableTablePerformanceMonitoring();
        
        console.log(`📊 Table ${this.id} - Optimisations modernes activées`);
    }

    /**
     * 🎭 ANIMATION D'ENTRÉE MODERNE
     */
    animateModernEntry() {
        return this.animateParticle('opacity', 
            { from: 0, to: 1 },
            { 
                duration: 500,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                callback: () => {
                    console.log(`📊 Table ${this.id} - Animation d'entrée terminée`);
                    // Animer les lignes une par une
                    this._animateRowsSequence();
                }
            }
        );
    }

    /**
     * 🌊 ANIMATION SÉQUENTIELLE DES LIGNES
     */
    _animateRowsSequence() {
        const rows = this.tbody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            setTimeout(() => {
                row.style.opacity = '0';
                row.style.transform = 'translateY(20px)';
                row.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                
                requestAnimationFrame(() => {
                    row.style.opacity = '1';
                    row.style.transform = 'translateY(0)';
                });
            }, index * 50);
        });
    }

    /**
     * 🔄 MISE À JOUR STRUCTURE TABLEAU
     */
    _updateTableStructure() {
        // Régénérer headers et rows
        this._generateHeaders();
        this._generateRows();
        
        // Mettre à jour pagination si activée
        if (this.config.pagination.enabled) {
            this._updatePagination();
        }
    }

    /**
     * 🎨 MISE À JOUR DES STYLES TABLEAU
     */
    _updateTableStyles() {
        if (this.shadowRoot) {
            const existingStyle = this.shadowRoot.querySelector('style');
            if (existingStyle) {
                existingStyle.remove();
            }
            const newStyle = this._generateStyles();
            this.shadowRoot.insertBefore(newStyle, this.shadowRoot.firstChild);
        }
    }

    /**
     * 📊 MONITORING PERFORMANCE TABLE
     */
    _enableTablePerformanceMonitoring() {
        let lastUpdate = performance.now();
        let frameCount = 0;
        let dataLength = this.config.data.length;
        
        const monitor = () => {
            frameCount++;
            const now = performance.now();
            
            if (now - lastUpdate >= 2000) {
                const fps = Math.round((frameCount * 1000) / (now - lastUpdate));
                const memoryUsage = performance.memory ? 
                    Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : 'N/A';
                
                console.log(`📊 Table ${this.id} - Performance: ${fps}fps, Data: ${dataLength} rows, Memory: ${memoryUsage}MB`);
                frameCount = 0;
                lastUpdate = now;
            }
            
            requestAnimationFrame(monitor);
        };
        
        requestAnimationFrame(monitor);
    }
}

// Register the Web Component
customElements.define('squirrel-table', Table);

// Export for both ES6 modules and direct usage
export default Table;

// Also make it available globally for compatibility
if (typeof window !== 'undefined') {
    window.SquirrelTable = Table;
}
