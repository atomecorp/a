/**
 * 📋 List Web Component - Squirrel Framework
 * 
 * Fully customizable list web component for creating beautiful, interactive lists
 * with support for icons, avatars, nested items, advanced CSS styling, and various list types.
 * Enhanced with complete CSS properties support including gradients, shadows, transforms, etc.
 * 
 * @version 2.0.0 - Web Component Edition
 * @author Squirrel Framework Team
 */

class List extends HTMLElement {
    static instances = new Map(); // Registry of all List instances
    
    constructor(config = {}) {
        super();
        
        // Generate unique ID
        this.id = config.id || `list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Merge configuration with defaults
        this.config = this.mergeConfig(config);
        
        // Internal state
        this.selectedItems = new Set();
        this.filteredItems = [...this.config.items];
        this.sortOrder = { field: null, direction: 'asc' };
        this.itemElements = new Map();
        
        // Create Shadow DOM
        this.attachShadow({ mode: 'open' });
        this.initialized = false;
        
        console.log(`📋 List Web Component "${this.id}" created (${this.config.type}) - ${this.config.items.length} items`);
        
        // Auto-attach to DOM if attach property is specified
        if (this.config.attach) {
            this.performAutoAttach();
        }
    }
    
    performAutoAttach() {
        // Wait for DOM to be ready
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            this._doAttach();
        } else {
            document.addEventListener('DOMContentLoaded', () => this._doAttach());
        }
    }
    
    _doAttach() {
        console.log(`🔗 Auto-attaching ${this.id} with config:`, {
            attach: this.config.attach,
            x: this.config.x,
            y: this.config.y,
            width: this.config.width,
            height: this.config.height
        });
        
        let parent;
        if (typeof this.config.attach === 'string') {
            parent = document.querySelector(this.config.attach) || document.body;
        } else if (this.config.attach instanceof HTMLElement) {
            parent = this.config.attach;
        } else {
            parent = document.body;
        }
        
        parent.appendChild(this);
        
        // Apply positioning after attachment
        setTimeout(() => {
            this.applyPositioning();
        }, 0);
    }
    
    applyPositioning() {
        console.log(`🎯 applyPositioning called for ${this.id}:`, {
            x: this.config.x,
            y: this.config.y,
            width: this.config.width,
            height: this.config.height
        });
        
        if (this.config.x !== undefined && this.config.y !== undefined) {
            this.style.position = 'absolute';
            this.style.left = `${this.config.x}px`;
            this.style.top = `${this.config.y}px`;
            this.style.zIndex = '1';
            
            // Force the positioning using setAttribute as backup
            this.setAttribute('style', 
                `position: absolute; z-index: 1; left: ${this.config.x}px; top: ${this.config.y}px;` +
                (this.config.width ? ` width: ${typeof this.config.width === 'number' ? this.config.width + 'px' : this.config.width};` : '') +
                (this.config.height && this.config.height !== 'auto' ? ` height: ${typeof this.config.height === 'number' ? this.config.height + 'px' : this.config.height};` : '')
            );
            
            console.log(`✅ Position applied: ${this.config.x}px, ${this.config.y}px`);
            console.log(`📐 Style attribute:`, this.getAttribute('style'));
        }
    }
    
    connectedCallback() {
        console.log(`🔌 ${this.id} connected to DOM`);
        if (!this.initialized) {
            this.init();
            this.initialized = true;
        }
        
        // Ensure positioning is applied when connected to DOM
        setTimeout(() => {
            this.applyPositioning();
        }, 0);
    }
    
    mergeConfig(config) {
        const defaultConfig = {
            // Container and positioning
            attach: 'body',
            x: 0, y: 0,
            width: 300, height: 'auto',
            
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
            
            // Main container styling with full CSS support
            style: {
                backgroundColor: '#ffffff',
                background: null, // Support for gradients
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                fontFamily: 'Roboto, sans-serif',
                fontSize: '14px',
                color: '#333333',
                overflow: 'auto',
                padding: '0',
                margin: '0',
                backdropFilter: null,
                filter: null,
                transform: null,
                transformOrigin: 'center',
                transition: 'all 0.2s ease',
                cursor: 'default',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                position: 'relative',
                zIndex: 1,
                opacity: 1,
                visibility: 'visible',
                ...config.style
            },
            
            // Item default styling with full CSS support
            itemStyle: {
                padding: '12px 16px',
                margin: '0',
                borderBottom: '1px solid #f0f0f0',
                border: null,
                borderRadius: null,
                backgroundColor: 'transparent',
                background: null,
                color: 'inherit',
                fontSize: 'inherit',
                fontFamily: 'inherit',
                fontWeight: 'normal',
                lineHeight: '1.4',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '0',
                transition: 'all 0.2s ease',
                transform: null,
                transformOrigin: 'center',
                boxShadow: null,
                textShadow: null,
                filter: null,
                backdropFilter: null,
                opacity: 1,
                visibility: 'visible',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                position: 'relative',
                zIndex: 1,
                ...config.itemStyle
            },
            
            // Item hover style with full CSS support
            itemHoverStyle: {
                backgroundColor: '#f8f9fa',
                background: null,
                color: null,
                transform: null,
                boxShadow: null,
                filter: null,
                borderColor: null,
                opacity: null,
                ...config.itemHoverStyle
            },
            
            // Item selected style with full CSS support
            itemSelectedStyle: {
                backgroundColor: '#e3f2fd',
                background: null,
                borderLeft: '4px solid #2196f3',
                color: null,
                transform: null,
                boxShadow: null,
                filter: null,
                fontWeight: null,
                ...config.itemSelectedStyle
            },
            
            // Header style (for search/controls) with full CSS support
            headerStyle: {
                padding: '12px 16px',
                borderBottom: '2px solid #e0e0e0',
                backgroundColor: '#fafafa',
                background: null,
                color: 'inherit',
                fontSize: 'inherit',
                fontFamily: 'inherit',
                borderRadius: null,
                boxShadow: null,
                backdropFilter: null,
                filter: null,
                margin: '0',
                position: 'relative',
                zIndex: 2,
                ...config.headerStyle
            },
            
            // Icon settings
            iconSettings: {
                size: config.iconSettings?.size || 20,
                marginRight: config.iconSettings?.marginRight || 12,
                color: config.iconSettings?.color || '#666666',
                filter: config.iconSettings?.filter || null,
                transform: config.iconSettings?.transform || null,
                opacity: config.iconSettings?.opacity || 1,
                ...config.iconSettings
            },
            
            // Avatar settings
            avatarSettings: {
                size: config.avatarSettings?.size || 32,
                marginRight: config.avatarSettings?.marginRight || 12,
                borderRadius: config.avatarSettings?.borderRadius || '50%',
                border: config.avatarSettings?.border || null,
                boxShadow: config.avatarSettings?.boxShadow || null,
                filter: config.avatarSettings?.filter || null,
                ...config.avatarSettings
            },
            
            // Search settings
            searchSettings: {
                placeholder: 'Search items...',
                caseSensitive: false,
                searchFields: ['text', 'title', 'content'],
                style: {
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none',
                    marginBottom: '8px',
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    color: '#333',
                    transition: 'all 0.2s ease',
                    ...config.searchSettings?.style
                },
                ...config.searchSettings
            },
            
            // Animation settings
            animations: {
                enabled: config.animations?.enabled !== false,
                duration: config.animations?.duration || 200,
                easing: config.animations?.easing || 'ease-out',
                delay: config.animations?.delay || 0,
                ...config.animations
            },
            
            // Callbacks
            callbacks: {
                onItemClick: config.callbacks?.onItemClick || (() => {}),
                onItemDoubleClick: config.callbacks?.onItemDoubleClick || (() => {}),
                onItemHover: config.callbacks?.onItemHover || (() => {}),
                onItemLeave: config.callbacks?.onItemLeave || (() => {}),
                onSelectionChange: config.callbacks?.onSelectionChange || (() => {}),
                onSearch: config.callbacks?.onSearch || (() => {}),
                onSort: config.callbacks?.onSort || (() => {}),
                onDrop: config.callbacks?.onDrop || (() => {}),
                onReady: config.callbacks?.onReady || (() => {}),
                onError: config.callbacks?.onError || ((error) => console.error('List error:', error)),
                ...config.callbacks
            }
        };
        
        // Merge user config over defaults, giving priority to user values
        return {
            ...defaultConfig,
            ...config,
            // Ensure specific overrides for positioning
            x: config.x !== undefined ? config.x : defaultConfig.x,
            y: config.y !== undefined ? config.y : defaultConfig.y,
            width: config.width !== undefined ? config.width : defaultConfig.width,
            height: config.height !== undefined ? config.height : defaultConfig.height,
            // Deep merge style objects
            style: { ...defaultConfig.style, ...config.style },
            itemStyle: { ...defaultConfig.itemStyle, ...config.itemStyle },
            itemHoverStyle: { ...defaultConfig.itemHoverStyle, ...config.itemHoverStyle },
            itemSelectedStyle: { ...defaultConfig.itemSelectedStyle, ...config.itemSelectedStyle },
            headerStyle: { ...defaultConfig.headerStyle, ...config.headerStyle },
            iconSettings: { ...defaultConfig.iconSettings, ...config.iconSettings },
            avatarSettings: { ...defaultConfig.avatarSettings, ...config.avatarSettings },
            searchSettings: { ...defaultConfig.searchSettings, ...config.searchSettings },
            animations: { ...defaultConfig.animations, ...config.animations },
            callbacks: { ...defaultConfig.callbacks, ...config.callbacks }
        };
    }
    
    init() {
        this.initializeComponent();
    }
    
    async initializeComponent() {
        try {
            this.createShadowStructure();
            this.setupEventHandlers();
            this.renderItems();
            
            // Register instance
            List.instances.set(this.id, this);
            
            // Dispatch ready event
            this.dispatchEvent(new CustomEvent('list-ready', {
                detail: { list: this, id: this.id }
            }));
            
            this.config.callbacks.onReady(this);
            
            console.log(`📋 List Web Component "${this.id}" is ready`);
            
        } catch (error) {
            console.error('❌ List initialization failed:', error);
            this.config.callbacks.onError(error);
        }
    }
    
    createShadowStructure() {
        const styles = this.createStyles();
        
        // Main container
        this.container = document.createElement('div');
        this.container.className = 'list-container';
        
        // Header container (search/sort)
        if (this.config.searchable || this.config.sortable) {
            this.createHeader();
        }
        
        // List items container
        this.listContainer = document.createElement('div');
        this.listContainer.className = 'list-items-container';
        
        this.container.appendChild(this.listContainer);
        
        this.shadowRoot.appendChild(styles);
        this.shadowRoot.appendChild(this.container);
    }
    
    createStyles() {
        const style = document.createElement('style');
        
        // Convert style objects to CSS, separating positioning from appearance
        const { hostStyles, containerStyles } = this.separateStyles(this.config.style);
        const containerCSS = this.objectToCSS(containerStyles);
        const headerCSS = this.objectToCSS(this.config.headerStyle);
        const itemCSS = this.objectToCSS(this.config.itemStyle);
        const hoverCSS = this.objectToCSS(this.config.itemHoverStyle);
        const selectedCSS = this.objectToCSS(this.config.itemSelectedStyle);
        const searchCSS = this.objectToCSS(this.config.searchSettings.style);
        
        // Apply host styles (positioning) to the Web Component
        Object.entries(hostStyles).forEach(([property, value]) => {
            const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
            this.style.setProperty(cssProperty, Array.isArray(value) ? value.join(', ') : value);
        });
        
        style.textContent = `
            :host {
                display: block;
                width: ${hostStyles.width || this.config.width || 'auto'};
                height: ${hostStyles.height || this.config.height || 'auto'};
                font-family: 'Roboto', Arial, sans-serif;
                box-sizing: border-box;
                outline: none;
                contain: layout style paint;
            }
            
            .list-container {
                position: relative;
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                ${containerCSS}
            }
            
            .list-header {
                position: relative;
                width: 100%;
                box-sizing: border-box;
                ${headerCSS}
            }
            
            .list-search-input {
                ${searchCSS}
            }
            
            .list-search-input:focus {
                border-color: #2196f3;
                box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
            }
            
            .list-sort-container {
                display: flex;
                gap: 8px;
                align-items: center;
                margin-top: 8px;
            }
            
            .list-sort-select {
                padding: 4px 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                fontSize: 12px;
                background: white;
                outline: none;
                cursor: pointer;
            }
            
            .list-items-container {
                position: relative;
                width: 100%;
                height: ${this.config.searchable || this.config.sortable ? 'calc(100% - 80px)' : '100%'};
                overflow: auto;
                box-sizing: border-box;
            }
            
            .list-item {
                position: relative;
                width: 100%;
                box-sizing: border-box;
                ${itemCSS}
            }
            
            .list-item:hover {
                ${hoverCSS}
            }
            
            .list-item.selected {
                ${selectedCSS}
            }
            
            .list-item.custom-style {
                /* Custom styles will be applied inline */
            }
            
            .item-icon {
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .item-avatar {
                flex-shrink: 0;
                background-size: cover;
                background-position: center;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                text-align: center;
            }
            
            .item-content {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-width: 0;
            }
            
            .item-main-text {
                font-weight: inherit;
                margin: 0;
                padding: 0;
                line-height: 1.2;
            }
            
            .item-subtitle {
                font-size: 12px;
                color: #666;
                margin-top: 2px;
                line-height: 1.2;
            }
            
            .item-badge {
                flex-shrink: 0;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: bold;
                margin-left: auto;
                text-align: center;
                line-height: 1;
            }
            
            .item-checkbox {
                margin-right: 12px;
                cursor: pointer;
                flex-shrink: 0;
            }
            
            .item-priority {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                margin-left: 8px;
                flex-shrink: 0;
            }
            
            .item-expand-icon {
                color: #666;
                font-size: 12px;
                cursor: pointer;
                margin-left: auto;
                flex-shrink: 0;
            }
            
            .nested-children {
                width: 100%;
                padding-left: 24px;
            }
            
            /* Animation classes */
            .list-item.animate-in {
                animation: slideIn ${this.config.animations.duration}ms ${this.config.animations.easing} ${this.config.animations.delay}ms both;
            }
            
            .list-item.animate-out {
                animation: slideOut ${this.config.animations.duration}ms ${this.config.animations.easing} both;
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            @keyframes slideOut {
                from {
                    opacity: 1;
                    transform: translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateY(-10px);
                }
            }
            
            /* Responsive design */
            @media (max-width: 768px) {
                .list-item {
                    padding: 8px 12px;
                }
                
                .item-avatar, .item-icon {
                    margin-right: 8px;
                }
            }
        `;
        
        return style;
    }
    
    /**
     * Convert style object to CSS string with support for arrays (multiple shadows, etc.)
     */
    objectToCSS(styleObj) {
        if (!styleObj) return '';
        
        return Object.entries(styleObj)
            .filter(([key, value]) => value !== null && value !== undefined)
            .map(([key, value]) => {
                // Convert camelCase to kebab-case
                const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                
                // Handle array values (like multiple box-shadows)
                if (Array.isArray(value)) {
                    return `${cssKey}: ${value.join(', ')};`;
                }
                
                // Handle number values that need 'px'
                if (typeof value === 'number' && this.needsPx(cssKey)) {
                    return `${cssKey}: ${value}px;`;
                }
                
                return `${cssKey}: ${value};`;
            })
            .join(' ');
    }
    
    /**
     * Check if CSS property needs 'px' unit
     */
    needsPx(cssProperty) {
        const pxProperties = [
            'width', 'height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'border-width', 'border-radius', 'top', 'right', 'bottom', 'left',
            'font-size', 'line-height', 'letter-spacing', 'word-spacing'
        ];
        return pxProperties.includes(cssProperty);
    }
    
    /**
     * Separate styles into host styles (positioning) and container styles (appearance)
     */
    separateStyles(styleObj) {
        if (!styleObj) return { hostStyles: {}, containerStyles: {} };
        
        const hostStyleProps = [
            'position', 'left', 'top', 'right', 'bottom', 
            'width', 'height', 'zIndex', 'transform'
        ];
        
        const hostStyles = {};
        const containerStyles = {};
        
        Object.entries(styleObj).forEach(([key, value]) => {
            if (hostStyleProps.includes(key)) {
                hostStyles[key] = value;
            } else {
                containerStyles[key] = value;
            }
        });
        
        return { hostStyles, containerStyles };
    }

    createHeader() {
        this.header = document.createElement('div');
        this.header.className = 'list-header';
        
        // Search input
        if (this.config.searchable) {
            this.searchInput = document.createElement('input');
            this.searchInput.type = 'text';
            this.searchInput.placeholder = this.config.searchSettings.placeholder;
            this.searchInput.className = 'list-search-input';
            this.header.appendChild(this.searchInput);
        }
        
        // Sort controls
        if (this.config.sortable) {
            this.sortContainer = document.createElement('div');
            this.sortContainer.className = 'list-sort-container';
            
            this.sortSelect = document.createElement('select');
            this.sortSelect.className = 'list-sort-select';
            
            // Add default option
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Sort by...';
            this.sortSelect.appendChild(defaultOption);
            
            this.sortContainer.appendChild(this.sortSelect);
            this.header.appendChild(this.sortContainer);
        }
        
        this.container.appendChild(this.header);
    }
    
    renderItems() {
        // Clear existing items
        this.listContainer.innerHTML = '';
        this.itemElements.clear();
        
        this.filteredItems.forEach((item, index) => {
            const itemElement = this.createListItem(item, index);
            if (itemElement) {
                const itemId = this.getItemId(item, index);
                this.itemElements.set(String(itemId), itemElement);
                
                // Add animation if enabled
                if (this.config.animations.enabled) {
                    itemElement.classList.add('animate-in');
                }
            }
        });
    }
    
    getItemId(item, index) {
        return item.id !== undefined ? item.id : index;
    }
    
    createListItem(item, index) {
        const itemId = this.getItemId(item, index);
        const itemIdString = String(itemId);
        
        // Create item container
        const itemElement = document.createElement('div');
        itemElement.className = 'list-item';
        itemElement.dataset.itemId = itemIdString;
        
        // Apply custom item styles if provided
        if (item.style) {
            this.applyCustomStyles(itemElement, item.style);
            itemElement.classList.add('custom-style');
        }
        
        this.listContainer.appendChild(itemElement);
        
        // Add content based on type
        this.populateItemContent(itemElement, item);
        
        return itemElement;
    }
    
    /**
     * Apply custom styles to an element with full CSS support
     */
    applyCustomStyles(element, styles) {
        if (!styles || typeof styles !== 'object') return;
        
        Object.entries(styles).forEach(([key, value]) => {
            if (value === null || value === undefined) return;
            
            // Handle array values (like multiple box-shadows)
            if (Array.isArray(value)) {
                element.style[key] = value.join(', ');
            } else {
                element.style[key] = value;
            }
        });
    }
    
    populateItemContent(container, item) {
        switch (this.config.type) {
            case 'icon':
                this.createIconItem(container, item);
                break;
            case 'avatar':
                this.createAvatarItem(container, item);
                break;
            case 'menu':
                this.createMenuItem(container, item);
                break;
            case 'todo':
                this.createTodoItem(container, item);
                break;
            case 'nested':
                this.createNestedItem(container, item);
                break;
            default:
                this.createSimpleItem(container, item);
        }
    }
    
    createSimpleItem(container, item) {
        const textElement = document.createElement('div');
        textElement.className = 'item-main-text';
        textElement.textContent = item.text || item.title || item.content || '';
        container.appendChild(textElement);
    }
    
    createIconItem(container, item) {
        // Icon
        if (item.icon) {
            const iconElement = document.createElement('div');
            iconElement.className = 'item-icon';
            iconElement.textContent = item.icon;
            
            // Apply icon settings
            iconElement.style.fontSize = `${this.config.iconSettings.size}px`;
            iconElement.style.color = this.config.iconSettings.color;
            iconElement.style.marginRight = `${this.config.iconSettings.marginRight}px`;
            
            if (this.config.iconSettings.filter) {
                iconElement.style.filter = this.config.iconSettings.filter;
            }
            if (this.config.iconSettings.transform) {
                iconElement.style.transform = this.config.iconSettings.transform;
            }
            if (this.config.iconSettings.opacity !== undefined) {
                iconElement.style.opacity = this.config.iconSettings.opacity;
            }
            
            container.appendChild(iconElement);
        }
        
        // Text content
        const textContainer = document.createElement('div');
        textContainer.className = 'item-content';
        container.appendChild(textContainer);
        
        const mainText = document.createElement('div');
        mainText.className = 'item-main-text';
        mainText.textContent = item.text || item.title || '';
        if (item.subtitle) {
            mainText.style.fontWeight = 'bold';
        }
        textContainer.appendChild(mainText);
        
        if (item.subtitle) {
            const subtitleElement = document.createElement('div');
            subtitleElement.className = 'item-subtitle';
            subtitleElement.textContent = item.subtitle;
            textContainer.appendChild(subtitleElement);
        }
        
        // Badge/status
        if (item.badge) {
            const badgeElement = document.createElement('div');
            badgeElement.className = 'item-badge';
            badgeElement.textContent = item.badge;
            badgeElement.style.backgroundColor = item.badgeColor || '#ff4444';
            badgeElement.style.color = 'white';
            container.appendChild(badgeElement);
        }
    }
    
    createAvatarItem(container, item) {
        // Avatar
        if (item.avatar || item.avatarText) {
            const avatarElement = document.createElement('div');
            avatarElement.className = 'item-avatar';
            
            // Apply avatar settings
            avatarElement.style.width = `${this.config.avatarSettings.size}px`;
            avatarElement.style.height = `${this.config.avatarSettings.size}px`;
            avatarElement.style.marginRight = `${this.config.avatarSettings.marginRight}px`;
            avatarElement.style.borderRadius = this.config.avatarSettings.borderRadius;
            
            if (this.config.avatarSettings.border) {
                avatarElement.style.border = this.config.avatarSettings.border;
            }
            if (this.config.avatarSettings.boxShadow) {
                avatarElement.style.boxShadow = Array.isArray(this.config.avatarSettings.boxShadow) 
                    ? this.config.avatarSettings.boxShadow.join(', ')
                    : this.config.avatarSettings.boxShadow;
            }
            if (this.config.avatarSettings.filter) {
                avatarElement.style.filter = this.config.avatarSettings.filter;
            }
            
            if (item.avatar) {
                avatarElement.style.backgroundImage = `url(${item.avatar})`;
            } else if (item.avatarText) {
                avatarElement.textContent = item.avatarText;
                avatarElement.style.backgroundColor = item.avatarColor || '#2196f3';
                avatarElement.style.color = 'white';
                avatarElement.style.fontSize = '12px';
            }
            
            container.appendChild(avatarElement);
        }
        
        // Content (reuse icon item content)
        this.createIconItem(container, item);
    }
    
    createMenuItem(container, item) {
        this.createIconItem(container, item);
        
        // Arrow for submenu
        if (item.submenu) {
            const arrowElement = document.createElement('div');
            arrowElement.className = 'item-expand-icon';
            arrowElement.textContent = '▶';
            container.appendChild(arrowElement);
        }
    }
    
    createTodoItem(container, item) {
        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.completed || false;
        checkbox.className = 'item-checkbox';
        container.appendChild(checkbox);
        
        // Text with strikethrough if completed
        const textElement = document.createElement('div');
        textElement.className = 'item-content';
        textElement.textContent = item.text || '';
        textElement.style.textDecoration = item.completed ? 'line-through' : 'none';
        textElement.style.color = item.completed ? '#999' : 'inherit';
        container.appendChild(textElement);
        
        // Priority indicator
        if (item.priority) {
            const priorityColors = {
                high: '#ff4444',
                medium: '#ffaa00',
                low: '#44ff44'
            };
            
            const priorityElement = document.createElement('div');
            priorityElement.className = 'item-priority';
            priorityElement.style.backgroundColor = priorityColors[item.priority] || '#ccc';
            container.appendChild(priorityElement);
        }
    }
    
    createNestedItem(container, item) {
        this.createIconItem(container, item);
        
        // Expand/collapse for children
        if (item.children && item.children.length > 0) {
            const expandIcon = document.createElement('div');
            expandIcon.className = 'item-expand-icon';
            expandIcon.textContent = item.expanded ? '▼' : '▶';
            container.appendChild(expandIcon);
            
            // Children container (initially hidden if not expanded)
            if (item.expanded) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'nested-children';
                this.listContainer.appendChild(childrenContainer);
                
                item.children.forEach((child, index) => {
                    const childElement = this.createListItem(child, `${item.id}_${index}`);
                    if (childElement) {
                        childrenContainer.appendChild(childElement);
                    }
                });
            }
        }
    }
    
    setupEventHandlers() {
        // Search functionality
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }
        
        // Sort functionality
        if (this.sortSelect) {
            this.sortSelect.addEventListener('change', (e) => {
                this.handleSort(e.target.value);
            });
        }
        
        // Item interactions
        this.listContainer.addEventListener('click', (e) => {
            const itemElement = e.target.closest('[data-item-id]');
            if (itemElement) {
                this.handleItemClick(itemElement, e);
            }
        });
        
        this.listContainer.addEventListener('dblclick', (e) => {
            const itemElement = e.target.closest('[data-item-id]');
            if (itemElement) {
                this.handleItemDoubleClick(itemElement, e);
            }
        });
        
        this.listContainer.addEventListener('mouseover', (e) => {
            const itemElement = e.target.closest('[data-item-id]');
            if (itemElement) {
                this.handleItemHover(itemElement, e);
            }
        });
        
        this.listContainer.addEventListener('mouseout', (e) => {
            const itemElement = e.target.closest('[data-item-id]');
            if (itemElement) {
                this.handleItemLeave(itemElement, e);
            }
        });
    }
    
    handleSearch(query) {
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
        
        this.renderItems();
        
        // Dispatch search event
        this.dispatchEvent(new CustomEvent('list-search', {
            detail: { query, filteredItems: this.filteredItems, list: this }
        }));
        
        this.config.callbacks.onSearch(query, this.filteredItems);
    }
    
    handleSort(field) {
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
        
        this.renderItems();
        
        // Dispatch sort event
        this.dispatchEvent(new CustomEvent('list-sort', {
            detail: { field, direction: this.sortOrder.direction, list: this }
        }));
        
        this.config.callbacks.onSort(field, this.sortOrder.direction);
    }
    
    handleItemClick(itemElement, event) {
        const itemId = itemElement.dataset.itemId;
        const item = this.findItemById(itemId);
        
        if (!item) {
            console.error('Item not found for ID:', itemId);
            return;
        }
        
        // Handle selection
        if (this.config.selectable) {
            if (this.config.multiSelect && (event.ctrlKey || event.metaKey)) {
                this.toggleItemSelection(itemId, itemElement);
            } else {
                this.selectItem(itemId, itemElement);
            }
        }
        
        // Apply custom hover style if item has one
        if (item.hoverStyle) {
            this.applyCustomStyles(itemElement, item.hoverStyle);
        }
        
        // Dispatch click event
        this.dispatchEvent(new CustomEvent('list-item-click', {
            detail: { item, itemId, element: itemElement, originalEvent: event, list: this }
        }));
        
        this.config.callbacks.onItemClick(item, itemId, event);
    }
    
    handleItemDoubleClick(itemElement, event) {
        const itemId = itemElement.dataset.itemId;
        const item = this.findItemById(itemId);
        
        if (!item) return;
        
        // Dispatch double-click event
        this.dispatchEvent(new CustomEvent('list-item-dblclick', {
            detail: { item, itemId, element: itemElement, originalEvent: event, list: this }
        }));
        
        this.config.callbacks.onItemDoubleClick(item, itemId, event);
    }
    
    handleItemHover(itemElement, event) {
        const itemId = itemElement.dataset.itemId;
        const item = this.findItemById(itemId);
        
        if (!item) return;
        
        // Apply custom hover style if item has one
        if (item.hoverStyle) {
            this.applyCustomStyles(itemElement, item.hoverStyle);
        }
        
        // Dispatch hover event
        this.dispatchEvent(new CustomEvent('list-item-hover', {
            detail: { item, itemId, element: itemElement, originalEvent: event, list: this }
        }));
        
        this.config.callbacks.onItemHover(item, itemId, event);
    }
    
    handleItemLeave(itemElement, event) {
        const itemId = itemElement.dataset.itemId;
        const item = this.findItemById(itemId);
        
        if (!item) return;
        
        // Reset to original style if not selected
        if (!this.selectedItems.has(itemId)) {
            if (item.style) {
                this.applyCustomStyles(itemElement, item.style);
            }
        }
        
        // Dispatch leave event
        this.dispatchEvent(new CustomEvent('list-item-leave', {
            detail: { item, itemId, element: itemElement, originalEvent: event, list: this }
        }));
        
        this.config.callbacks.onItemLeave(item, itemId, event);
    }
    
    findItemById(itemId) {
        return this.config.items.find(item => {
            const itemKey = this.getItemId(item, this.config.items.indexOf(item));
            return String(itemKey) === String(itemId);
        });
    }
    
    selectItem(itemId, itemElement) {
        // Clear previous selections
        this.selectedItems.forEach(id => {
            const element = this.itemElements.get(id);
            if (element) {
                element.classList.remove('selected');
                const item = this.findItemById(id);
                if (item && item.style) {
                    this.applyCustomStyles(element, item.style);
                }
            }
        });
        
        this.selectedItems.clear();
        this.selectedItems.add(itemId);
        itemElement.classList.add('selected');
        
        // Apply custom selected style if item has one
        const item = this.findItemById(itemId);
        if (item && item.selectedStyle) {
            this.applyCustomStyles(itemElement, item.selectedStyle);
        }
        
        // Dispatch selection change event
        this.dispatchEvent(new CustomEvent('list-selection-change', {
            detail: { selectedItems: [...this.selectedItems], list: this }
        }));
        
        this.config.callbacks.onSelectionChange([...this.selectedItems]);
    }
    
    toggleItemSelection(itemId, itemElement) {
        if (this.selectedItems.has(itemId)) {
            this.selectedItems.delete(itemId);
            itemElement.classList.remove('selected');
            
            // Reset to original style
            const item = this.findItemById(itemId);
            if (item && item.style) {
                this.applyCustomStyles(itemElement, item.style);
            }
        } else {
            this.selectedItems.add(itemId);
            itemElement.classList.add('selected');
            
            // Apply custom selected style if item has one
            const item = this.findItemById(itemId);
            if (item && item.selectedStyle) {
                this.applyCustomStyles(itemElement, item.selectedStyle);
            }
        }
        
        // Dispatch selection change event
        this.dispatchEvent(new CustomEvent('list-selection-change', {
            detail: { selectedItems: [...this.selectedItems], list: this }
        }));
        
        this.config.callbacks.onSelectionChange([...this.selectedItems]);
    }
    
    /**
     * Separate styles into host styles (positioning) and container styles (appearance)
     */
    separateStyles(styleObj) {
        if (!styleObj) return { hostStyles: {}, containerStyles: {} };
        
        const hostStyleProps = [
            'position', 'left', 'top', 'right', 'bottom', 
            'width', 'height', 'zIndex', 'transform'
        ];
        
        const hostStyles = {};
        const containerStyles = {};
        
        Object.entries(styleObj).forEach(([key, value]) => {
            if (hostStyleProps.includes(key)) {
                hostStyles[key] = value;
            } else {
                containerStyles[key] = value;
            }
        });
        
        return { hostStyles, containerStyles };
    }
}

// Register the Web Component
customElements.define('squirrel-list', List);

// Export for module imports (both named and default for compatibility)
export { List };
export default List;
