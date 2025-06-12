/**
 * 🚀 Module Web Component - Modern Particle System
 * 
 * Web Component ultra-moderne avec système de particules unifié
 * 
 * @version 3.0.0 - FIXED VERSION
 * @author Squirrel Framework Team
 */

// Import du système moderne centralisé
import { BaseComponent } from './BaseComponent.js';
import { UniversalParticleProcessor } from '../utils/universal-particle-processor.js';

class Module extends BaseComponent {
    static modules = new Map(); // Registry of all modules
    static connections = new Map(); // Registry of connections
    static draggedModule = null;
    static connectionInProgress = null;
    static selectedConnector = null;
    static selectedModules = new Set(); // Track selected modules
    
    constructor(config = {}) {
        super(); // Appeler le constructeur de BaseComponent
        
        // Traiter d'abord la configuration commune via BaseComponent
        this.processCommonConfig(config);
        
        // Configuration avancée avec propriétés CSS complètes et animations configurables
        this.config = this.mergeConfig(config);
        
        this.id = this.config.id;
        this.name = this.config.name;
        this.inputs = [...this.config.inputs];
        this.outputs = [...this.config.outputs];
        this.connections = new Set();
        this.selected = false;
        this.isDragging = false;
        this._isDragDisabled = false; // Flag to temporarily disable drag during rename
        this.dragOffset = { x: 0, y: 0 };
        
        // Initialize mouse coordinates for Shadow DOM search
        this._lastMouseX = 0;
        this._lastMouseY = 0;
        
        // Initialize interaction tracking
        this._lastInteraction = Date.now();
        this._interactionCount = 0;
        
        // Create shadow DOM pour encapsulation
        this.attachShadow({ mode: 'open' });
        
        this._createModule();
        this._setupEventHandlers();
        
        // Auto-attachment si spécifié
        if (this.config.attach) {
            this.performAutoAttach();
        }
        
        // Apply positioning
        this.applyPositioning();
        
        // Register module
        Module.modules.set(this.id, this);
        
        console.log(`🔧 Module Web Component created: ${this.id} (${this.name}) - Animations: ${this.config.animations.enabled}`);
    }
    
    mergeConfig(config) {
        const defaultConfig = {
            id: `module_${Date.now()}`,
            name: 'Untitled Module',
            attach: null,
            x: undefined,
            y: undefined,
            width: 200,
            height: 120,
            created: new Date().toISOString(),
            
            inputs: [],
            outputs: [],
            
            animations: {
                enabled: true,
                duration: '0.3s',
                timing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                
                moduleHover: {
                    enabled: true,
                    transform: 'scale(1.02) translateY(-2px) translateZ(0)',
                    duration: '0.3s',
                    timing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: [
                        '0 12px 32px rgba(0, 0, 0, 0.2)',
                        '0 6px 16px rgba(0, 0, 0, 0.15)',
                        'inset 0 3px 6px rgba(255, 255, 255, 0.15)',
                        'inset 0 -3px 6px rgba(0, 0, 0, 0.25)'
                    ]
                },
                
                moduleSelected: {
                    enabled: true,
                    transform: 'scale(1.05) translateZ(0)',
                    duration: '0.4s',
                    timing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                    boxShadow: [
                        '0 16px 40px rgba(52, 152, 219, 0.3)',
                        '0 8px 20px rgba(0, 0, 0, 0.2)',
                        'inset 0 2px 6px rgba(52, 152, 219, 0.2)',
                        'inset 0 -2px 6px rgba(0, 0, 0, 0.3)'
                    ]
                },
                
                moduleDrag: {
                    enabled: true,
                    transform: 'scale(1.08) rotateZ(2deg) translateZ(0)',
                    duration: '0.2s',
                    timing: 'ease-out',
                    boxShadow: [
                        '0 20px 50px rgba(0, 0, 0, 0.3)',
                        '0 10px 25px rgba(0, 0, 0, 0.2)',
                        'inset 0 4px 8px rgba(255, 255, 255, 0.2)'
                    ]
                },
                
                connectorHover: {
                    enabled: true,
                    transform: 'scale(1.3) translateZ(0)',
                    duration: '0.3s',
                    timing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    boxShadow: [
                        '0 6px 16px rgba(0, 0, 0, 0.3)',
                        '0 0 12px rgba(255, 255, 255, 0.5)',
                        'inset 0 2px 4px rgba(255, 255, 255, 0.4)',
                        'inset 0 -2px 4px rgba(0, 0, 0, 0.4)'
                    ]
                },
                
                connectorActive: {
                    enabled: true,
                    transform: 'scale(1.5) translateZ(0)',
                    duration: '0.2s',
                    timing: 'ease-out',
                    boxShadow: [
                        '0 8px 20px rgba(0, 0, 0, 0.4)',
                        '0 0 20px rgba(255, 255, 255, 0.8)',
                        'inset 0 3px 6px rgba(255, 255, 255, 0.5)'
                    ]
                }
            },
            
            containerStyle: {
                backgroundColor: '#2c3e50',
                border: '2px solid #34495e',
                borderRadius: '12px',
                cursor: 'move',
                fontFamily: '"Roboto", -apple-system, BlinkMacSystemFont, sans-serif',
                userSelect: 'none',
                boxShadow: [
                    '0 8px 24px rgba(0, 0, 0, 0.15)',
                    '0 4px 12px rgba(0, 0, 0, 0.1)',
                    'inset 0 2px 4px rgba(255, 255, 255, 0.1)',
                    'inset 0 -2px 4px rgba(0, 0, 0, 0.2)'
                ],
                background: 'linear-gradient(145deg, #34495e 0%, #2c3e50 50%, #243342 100%)'
            },
            
            headerStyle: {
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px 10px 0 0',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#ecf0f1',
                cursor: 'move',
                boxShadow: [
                    'inset 0 1px 2px rgba(255, 255, 255, 0.1)',
                    'inset 0 -1px 2px rgba(0, 0, 0, 0.2)'
                ],
                background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(0, 0, 0, 0.1) 100%)'
            },
            
            contentStyle: {
                padding: '12px 16px',
                borderRadius: '0 0 10px 10px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                minHeight: '60px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#bdc3c7',
                fontSize: '12px'
            },
            
            connectorConfig: {
                size: 14,
                spacing: 'auto',
                baseStyle: {
                    borderRadius: '50%',
                    border: '2px solid #ffffff',
                    cursor: 'crosshair',
                    boxShadow: [
                        '0 3px 8px rgba(0, 0, 0, 0.2)',
                        'inset 0 1px 2px rgba(255, 255, 255, 0.3)',
                        'inset 0 -1px 2px rgba(0, 0, 0, 0.3)'
                    ]
                }
            },
            
            connectorTypes: {
                audio: {
                    backgroundColor: '#e74c3c',
                    shape: 'circle',
                    background: 'radial-gradient(circle, #e74c3c 0%, #c0392b 100%)',
                    glowColor: 'rgba(231, 76, 60, 0.6)'
                },
                control: {
                    backgroundColor: '#3498db',
                    shape: 'square',
                    borderRadius: '3px',
                    background: 'linear-gradient(145deg, #3498db 0%, #2980b9 100%)',
                    glowColor: 'rgba(52, 152, 219, 0.6)'
                },
                data: {
                    backgroundColor: '#f39c12',
                    shape: 'triangle',
                    background: 'linear-gradient(145deg, #f39c12 0%, #e67e22 100%)',
                    glowColor: 'rgba(243, 156, 18, 0.6)'
                },
                midi: {
                    backgroundColor: '#9b59b6',
                    shape: 'diamond',
                    transform: 'rotateZ(45deg)',
                    background: 'linear-gradient(145deg, #9b59b6 0%, #8e44ad 100%)',
                    glowColor: 'rgba(155, 89, 182, 0.6)'
                },
                video: {
                    backgroundColor: '#e67e22',
                    shape: 'hexagon',
                    clipPath: 'polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%)',
                    background: 'linear-gradient(145deg, #e67e22 0%, #d35400 100%)',
                    glowColor: 'rgba(230, 126, 34, 0.6)'
                }
            },
            
            draggable: true,
            grid: { enabled: false, size: 20 },
            
            callbacks: {
                onModuleClick: () => {},
                onModuleDoubleClick: () => {},
                onModuleHover: () => {},
                onModuleLeave: () => {},
                onModuleSelect: () => {},
                onModuleDeselect: () => {},
                onModuleRename: () => {},
                onModuleDragStart: () => {},
                onModuleDragMove: () => {},
                onModuleDragEnd: () => {},
                onConnectorClick: () => {},
                onConnectorHover: () => {},
                onConnectionStart: () => {},
                onConnectionEnd: () => {},
                onConnectionCreate: () => {},
                onConnectionDelete: () => {}
            }
        };
        
        const mergedConfig = this.deepMerge(defaultConfig, config);
        this.setupAnimations(mergedConfig);
        return mergedConfig;
    }
    
    deepMerge(target, source) {
        const output = Object.assign({}, target);
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }
    
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
    
    setupAnimations(config) {
        if (!config.animations.enabled) {
            console.log('🚫 Animations désactivées pour module:', config.id);
            return;
        }
        
        config.containerStyle.transition = `all ${config.animations.duration} ${config.animations.timing}`;
        config.headerStyle.transition = `all ${config.animations.duration} ease`;
        config.connectorConfig.baseStyle.transition = `all ${config.animations.connectorHover.duration} ${config.animations.connectorHover.timing}`;
        
        console.log('🎬 Animations activées pour module:', config.id, {
            moduleHover: config.animations.moduleHover.enabled,
            connectorHover: config.animations.connectorHover.enabled,
            connectorActive: config.animations.connectorActive.enabled
        });
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
            this.style.width = `${this.config.width}px`;
            this.style.height = `${this.config.height}px`;
            this.style.zIndex = '1000';
        } else {
            this.style.width = `${this.config.width}px`;
            this.style.height = `${this.config.height}px`;
        }
    }
    
    _createModule() {
        const styles = this._generateStyles();
        
        this.container = document.createElement('div');
        this.container.className = 'module-container';
        this.container.id = this.id;
        
        this._createHeader();
        this._createContent();
        this._createConnectors();
        
        this.shadowRoot.appendChild(styles);
        this.shadowRoot.appendChild(this.container);
        
        // 🚀 APPLIQUER CONTAINER STYLE AVEC LE PROCESSEUR UNIVERSEL
        if (this.config.containerStyle) {
            this.setContainerStyle(this.config.containerStyle);
        }
    }
    
    _generateStyles() {
        const style = document.createElement('style');
        
        const formatShadow = (shadow) => {
            if (Array.isArray(shadow)) {
                return shadow.join(', ');
            }
            return shadow || '';
        };
        
        const objectToCSS = (obj) => {
            if (!obj) return '';
            
            return Object.entries(obj)
                .filter(([key, value]) => value !== null && value !== undefined)
                .map(([key, value]) => {
                    // Convert camelCase to kebab-case
                    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                    
                    // Handle array values (like multiple box-shadows)
                    if (Array.isArray(value)) {
                        return `${cssKey}: ${value.join(', ')};`;
                    }
                    
                    // Handle special cases
                    if (key === 'boxShadow') {
                        value = formatShadow(value);
                    }
                    
                    // Handle number values that need 'px'
                    if (typeof value === 'number' && this.needsPx(cssKey)) {
                        return `${cssKey}: ${value}px;`;
                    }
                    
                    return `${cssKey}: ${value};`;
                }).join('\n    ');
        };
        
        style.textContent = `
            .module-container {
                ${objectToCSS(this.config.containerStyle)}
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                position: relative;
                overflow: visible;
            }
            
            /* Animations conditionnelles pour modules */
            ${this.config.animations.enabled && this.config.animations.moduleHover.enabled ? `
            .module-container:hover {
                transform: ${this.config.animations.moduleHover.transform};
                box-shadow: ${formatShadow(this.config.animations.moduleHover.boxShadow)};
                transition: all ${this.config.animations.moduleHover.duration} ${this.config.animations.moduleHover.timing};
            }` : ''}
            
            ${this.config.animations.enabled && this.config.animations.moduleSelected.enabled ? `
            .module-container.selected {
                transform: ${this.config.animations.moduleSelected.transform};
                border-color: #3498db;
                box-shadow: ${formatShadow(this.config.animations.moduleSelected.boxShadow)};
                transition: all ${this.config.animations.moduleSelected.duration} ${this.config.animations.moduleSelected.timing};
            }` : ''}
            
            ${this.config.animations.enabled && this.config.animations.moduleDrag.enabled ? `
            .module-container.dragging {
                transform: ${this.config.animations.moduleDrag.transform};
                box-shadow: ${formatShadow(this.config.animations.moduleDrag.boxShadow)};
                filter: brightness(1.1);
                transition: all ${this.config.animations.moduleDrag.duration} ${this.config.animations.moduleDrag.timing};
            }` : ''}
            
            .module-header {
                ${objectToCSS(this.config.headerStyle)}
                flex: 0 0 auto;
                display: flex;
                align-items: center;
                position: relative;
                z-index: 2;
            }
            
            .module-rename-input {
                background: rgba(52, 152, 219, 0.1) !important;
                border: 1px solid #3498db !important;
                color: #ecf0f1 !important;
                font-family: inherit !important;
                font-size: inherit !important;
                font-weight: inherit !important;
                padding: 2px 4px !important;
                margin: -2px -4px !important;
                border-radius: 3px !important;
                outline: none !important;
                width: 100% !important;
                box-sizing: border-box !important;
                box-shadow: 0 0 8px rgba(52, 152, 219, 0.5) !important;
            }
            
            .module-rename-input:focus {
                background: rgba(52, 152, 219, 0.2) !important;
                box-shadow: 0 0 12px rgba(52, 152, 219, 0.8) !important;
            }
            
            .module-content {
                ${objectToCSS(this.config.contentStyle)}
                flex: 1;
                position: relative;
                z-index: 1;
            }
            
            .module-connector {
                ${objectToCSS(this.config.connectorConfig.baseStyle)}
                position: absolute;
                width: ${this.config.connectorConfig.size}px;
                height: ${this.config.connectorConfig.size}px;
                z-index: 3;
            }
            
            .connector-input {
                left: -${this.config.connectorConfig.size / 2}px;
            }
            
            .connector-output {
                right: -${this.config.connectorConfig.size / 2}px;
            }
            
            /* Styles pour chaque type de connecteur */
            ${Object.entries(this.config.connectorTypes).map(([type, config]) => `
                .connector-${type} {
                    ${objectToCSS(config)}
                }
                .connector-${type}:hover {
                    box-shadow: ${formatShadow(this.config.connectorConfig.baseStyle.boxShadow)}, 0 0 20px ${config.glowColor};
                }
            `).join('')}
            
            /* Animations conditionnelles pour connecteurs */
            ${this.config.animations.enabled && this.config.animations.connectorHover.enabled ? `
            .module-connector:hover {
                transform: ${this.config.animations.connectorHover.transform};
                box-shadow: ${formatShadow(this.config.animations.connectorHover.boxShadow)};
                transition: all ${this.config.animations.connectorHover.duration} ${this.config.animations.connectorHover.timing};
            }` : ''}
            
            ${this.config.animations.enabled && this.config.animations.connectorActive.enabled ? `
            .module-connector.active {
                transform: ${this.config.animations.connectorActive.transform};
                box-shadow: ${formatShadow(this.config.animations.connectorActive.boxShadow)};
                transition: all ${this.config.animations.connectorActive.duration} ${this.config.animations.connectorActive.timing};
            }` : ''}
            
            .module-connector.connecting {
                animation: connectorConnect 1s ease-in-out infinite;
            }
            
            /* Animations keyframes uniquement si animations activées */
            ${this.config.animations.enabled ? `
            @keyframes connectorConnect {
                0%, 100% { 
                    opacity: 0.8;
                }
                50% { 
                    opacity: 1;
                    box-shadow: ${formatShadow(this.config.connectorConfig.baseStyle.boxShadow)}, 
                                0 0 40px rgba(255, 255, 255, 1);
                }
            }
            ` : ''}
        `;
        
        return style;
    }
    
    _createHeader() {
        this.header = document.createElement('div');
        this.header.className = 'module-header';
        this.header.textContent = this.name;
        
        // Event pour renommage
        this.header.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._enableRename();
        });
        
        this.container.appendChild(this.header);
    }
    
    /**
     * Enable rename mode for the module
     * Disables drag during rename and creates an input field
     */
    _enableRename() {
        console.log(`📝 Enabling rename mode for module: ${this.name}`);
        
        // Disable drag during rename
        this._isDragDisabled = true;
        
        // Store original text
        const originalName = this.name;
        
        // Create input element
        const input = document.createElement('input');
        input.type = 'text';
        input.value = this.name;
        input.className = 'module-rename-input';
        
        // Style the input to match header
        input.style.cssText = `
            background: rgba(52, 152, 219, 0.1) !important;
            border: 1px solid #3498db !important;
            color: #ecf0f1 !important;
            font-family: inherit !important;
            font-size: inherit !important;
            font-weight: inherit !important;
            padding: 2px 4px !important;
            margin: -2px -4px !important;
            border-radius: 3px !important;
            outline: none !important;
            width: 100% !important;
            box-sizing: border-box !important;
            box-shadow: 0 0 8px rgba(52, 152, 219, 0.5) !important;
        `;
        
        // Replace header text with input
        this.header.textContent = '';
        this.header.appendChild(input);
        
        // Focus and select all text
        input.focus();
        input.select();
        
        // Handle input events
        const finishRename = (newName = null) => {
            // Re-enable drag
            this._isDragDisabled = false;
            
            // Get final name
            const finalName = newName || input.value.trim() || originalName;
            
            // Update module name
            if (finalName !== originalName) {
                this.name = finalName;
                console.log(`✅ Module renamed from "${originalName}" to "${finalName}"`);
                
                // Emit rename event
                this.dispatchEvent(new CustomEvent('moduleRenamed', {
                    detail: { 
                        module: this, 
                        oldName: originalName, 
                        newName: finalName 
                    },
                    bubbles: true
                }));
                
                // Call callback if provided
                if (this.config.callbacks.onModuleRename) {
                    this.config.callbacks.onModuleRename(this, originalName, finalName);
                }
            } else {
                console.log(`🔄 Module rename cancelled or unchanged: ${originalName}`);
            }
            
            // Restore header text
            this.header.textContent = this.name;
        };
        
        // Handle Enter key (confirm)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishRename();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishRename(originalName); // Cancel with original name
            }
        });
        
        // Handle blur (finish rename)
        input.addEventListener('blur', () => {
            finishRename();
        });
        
        // Prevent input events from bubbling to module
        input.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        
        input.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    _createContent() {
        this.content = document.createElement('div');
        this.content.className = 'module-content';
        this.content.textContent = 'Module Content';
        this.container.appendChild(this.content);
    }
    
    _createConnectors() {
        this.inputElements = new Map();
        this.inputs.forEach((input, index) => {
            const connector = this._createConnector(input, 'input', index);
            this.inputElements.set(input.id, connector);
            this.container.appendChild(connector);
        });
        
        this.outputElements = new Map();
        this.outputs.forEach((output, index) => {
            const connector = this._createConnector(output, 'output', index);
            this.outputElements.set(output.id, connector);
            this.container.appendChild(connector);
        });
    }
    
    _createConnector(config, type, index) {
        const connector = document.createElement('div');
        connector.className = `module-connector connector-${type} connector-${config.type}`;
        connector.dataset.connectorId = config.id;
        connector.dataset.connectorType = type;
        connector.dataset.dataType = config.type;
        connector.title = `${config.name || config.id} (${config.type})`;
        
        const connectors = type === 'input' ? this.inputs : this.outputs;
        const spacing = this.config.connectorConfig.spacing === 'auto' 
            ? (this.config.height - 60) / Math.max(1, connectors.length - 1)
            : this.config.connectorConfig.spacing;
        
        const y = 40 + (index * spacing);
        connector.style.top = `${y}px`;
        
        this._setupConnectorEvents(connector, config, type);
        
        return connector;
    }
    
    _setupConnectorEvents(connector, config, type) {
        connector.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                
                let dragStarted = false;
                const startX = e.clientX;
                const startY = e.clientY;
                const dragThreshold = 5;
                
                const handleMouseMove = (moveEvent) => {
                    const deltaX = moveEvent.clientX - startX;
                    const deltaY = moveEvent.clientY - startY;
                    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                    
                    if (distance > dragThreshold && !dragStarted) {
                        dragStarted = true;
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                        this._startConnectionDrag(connector, config, type, e);
                    }
                };
                
                const handleMouseUp = (upEvent) => {
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                    
                    if (!dragStarted) {
                        this._handleConnectorClick(connector, config, type, upEvent);
                    }
                };
                
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            }
        });
    }
    
    _setupEventHandlers() {
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container || this.container.contains(e.target)) {
                this._handleModuleClick(e);
            }
        });
        
        this.container.addEventListener('dblclick', (e) => {
            this._handleModuleDoubleClick(e);
        });
        
        if (this.config.draggable) {
            this._setupDragHandlers();
        }
    }
    
    _setupDragHandlers() {
        let startX, startY, startMouseX, startMouseY;
        
        this.header.addEventListener('mousedown', (e) => {
            if (this._isDragDisabled) return;
            
            if (e.button === 0) {
                this.isDragging = true;
                
                startX = this.config.x || 0;
                startY = this.config.y || 0;
                startMouseX = e.clientX;
                startMouseY = e.clientY;
                
                const handleMouseMove = (e) => {
                    if (this.isDragging && !this._isDragDisabled) {
                        const deltaX = e.clientX - startMouseX;
                        const deltaY = e.clientY - startMouseY;
                        
                        this.config.x = startX + deltaX;
                        this.config.y = startY + deltaY;
                        
                        this.style.left = `${this.config.x}px`;
                        this.style.top = `${this.config.y}px`;
                        
                        this._updateConnectionLines();
                    }
                };
                
                const handleMouseUp = (e) => {
                    if (this.isDragging) {
                        this.isDragging = false;
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                    }
                };
                
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
                
                e.preventDefault();
            }
        });
    }
    
    // Système de drag & drop pour créer des connexions
    _startConnectionDrag(connector, config, type, event) {
        console.log(`🎯 Début du drag de connexion: ${this.name}.${config.name}`);
        
        const sourceConnector = { connector, config, type, module: this };
        const tempLine = this._createTempConnectionLine(sourceConnector, event);
        this._selectConnector(sourceConnector);
        
        const handleMouseMove = (e) => {
            this._lastMouseX = e.clientX;
            this._lastMouseY = e.clientY;
            this._updateTempConnectionLine(tempLine, sourceConnector, e);
            
            const targetConnector = this._findConnectorAtPosition(e.clientX, e.clientY, [tempLine]);
            
            if (targetConnector && !this._isSameConnector(sourceConnector, targetConnector)) {
                this._highlightTargetConnector(targetConnector);
            } else {
                this._clearTargetHighlights();
            }
        };
        
        const handleMouseUp = (e) => {
            this._lastMouseX = e.clientX;
            this._lastMouseY = e.clientY;
            
            const targetConnector = this._findConnectorAtPosition(e.clientX, e.clientY, [tempLine]);
            
            if (tempLine && tempLine.parentNode) {
                tempLine.parentNode.removeChild(tempLine);
            }
            
            if (targetConnector && !this._isSameConnector(sourceConnector, targetConnector)) {
                console.log(`🎯 Connecteur cible trouvé: ${targetConnector.module.name}.${targetConnector.config.name}`);
                if (this._attemptConnection(sourceConnector, targetConnector)) {
                    console.log(`🔗 Connexion créée par drag: ${sourceConnector.module.name}.${sourceConnector.config.name} → ${targetConnector.module.name}.${targetConnector.config.name}`);
                } else {
                    console.log(`❌ Échec de la création de connexion par drag`);
                }
            } else {
                if (!targetConnector) {
                    console.log(`❌ Aucun connecteur cible trouvé à la position (${e.clientX}, ${e.clientY})`);
                } else if (this._isSameConnector(sourceConnector, targetConnector)) {
                    console.log(`❌ Connecteur cible identique au connecteur source`);
                } else {
                    console.log(`❌ Aucun connecteur cible valide trouvé`);
                }
            }
            
            this._deselectConnector(sourceConnector);
            this._clearTargetHighlights();
            
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            console.log('🏁 Fin du drag de connexion');
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    _createTempConnectionLine(sourceConnector, event) {
        const container = this._getOrCreateConnectionContainer();
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        
        line.setAttribute('stroke', '#3498db');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '5,5');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('fill', 'none');
        line.style.opacity = '0.7';
        line.style.pointerEvents = 'none';
        line.classList.add('temp-connection-line');
        
        const sourcePos = this._getConnectorPosition(sourceConnector);
        line.setAttribute('x1', sourcePos.x);
        line.setAttribute('y1', sourcePos.y);
        line.setAttribute('x2', event.clientX);
        line.setAttribute('y2', event.clientY);
        
        container.appendChild(line);
        return line;
    }
    
    _updateTempConnectionLine(line, sourceConnector, event) {
        if (!line) return;
        
        const sourcePos = this._getConnectorPosition(sourceConnector);
        line.setAttribute('x1', sourcePos.x);
        line.setAttribute('y1', sourcePos.y);
        line.setAttribute('x2', event.clientX);
        line.setAttribute('y2', event.clientY);
    }
    
    _findConnectorAtPosition(x, y, excludeElements = []) {
        this._lastMouseX = x;
        this._lastMouseY = y;
        
        const elementsToHide = [
            document.getElementById('module-connections-svg'),
            ...excludeElements
        ].filter(el => el);
        
        const originalStates = elementsToHide.map(el => ({
            element: el,
            pointerEvents: el.style.pointerEvents,
            visibility: el.style.visibility
        }));
        
        elementsToHide.forEach(el => {
            el.style.pointerEvents = 'none';
            el.style.visibility = 'hidden';
        });
        
        const element = document.elementFromPoint(x, y);
        console.log(`🎯 Element at position (${x}, ${y}):`, element?.tagName, element?.className);
        
        originalStates.forEach(state => {
            state.element.style.pointerEvents = state.pointerEvents;
            state.element.style.visibility = state.visibility;
        });
        
        return this._findConnectorFromElement(element);
    }
    
    _findConnectorFromElement(element) {
        if (!element) {
            console.log(`❌ Element is null`);
            return null;
        }
        
        console.log(`🔍 Searching for connector in element:`, element.tagName, element.className, element.id);
        
        if (element.tagName === 'SQUIRREL-MODULE') {
            console.log(`🔍 Searching inside Shadow DOM of module: ${element.id}`);
            
            const module = Module.modules.get(element.id);
            if (module && module.shadowRoot) {
                const shadowElement = module.shadowRoot.elementFromPoint(this._lastMouseX, this._lastMouseY);
                console.log(`🔍 Element from Shadow DOM:`, shadowElement?.tagName, shadowElement?.className);
                
                let current = shadowElement;
                let depth = 0;
                while (current && current !== module.shadowRoot && depth < 10) {
                    if (current.classList && current.classList.contains('module-connector')) {
                        console.log(`✅ Found connector in Shadow DOM!`, current);
                        
                        const connectorId = current.dataset.connectorId;
                        const connectorType = current.dataset.connectorType;
                        
                        console.log(`🔍 Connecteur trouvé: ${module.name}.${connectorId} (${connectorType})`);
                        
                        const connectors = connectorType === 'input' ? module.inputs : module.outputs;
                        const config = connectors.find(c => c.id === connectorId);
                        
                        if (config) {
                            return {
                                connector: current,
                                config: config,
                                type: connectorType,
                                module: module
                            };
                        } else {
                            console.warn(`⚠️ Configuration du connecteur ${connectorId} introuvable`);
                        }
                    }
                    current = current.parentNode;
                    depth++;
                }
                
                console.log(`❌ No connector found at mouse position in Shadow DOM`);
                return null;
            } else {
                console.warn(`⚠️ Module non trouvé dans le registry ou pas de Shadow DOM`);
            }
        }
        
        console.log(`❌ Aucun connecteur trouvé à cette position`);
        return null;
    }
    
    _highlightTargetConnector(connectorInfo) {
        this._clearTargetHighlights();
        
        if (connectorInfo && connectorInfo.connector) {
            connectorInfo.connector.classList.add('drag-target');
            connectorInfo.connector.style.boxShadow = '0 0 12px rgba(46, 204, 113, 0.8)';
        }
    }
    
    _clearTargetHighlights() {
        const highlightedConnectors = document.querySelectorAll('.module-connector.drag-target');
        highlightedConnectors.forEach(connector => {
            connector.classList.remove('drag-target');
            connector.style.boxShadow = '';
        });
    }
    
    _getOrCreateConnectionContainer() {
        let container = document.getElementById('module-connections-svg');
        if (!container) {
            container = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            container.id = 'module-connections-svg';
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.pointerEvents = 'none';
            container.style.zIndex = '999';
            console.log(`📦 Created SVG container with pointer-events: none and z-index: 999`);
            document.body.appendChild(container);
        }
        return container;
    }
    
    _getConnectorPosition(sourceConnector) {
        const connectorElement = sourceConnector.connector || sourceConnector;
        
        if (!connectorElement || !connectorElement.getBoundingClientRect) {
            console.warn(`⚠️ Cannot get position: connector element is null or invalid`, sourceConnector);
            return { x: 0, y: 0 };
        }
        
        const rect = connectorElement.getBoundingClientRect();
        
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }
    
    _updateConnectionLinePosition(line, source, target) {
        const sourcePos = this._getConnectorPosition(source);
        const targetPos = this._getConnectorPosition(target);
        
        line.setAttribute('x1', sourcePos.x);
        line.setAttribute('y1', sourcePos.y);
        line.setAttribute('x2', targetPos.x);
        line.setAttribute('y2', targetPos.y);
    }
    
    _selectConnector(connectorInfo) {
        if (connectorInfo && connectorInfo.connector) {
            connectorInfo.connector.classList.add('connecting', 'selected');
            connectorInfo.connector.style.boxShadow = '0 0 12px rgba(52, 152, 219, 0.8)';
        }
        Module.selectedConnector = connectorInfo;
        console.log(`📌 Connecteur sélectionné: ${connectorInfo.module.name}.${connectorInfo.config.name}`);
    }
    
    _deselectConnector(connectorInfo) {
        if (connectorInfo && connectorInfo.connector) {
            connectorInfo.connector.classList.remove('connecting', 'selected');
            connectorInfo.connector.style.boxShadow = '';
        }
        if (Module.selectedConnector === connectorInfo) {
            Module.selectedConnector = null;
        }
    }
    
    _handleConnectorClick(connector, config, type, event) {
        console.log(`🔌 Click sur connecteur: ${this.name}.${config.name} (${type})`);
        
        const clickedConnector = { connector, config, type, module: this };
        
        if (Module.selectedConnector) {
            if (this._isSameConnector(Module.selectedConnector, clickedConnector)) {
                this._deselectConnector(Module.selectedConnector);
                Module.selectedConnector = null;
                console.log('🔄 Connecteur désélectionné');
            } else {
                if (this._attemptConnection(Module.selectedConnector, clickedConnector)) {
                    console.log(`🔗 Connexion créée: ${Module.selectedConnector.module.name}.${Module.selectedConnector.config.name} → ${clickedConnector.module.name}.${clickedConnector.config.name}`);
                }
                this._deselectConnector(Module.selectedConnector);
                Module.selectedConnector = null;
            }
        } else {
            this._selectConnector(clickedConnector);
        }
    }
    
    _isSameConnector(connector1, connector2) {
        if (!connector1 || !connector2) return false;
        
        return connector1.module === connector2.module && 
               connector1.config.id === connector2.config.id &&
               connector1.type === connector2.type;
    }
    
    _findExistingConnection(source, target) {
        const id1 = `${source.module.id}_${source.config.id}_to_${target.module.id}_${target.config.id}`;
        const id2 = `${target.module.id}_${target.config.id}_to_${source.module.id}_${source.config.id}`;
        
        if (Module.connections.has(id1)) {
            return id1;
        }
        if (Module.connections.has(id2)) {
            return id2;
        }
        
        return null;
    }
    
    _attemptConnection(source, target) {
        console.log(`🔍 Tentative de connexion: ${source.module.name}.${source.config.name} → ${target.module.name}.${target.config.name}`);
        
        if (this._isSameConnector(source, target)) {
            console.log('❌ Cannot connect a connector to itself');
            return false;
        }
        
        const existingConnectionId = this._findExistingConnection(source, target);
        if (existingConnectionId) {
            console.log('🗑️ Connection already exists, removing it');
            this._removeConnection(existingConnectionId);
            return false;
        }
        
        if (source.type === target.type) {
            console.log('❌ Cannot connect same connector types (input-input or output-output)');
            return false;
        }
        
        const connectionId = `${source.module.id}_${source.config.id}_to_${target.module.id}_${target.config.id}`;
        
        const line = this._createConnectionLine(source, target);
        
        const connection = {
            id: connectionId,
            source: source,
            target: target,
            line: line,
            created: new Date().toISOString()
        };
        
        Module.connections.set(connectionId, connection);
        source.module.connections.add(connectionId);
        target.module.connections.add(connectionId);
        
        const container = this._getOrCreateConnectionContainer();
        container.appendChild(line);
        
        this.config.callbacks.onConnectionCreate(connection);
        
        this.dispatchEvent(new CustomEvent('connectionCreated', {
            detail: { connection, connectionId },
            bubbles: true
        }));
        
        console.log(`✅ Connexion créée: ${source.module.name}.${source.config.name} ↔ ${target.module.name}.${target.config.name}`);
        
        return true;
    }
    
    _createConnectionLine(source, target) {
        console.log(`📏 Création ligne de connexion: ${source.module.name}.${source.config.name} → ${target.module.name}.${target.config.name}`);
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        
        line.setAttribute('stroke', this._getConnectionColor(source, target));
        line.setAttribute('stroke-width', '3');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('fill', 'none');
        line.style.cursor = 'pointer';
        
        this._updateConnectionLinePosition(line, source, target);
        
        line.addEventListener('click', (e) => {
            e.stopPropagation();
            const connectionId = `${source.module.id}_${source.config.id}_to_${target.module.id}_${target.config.id}`;
            if (this._removeConnection(connectionId)) {
                console.log('🗑️ Connexion supprimée par click sur la ligne');
            }
        });
        
        console.log(`✅ Ligne de connexion créée et stylée`);
        return line;
    }
    
    _getConnectionColor(source, target) {
        const sourceType = source.config.type;
        const targetType = target.config.type;
        
        if (sourceType === targetType) {
            const typeColors = {
                audio: '#e74c3c',
                control: '#3498db',
                data: '#f39c12',
                midi: '#9b59b6',
                video: '#e67e22'
            };
            return typeColors[sourceType] || '#ffffff';
        }
        
        return '#95a5a6';
    }
    
    _removeConnection(connectionId) {
        const connection = Module.connections.get(connectionId);
        if (!connection) return false;
        
        if (connection.line && connection.line.parentNode) {
            connection.line.parentNode.removeChild(connection.line);
        }
        
        if (connection.line._visibleLine && connection.line._visibleLine.parentNode) {
            connection.line._visibleLine.parentNode.removeChild(connection.line._visibleLine);
        }
        
        Module.connections.delete(connectionId);
        connection.source.module.connections.delete(connectionId);
        connection.target.module.connections.delete(connectionId);
        
        this.dispatchEvent(new CustomEvent('connectionDeleted', {
            detail: { connection, connectionId },
            bubbles: true
        }));
        
        console.log(`🗑️ Connexion supprimée: ${connection.source.module.name}.${connection.source.config.name} ↔ ${connection.target.module.name}.${connection.target.config.name}`);
        
        return true;
    }
    
    _updateConnectionLines() {
        for (const connectionId of this.connections) {
            const connection = Module.connections.get(connectionId);
            if (connection && connection.line) {
                this._updateConnectionLinePosition(connection.line, connection.source, connection.target);
            }
        }
    }
    
    _handleModuleClick(event) {
        console.log(`📱 Module clicked: ${this.name}`);
        this.config.callbacks.onModuleClick(this, event);
    }
    
    _handleModuleDoubleClick(event) {
        console.log(`🖱️ Module double-clicked: ${this.name}`);
        this.config.callbacks.onModuleDoubleClick(this, event);
        // Le double-clic sur le header est déjà géré par l'événement spécifique du header
    }

    // Animation Control Methods
    setAnimationConfig(animationType, config) {
        if (!this.config.animations) {
            console.warn(`⚠️ Cannot set animation config: animations not initialized for module ${this.name}`);
            return;
        }
        
        if (!this.config.animations[animationType]) {
            console.warn(`⚠️ Unknown animation type: ${animationType}`);
            return;
        }
        
        Object.assign(this.config.animations[animationType], config);
        
        console.log(`🎬 Animation config updated for ${this.name}: ${animationType}`, config);
        
        this.setupAnimations(this.config);
        
        if (this.element) {
            this._applyAnimationStyles();
        }
    }
    
    disableAnimations() {
        if (!this.config.animations) {
            console.warn(`⚠️ Cannot disable animations: animations not initialized for module ${this.name}`);
            return;
        }
        
        this.config.animations.enabled = false;
        console.log(`🚫 Animations disabled for module: ${this.name}`);
        
        if (this.element) {
            this.element.style.transition = 'none';
            const header = this.element.querySelector('.module-header');
            if (header) header.style.transition = 'none';
            
            const connectors = this.element.querySelectorAll('.connector');
            connectors.forEach(connector => {
                connector.style.transition = 'none';
            });
        }
    }
    
    enableAnimations() {
        if (!this.config.animations) {
            console.warn(`⚠️ Cannot enable animations: animations not initialized for module ${this.name}`);
            return;
        }
        
        this.config.animations.enabled = true;
        console.log(`✅ Animations enabled for module: ${this.name}`);
        
        this.setupAnimations(this.config);
        this._applyAnimationStyles();
    }
    
    _applyAnimationStyles() {
        if (!this.element || !this.config.animations.enabled) return;
        
        const { animations } = this.config;
        
        this.element.style.transition = `all ${animations.duration} ${animations.timing}`;
        
        const header = this.element.querySelector('.module-header');
        if (header) {
            header.style.transition = `all ${animations.duration} ease`;
        }
        
        const connectors = this.element.querySelectorAll('.connector');
        connectors.forEach(connector => {
            connector.style.transition = `all ${animations.connectorHover.duration} ${animations.connectorHover.timing}`;
        });
    }
    
    /**
     * Check if CSS property needs 'px' unit
     */
    needsPx(cssProperty) {
        const pxProperties = new Set([
            'width', 'height', 'top', 'left', 'right', 'bottom',
            'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
            'border-radius', 'font-size', 'line-height', 'text-indent',
            'max-width', 'max-height', 'min-width', 'min-height'
        ]);
        return pxProperties.has(cssProperty);
    }
}

// Register the custom element
if (typeof customElements !== 'undefined') {
    customElements.define('squirrel-module', Module);
}

export default Module;
