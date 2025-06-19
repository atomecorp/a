# 🧩 Module API - Module System and Plugins

## 🚀 Basic Usage

### Loading a Module
```javascript
// Load a module dynamically
const myModule = await loadModule('path/to/module.js');

// Use the module
myModule.init();
myModule.doSomething();
```

### Creating a Simple Module
```javascript
// my-module.js
export default {
    name: 'MyModule',
    version: '1.0.0',
    
    init() {
        console.log('Module initialized');
    },
    
    createButton(text, onClick) {
        return new A({
            markup: 'button',
            text: text,
            onClick: onClick,
            backgroundColor: '#007bff',
            color: 'white',
            padding: '10px 20px',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
        });
    }
};
```

## 🏗️ Module Structure

### Standard Module Format
```javascript
export default {
    // Module metadata
    name: 'ModuleName',
    version: '1.0.0',
    description: 'Module description',
    author: 'Your Name',
    dependencies: ['otherModule'],
    
    // Module configuration
    config: {
        defaultSettings: {
            theme: 'light',
            autoInit: true
        }
    },
    
    // Initialization
    init(options = {}) {
        this.settings = { ...this.config.defaultSettings, ...options };
        this._setupModule();
        return this;
    },
    
    // Private methods (convention: prefix with _)
    _setupModule() {
        // Internal setup logic
    },
    
    // Public API methods
    publicMethod() {
        // Public functionality
    },
    
    // Cleanup
    destroy() {
        // Cleanup logic when module is unloaded
    }
};
```

## 📦 Module Types

### UI Component Module
```javascript
// ui-component-module.js
export default {
    name: 'UIComponents',
    version: '1.0.0',
    
    init() {
        this.components = new Map();
        return this;
    },
    
    createCard(config) {
        const card = new A({
            attach: config.attach || 'body',
            width: config.width || 300,
            height: config.height || 200,
            backgroundColor: config.backgroundColor || '#fff',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            
            // Add title if provided
            ...(config.title && {
                innerHTML: `<h3>${config.title}</h3>${config.content || ''}`
            })
        });
        
        if (config.id) {
            this.components.set(config.id, card);
        }
        
        return card;
    },
    
    createModal(config) {
        const overlay = new A({
            attach: 'body',
            position: 'fixed',
            top: 0, left: 0,
            width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        });
        
        const modal = new A({
            attach: overlay,
            width: config.width || 400,
            height: config.height || 300,
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            position: 'relative'
        });
        
        // Close button
        const closeBtn = new A({
            attach: modal,
            position: 'absolute',
            top: '10px', right: '10px',
            width: 30, height: 30,
            text: '×',
            fontSize: '20px',
            textAlign: 'center',
            lineHeight: '30px',
            cursor: 'pointer',
            onClick: () => overlay.getElement().remove()
        });
        
        return { overlay, modal, close: () => overlay.getElement().remove() };
    }
};
```

### Utility Module
```javascript
// utils-module.js
export default {
    name: 'Utils',
    version: '1.0.0',
    
    // String utilities
    formatText: {
        capitalize(text) {
            return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        },
        
        truncate(text, length = 50, suffix = '...') {
            return text.length > length ? text.substring(0, length) + suffix : text;
        },
        
        slugify(text) {
            return text.toLowerCase()
                      .replace(/[^\w\s-]/g, '')
                      .replace(/[\s_-]+/g, '-')
                      .replace(/^-+|-+$/g, '');
        }
    },
    
    // DOM utilities
    dom: {
        fadeIn(element, duration = 300) {
            element.style.opacity = '0';
            element.style.transition = `opacity ${duration}ms ease`;
            requestAnimationFrame(() => {
                element.style.opacity = '1';
            });
        },
        
        fadeOut(element, duration = 300) {
            element.style.transition = `opacity ${duration}ms ease`;
            element.style.opacity = '0';
            setTimeout(() => {
                element.style.display = 'none';
            }, duration);
        },
        
        slideDown(element, duration = 300) {
            element.style.height = '0';
            element.style.overflow = 'hidden';
            element.style.transition = `height ${duration}ms ease`;
            const targetHeight = element.scrollHeight + 'px';
            requestAnimationFrame(() => {
                element.style.height = targetHeight;
            });
        }
    },
    
    // Color utilities
    color: {
        hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        },
        
        rgbToHex(r, g, b) {
            return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        },
        
        lighten(color, percent) {
            const rgb = this.hexToRgb(color);
            if (!rgb) return color;
            
            const factor = 1 + (percent / 100);
            return this.rgbToHex(
                Math.min(255, Math.round(rgb.r * factor)),
                Math.min(255, Math.round(rgb.g * factor)),
                Math.min(255, Math.round(rgb.b * factor))
            );
        }
    }
};
```

## 🔄 Module Loader

### Loading Modules
```javascript
// Basic module loading
const module = await loadModule('./modules/my-module.js');

// Load module with configuration
const configuredModule = await loadModule('./modules/ui-module.js', {
    theme: 'dark',
    autoInit: true
});

// Load multiple modules
const modules = await Promise.all([
    loadModule('./modules/utils.js'),
    loadModule('./modules/ui-components.js'),
    loadModule('./modules/data-handler.js')
]);
```

### Module Registry
```javascript
// Register a module globally
registerModule('utils', utilsModule);
registerModule('ui', uiModule);

// Get registered module
const utils = getModule('utils');
const formattedText = utils.formatText.capitalize('hello world');

// List all registered modules
const moduleList = listModules();
console.log('Available modules:', moduleList);

// Unregister module
unregisterModule('oldModule');
```

## 🎯 Plugin System

### Creating a Plugin
```javascript
// theme-plugin.js
export default {
    name: 'ThemePlugin',
    version: '1.0.0',
    type: 'plugin',
    
    themes: {
        light: {
            backgroundColor: '#ffffff',
            textColor: '#333333',
            borderColor: '#dddddd'
        },
        dark: {
            backgroundColor: '#2c3e50',
            textColor: '#ecf0f1',
            borderColor: '#34495e'
        },
        blue: {
            backgroundColor: '#3498db',
            textColor: '#ffffff',
            borderColor: '#2980b9'
        }
    },
    
    currentTheme: 'light',
    
    init() {
        this.applyTheme(this.currentTheme);
        return this;
    },
    
    applyTheme(themeName) {
        if (!this.themes[themeName]) {
            console.warn(`Theme '${themeName}' not found`);
            return;
        }
        
        this.currentTheme = themeName;
        const theme = this.themes[themeName];
        
        // Apply theme to document
        document.documentElement.style.setProperty('--bg-color', theme.backgroundColor);
        document.documentElement.style.setProperty('--text-color', theme.textColor);
        document.documentElement.style.setProperty('--border-color', theme.borderColor);
        
        // Emit theme change event
        this.emitEvent('themeChanged', { theme: themeName, colors: theme });
    },
    
    createThemedElement(config) {
        const theme = this.themes[this.currentTheme];
        
        return new A({
            ...config,
            backgroundColor: config.backgroundColor || theme.backgroundColor,
            color: config.color || theme.textColor,
            border: config.border || `1px solid ${theme.borderColor}`
        });
    },
    
    // Event system for plugins
    listeners: new Map(),
    
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    },
    
    emitEvent(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }
};
```

### Using Plugins
```javascript
// Load and use the theme plugin
const themePlugin = await loadModule('./plugins/theme-plugin.js');
themePlugin.init();

// Create themed elements
const themedCard = themePlugin.createThemedElement({
    attach: 'body',
    width: 300, height: 200,
    text: 'Themed Card',
    padding: '20px'
});

// Switch themes
themePlugin.applyTheme('dark');

// Listen to theme changes
themePlugin.on('themeChanged', (data) => {
    console.log('Theme changed to:', data.theme);
});
```

## 🔧 Advanced Module Features

### Module with Dependencies
```javascript
// advanced-module.js
export default {
    name: 'AdvancedModule',
    version: '2.0.0',
    dependencies: ['utils', 'ui-components'],
    
    async init() {
        // Load dependencies
        this.utils = await loadModule('./modules/utils.js');
        this.ui = await loadModule('./modules/ui-components.js');
        
        this._setupModule();
        return this;
    },
    
    _setupModule() {
        this.initialized = true;
        console.log('Advanced module ready with dependencies');
    },
    
    createAdvancedCard(config) {
        // Use utility functions
        const title = this.utils.formatText.capitalize(config.title || 'untitled');
        
        // Use UI components
        return this.ui.createCard({
            ...config,
            title: title,
            content: this.utils.formatText.truncate(config.content || '', 100)
        });
    }
};
```

### Hot-Reloadable Module
```javascript
// hot-reload-module.js
export default {
    name: 'HotReloadModule',
    version: '1.0.0',
    
    init() {
        this.setupHotReload();
        return this;
    },
    
    setupHotReload() {
        if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
            // Development mode hot reload
            this.watchForChanges();
        }
    },
    
    watchForChanges() {
        // Simple file watcher for development
        setInterval(async () => {
            try {
                const response = await fetch(`${window.location.origin}/api/module-version`);
                const { version } = await response.json();
                
                if (version !== this.version) {
                    console.log('Module update detected, reloading...');
                    await this.reload();
                }
            } catch (error) {
                // Silently fail in case server is not available
            }
        }, 1000);
    },
    
    async reload() {
        this.destroy();
        const freshModule = await loadModule('./modules/hot-reload-module.js?' + Date.now());
        Object.assign(this, freshModule);
        this.init();
    },
    
    destroy() {
        // Cleanup before reload
        console.log('Cleaning up module before reload');
    }
};
```

## 🎨 Complete Example: Dashboard Module

```javascript
// dashboard-module.js
export default {
    name: 'Dashboard',
    version: '1.0.0',
    dependencies: ['ui-components', 'utils'],
    
    widgets: new Map(),
    
    async init(containerSelector = 'body') {
        this.container = containerSelector;
        this.ui = await loadModule('./modules/ui-components.js');
        this.utils = await loadModule('./modules/utils.js');
        
        this.createDashboard();
        return this;
    },
    
    createDashboard() {
        this.dashboardContainer = new A({
            attach: this.container,
            id: 'dashboard',
            width: '100%',
            height: '100vh',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
            padding: '20px',
            backgroundColor: '#f8f9fa'
        });
    },
    
    addWidget(config) {
        const widget = this.ui.createCard({
            attach: this.dashboardContainer,
            ...config,
            id: config.id || `widget_${Date.now()}`
        });
        
        this.widgets.set(widget.id, widget);
        return widget;
    },
    
    removeWidget(widgetId) {
        const widget = this.widgets.get(widgetId);
        if (widget) {
            widget.getElement().remove();
            this.widgets.delete(widgetId);
        }
    },
    
    createStatsWidget(title, value, change) {
        return this.addWidget({
            title: title,
            content: `
                <div style="text-align: center;">
                    <div style="font-size: 2rem; font-weight: bold; color: #2c3e50;">${value}</div>
                    <div style="color: ${change >= 0 ? '#27ae60' : '#e74c3c'};">
                        ${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}%
                    </div>
                </div>
            `,
            height: 150
        });
    },
    
    createChartWidget(title, data) {
        const chartContainer = this.addWidget({
            title: title,
            height: 300
        });
        
        // Simple bar chart visualization
        const chartElement = new A({
            attach: chartContainer,
            display: 'flex',
            alignItems: 'flex-end',
            height: '200px',
            padding: '20px',
            gap: '5px'
        });
        
        data.forEach((value, index) => {
            new A({
                attach: chartElement,
                width: '30px',
                height: `${(value / Math.max(...data)) * 100}%`,
                backgroundColor: `hsl(${index * 30}, 70%, 50%)`,
                title: `Value: ${value}`
            });
        });
        
        return chartContainer;
    }
};

// Usage example
(async () => {
    const dashboard = await loadModule('./modules/dashboard-module.js');
    await dashboard.init('#app');
    
    // Add some widgets
    dashboard.createStatsWidget('Total Users', '1,234', 12.5);
    dashboard.createStatsWidget('Revenue', '$45,678', -3.2);
    dashboard.createChartWidget('Monthly Sales', [120, 150, 180, 200, 165, 190]);
})();
```
