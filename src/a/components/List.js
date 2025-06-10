/**
 * 📋 List Component - Squirrel Framework
 * 
 * Fully customizable list component for creating beautiful, interactive lists
 * with support for icons, avatars, nested items, and various list types.
 * 
 * @version 1.0.0
 * @author Squirrel Framework Team
 */

class List {
    static lists = new Map(); // Registry of all lists
    
    constructor(config = {}) {
        // Default configuration
        this.config = {
            id: config.id || `list_${Date.now()}`,
            attach: config.attach || 'body',
            x: config.x || 0,
            y: config.y || 0,
            width: config.width || 300,
            height: config.height || 'auto',
            
            // List type: 'simple', 'icon', 'avatar', 'menu', 'todo', 'nested'
            type: config.type || 'simple',
            
            // Data
            items: config.items || [],
            
            // Behavior
            selectable: config.selectable !== false,
            multiSelect: config.multiSelect || false,
            searchable: config.searchable || false,
            sortable: config.sortable || false,
            draggable: config.draggable || false,
            
            // Styling
            style: {
                backgroundColor: '#ffffff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                fontFamily: 'Roboto, sans-serif',
                fontSize: '14px',
                color: '#333333',
                overflow: 'auto',
                ...config.style
            },
            
            // Item styling
            itemStyle: {
                padding: '12px 16px',
                borderBottom: '1px solid #f0f0f0',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                ...config.itemStyle
            },
            
            // Item hover style
            itemHoverStyle: {
                backgroundColor: '#f8f9fa',
                ...config.itemHoverStyle
            },
            
            // Item selected style
            itemSelectedStyle: {
                backgroundColor: '#e3f2fd',
                borderLeft: '4px solid #2196f3',
                ...config.itemSelectedStyle
            },
            
            // Header style (for search/controls)
            headerStyle: {
                padding: '12px 16px',
                borderBottom: '2px solid #e0e0e0',
                backgroundColor: '#fafafa',
                ...config.headerStyle
            },
            
            // Icon settings
            iconSettings: {
                size: config.iconSettings?.size || 20,
                marginRight: config.iconSettings?.marginRight || 12,
                color: config.iconSettings?.color || '#666666',
                ...config.iconSettings
            },
            
            // Avatar settings
            avatarSettings: {
                size: config.avatarSettings?.size || 32,
                marginRight: config.avatarSettings?.marginRight || 12,
                borderRadius: config.avatarSettings?.borderRadius || '50%',
                ...config.avatarSettings
            },
            
            // Search settings
            searchSettings: {
                placeholder: 'Search items...',
                caseSensitive: false,
                searchFields: ['text', 'title', 'content'],
                ...config.searchSettings
            },
            
            // Animation settings
            animations: {
                enabled: config.animations?.enabled !== false,
                duration: config.animations?.duration || 200,
                easing: config.animations?.easing || 'ease-out',
                ...config.animations
            },
            
            // Callbacks
            callbacks: {
                onItemClick: config.callbacks?.onItemClick || (() => {}),
                onItemDoubleClick: config.callbacks?.onItemDoubleClick || (() => {}),
                onItemHover: config.callbacks?.onItemHover || (() => {}),
                onSelectionChange: config.callbacks?.onSelectionChange || (() => {}),
                onSearch: config.callbacks?.onSearch || (() => {}),
                onSort: config.callbacks?.onSort || (() => {}),
                onDrop: config.callbacks?.onDrop || (() => {}),
                ...config.callbacks
            }
        };
        
        this.id = this.config.id;
        this.selectedItems = new Set();
        this.filteredItems = [...this.config.items];
        this.sortOrder = { field: null, direction: 'asc' };
        
        this._createList();
        this._setupEventHandlers();
        
        // Register list
        List.lists.set(this.id, this);
        
        console.log(`📋 List created: ${this.id} (${this.config.type})`);
    }
    
    _createList() {
        // Get container
        const container = typeof this.config.attach === 'string' 
            ? document.querySelector(this.config.attach)
            : this.config.attach;

        if (!container) {
            throw new Error(`Container not found: ${this.config.attach}`);
        }

        // Create main list element
        this.element = new A({
            attach: container,
            id: this.id,
            x: this.config.x,
            y: this.config.y,
            width: this.config.width,
            height: this.config.height,
            ...this.config.style
        });

        // Create header if needed
        if (this.config.searchable || this.config.sortable) {
            this._createHeader();
        }

        // Create list container
        this._createListContainer();
        
        // Render items
        this._renderItems();
    }
    
    _createHeader() {
        this.header = new A({
            attach: this.element,
            width: '100%',
            height: 'auto',
            ...this.config.headerStyle
        });

        // Search input
        if (this.config.searchable) {
            this.searchInput = new A({
                attach: this.header,
                tag: 'input',
                type: 'text',
                placeholder: this.config.searchSettings.placeholder,
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                outline: 'none',
                marginBottom: '8px'
            });
        }

        // Sort controls
        if (this.config.sortable) {
            this.sortContainer = new A({
                attach: this.header,
                display: 'flex',
                gap: '8px',
                alignItems: 'center'
            });

            this.sortSelect = new A({
                attach: this.sortContainer,
                tag: 'select',
                padding: '4px 8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '12px'
            });
        }
    }
    
    _createListContainer() {
        this.listContainer = new A({
            attach: this.element,
            width: '100%',
            height: this.config.searchable || this.config.sortable ? 'calc(100% - 60px)' : '100%',
            overflow: 'auto'
        });
    }
    
    _renderItems() {
        // Clear existing items
        if (this.listContainer.getElement) {
            this.listContainer.getElement().innerHTML = '';
        }
        
        this.itemElements = new Map();
        
        this.filteredItems.forEach((item, index) => {
            const itemElement = this._createListItem(item, index);
            this.itemElements.set(item.id || index, itemElement);
        });
    }
    
    _createListItem(item, index) {
        const itemId = item.id || `item_${index}`;
        
        // Create item container
        const itemElement = new A({
            attach: this.listContainer,
            id: `${this.id}_${itemId}`,
            ...this.config.itemStyle,
            'data-item-id': itemId
        });

        // Add content based on type
        switch (this.config.type) {
            case 'icon':
                this._createIconItem(itemElement, item);
                break;
            case 'avatar':
                this._createAvatarItem(itemElement, item);
                break;
            case 'menu':
                this._createMenuItem(itemElement, item);
                break;
            case 'todo':
                this._createTodoItem(itemElement, item);
                break;
            case 'nested':
                this._createNestedItem(itemElement, item);
                break;
            default:
                this._createSimpleItem(itemElement, item);
        }

        return itemElement;
    }
    
    _createSimpleItem(container, item) {
        new A({
            attach: container,
            text: item.text || item.title || item.content || '',
            flex: '1'
        });
    }
    
    _createIconItem(container, item) {
        // Icon
        if (item.icon) {
            new A({
                attach: container,
                text: item.icon,
                fontSize: `${this.config.iconSettings.size}px`,
                color: this.config.iconSettings.color,
                marginRight: `${this.config.iconSettings.marginRight}px`,
                flexShrink: '0'
            });
        }

        // Text content
        const textContainer = new A({
            attach: container,
            flex: '1',
            display: 'flex',
            flexDirection: 'column'
        });

        new A({
            attach: textContainer,
            text: item.text || item.title || '',
            fontWeight: item.subtitle ? 'bold' : 'normal'
        });

        if (item.subtitle) {
            new A({
                attach: textContainer,
                text: item.subtitle,
                fontSize: '12px',
                color: '#666',
                marginTop: '2px'
            });
        }

        // Badge/status
        if (item.badge) {
            new A({
                attach: container,
                text: item.badge,
                backgroundColor: item.badgeColor || '#ff4444',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 'bold',
                marginLeft: 'auto'
            });
        }
    }
    
    _createAvatarItem(container, item) {
        // Avatar
        if (item.avatar) {
            new A({
                attach: container,
                width: `${this.config.avatarSettings.size}px`,
                height: `${this.config.avatarSettings.size}px`,
                backgroundImage: `url(${item.avatar})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                borderRadius: this.config.avatarSettings.borderRadius,
                marginRight: `${this.config.avatarSettings.marginRight}px`,
                flexShrink: '0'
            });
        } else if (item.avatarText) {
            new A({
                attach: container,
                width: `${this.config.avatarSettings.size}px`,
                height: `${this.config.avatarSettings.size}px`,
                backgroundColor: item.avatarColor || '#2196f3',
                color: 'white',
                borderRadius: this.config.avatarSettings.borderRadius,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold',
                text: item.avatarText,
                marginRight: `${this.config.avatarSettings.marginRight}px`,
                flexShrink: '0'
            });
        }

        // Content
        this._createIconItem(container, item);
    }
    
    _createMenuItem(container, item) {
        this._createIconItem(container, item);

        // Arrow for submenu
        if (item.submenu) {
            new A({
                attach: container,
                text: '▶',
                color: '#999',
                fontSize: '12px',
                marginLeft: 'auto'
            });
        }
    }
    
    _createTodoItem(container, item) {
        // Checkbox
        const checkbox = new A({
            attach: container,
            tag: 'input',
            type: 'checkbox',
            checked: item.completed || false,
            marginRight: '12px',
            cursor: 'pointer'
        });

        // Text with strikethrough if completed
        new A({
            attach: container,
            text: item.text || '',
            flex: '1',
            textDecoration: item.completed ? 'line-through' : 'none',
            color: item.completed ? '#999' : 'inherit'
        });

        // Priority indicator
        if (item.priority) {
            const priorityColors = {
                high: '#ff4444',
                medium: '#ffaa00',
                low: '#44ff44'
            };

            new A({
                attach: container,
                width: '8px',
                height: '8px',
                backgroundColor: priorityColors[item.priority] || '#ccc',
                borderRadius: '50%',
                marginLeft: '8px'
            });
        }
    }
    
    _createNestedItem(container, item) {
        this._createIconItem(container, item);

        // Expand/collapse for children
        if (item.children && item.children.length > 0) {
            const expandIcon = new A({
                attach: container,
                text: item.expanded ? '▼' : '▶',
                color: '#666',
                fontSize: '12px',
                cursor: 'pointer',
                marginLeft: 'auto'
            });

            // Children container (initially hidden if not expanded)
            if (item.expanded) {
                const childrenContainer = new A({
                    attach: this.listContainer,
                    width: '100%',
                    paddingLeft: '24px'
                });

                item.children.forEach((child, index) => {
                    this._createListItem(child, `${item.id}_${index}`);
                });
            }
        }
    }
    
    _setupEventHandlers() {
        // Search functionality
        if (this.searchInput) {
            this.searchInput.getElement().addEventListener('input', (e) => {
                this._handleSearch(e.target.value);
            });
        }

        // Sort functionality
        if (this.sortSelect) {
            this.sortSelect.getElement().addEventListener('change', (e) => {
                this._handleSort(e.target.value);
            });
        }

        // Item click handling
        this.listContainer.getElement().addEventListener('click', (e) => {
            const itemElement = e.target.closest('[data-item-id]');
            if (itemElement) {
                this._handleItemClick(itemElement, e);
            }
        });

        // Item hover handling
        this.listContainer.getElement().addEventListener('mouseover', (e) => {
            const itemElement = e.target.closest('[data-item-id]');
            if (itemElement) {
                this._applyItemStyle(itemElement, this.config.itemHoverStyle);
            }
        });

        this.listContainer.getElement().addEventListener('mouseout', (e) => {
            const itemElement = e.target.closest('[data-item-id]');
            if (itemElement && !this.selectedItems.has(itemElement.dataset.itemId)) {
                this._applyItemStyle(itemElement, this.config.itemStyle);
            }
        });
    }
    
    _handleSearch(query) {
        const { searchFields, caseSensitive } = this.config.searchSettings;
        const searchTerm = caseSensitive ? query : query.toLowerCase();
        
        if (!searchTerm) {
            this.filteredItems = [...this.config.items];
        } else {
            this.filteredItems = this.config.items.filter(item => {
                return searchFields.some(field => {
                    const value = item[field];
                    if (!value) return false;
                    const searchValue = caseSensitive ? value : value.toLowerCase();
                    return searchValue.includes(searchTerm);
                });
            });
        }
        
        this._renderItems();
        this.config.callbacks.onSearch(query, this.filteredItems);
    }
    
    _handleSort(field) {
        if (this.sortOrder.field === field) {
            this.sortOrder.direction = this.sortOrder.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortOrder.field = field;
            this.sortOrder.direction = 'asc';
        }
        
        this.filteredItems.sort((a, b) => {
            const aVal = a[field] || '';
            const bVal = b[field] || '';
            
            if (this.sortOrder.direction === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
        
        this._renderItems();
        this.config.callbacks.onSort(field, this.sortOrder.direction);
    }
    
    _handleItemClick(itemElement, event) {
        const itemId = itemElement.dataset.itemId;
        const item = this.config.items.find(i => (i.id || i) === itemId);
        
        if (this.config.selectable) {
            if (this.config.multiSelect && event.ctrlKey) {
                this._toggleItemSelection(itemId, itemElement);
            } else {
                this._selectItem(itemId, itemElement);
            }
        }
        
        this.config.callbacks.onItemClick(item, itemId, event);
    }
    
    _selectItem(itemId, itemElement) {
        // Clear previous selections
        this.selectedItems.forEach(id => {
            const element = this.itemElements.get(id);
            if (element) {
                this._applyItemStyle(element.getElement(), this.config.itemStyle);
            }
        });
        
        this.selectedItems.clear();
        this.selectedItems.add(itemId);
        this._applyItemStyle(itemElement, this.config.itemSelectedStyle);
        
        this.config.callbacks.onSelectionChange([...this.selectedItems]);
    }
    
    _toggleItemSelection(itemId, itemElement) {
        if (this.selectedItems.has(itemId)) {
            this.selectedItems.delete(itemId);
            this._applyItemStyle(itemElement, this.config.itemStyle);
        } else {
            this.selectedItems.add(itemId);
            this._applyItemStyle(itemElement, this.config.itemSelectedStyle);
        }
        
        this.config.callbacks.onSelectionChange([...this.selectedItems]);
    }
    
    _applyItemStyle(element, style) {
        Object.assign(element.style, style);
    }
    
    // Public API
    addItem(item) {
        this.config.items.push(item);
        this.filteredItems = [...this.config.items];
        this._renderItems();
    }
    
    removeItem(itemId) {
        this.config.items = this.config.items.filter(item => (item.id || item) !== itemId);
        this.filteredItems = [...this.config.items];
        this.selectedItems.delete(itemId);
        this._renderItems();
    }
    
    updateItem(itemId, newData) {
        const index = this.config.items.findIndex(item => (item.id || item) === itemId);
        if (index !== -1) {
            this.config.items[index] = { ...this.config.items[index], ...newData };
            this.filteredItems = [...this.config.items];
            this._renderItems();
        }
    }
    
    getSelectedItems() {
        return [...this.selectedItems].map(id => 
            this.config.items.find(item => (item.id || item) === id)
        );
    }
    
    clearSelection() {
        this.selectedItems.clear();
        this._renderItems();
    }
    
    // Filter items based on a function
    filter(filterFn) {
        if (typeof filterFn === 'function') {
            this.filteredItems = this.config.items.filter(filterFn);
        } else {
            this.filteredItems = [...this.config.items];
        }
        this._renderItems();
        return this;
    }
    
    // Search items by text
    search(searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            this.filteredItems = [...this.config.items];
        } else {
            const term = searchTerm.toLowerCase();
            this.filteredItems = this.config.items.filter(item => {
                const text = (item.text || item).toString().toLowerCase();
                const subtext = (item.subtext || '').toString().toLowerCase();
                return text.includes(term) || subtext.includes(term);
            });
        }
        this._renderItems();
        return this;
    }
    
    // Sort items
    sort(sortFn) {
        if (typeof sortFn === 'function') {
            this.filteredItems.sort(sortFn);
        } else {
            // Default sort by text
            this.filteredItems.sort((a, b) => {
                const textA = (a.text || a).toString().toLowerCase();
                const textB = (b.text || b).toString().toLowerCase();
                return textA.localeCompare(textB);
            });
        }
        this._renderItems();
        return this;
    }
    
    // Reset filter/search
    reset() {
        this.filteredItems = [...this.config.items];
        this._renderItems();
        return this;
    }
    
    refresh() {
        this._renderItems();
    }
    
    destroy() {
        List.lists.delete(this.id);
        if (this.element && this.element.getElement) {
            this.element.getElement().remove();
        }
    }
    
    // Static methods
    static getList(id) {
        return List.lists.get(id);
    }
    
    static getAllLists() {
        return Array.from(List.lists.values());
    }
}

// Export for global use
window.List = List;
export default List;
