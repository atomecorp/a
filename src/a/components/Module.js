/**
 * 🔧 Module Web Component - Squirrel Framework
 * 
 * Web Component moderne pour modules programmation visuelle avec:
 * - Configuration flexible des animations (activable/désactivable)
 * - Support complet des propriétés CSS avancées (gradients, shadows multiples)
 * - Effets bombé sophistiqués avec relief 3D
 * - Animations de taille au toucher/survol configurables
 * - Auto-attachment et positioning
 * - Connecteurs draggables avec types visuels
 * 
 * @version 2.1.0 - ANIMATIONS CONFIGURABLES
 * @author Squirrel Framework Team
 */

class Module extends HTMLElement {
    static modules = new Map(); // Registry of all modules
    static connections = new Map(); // Registry of connections
    static draggedModule = null;
    static connectionInProgress = null;
    static selectedConnector = null;
    static selectedModules = new Set(); // Track selected modules
    
    constructor(config = {}) {
        super();
        
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
            created: new Date().toISOString(), // Add creation timestamp
            
            // Inputs/Outputs avec types visuels
            inputs: [],
            outputs: [],
            
            // Configuration des animations - Peut être désactivée
            animations: {
                enabled: true,  // true/false pour activer/désactiver toutes les animations
                duration: '0.3s',
                timing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                
                // Animations spécifiques pour modules
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
                
                // Animations spécifiques pour connecteurs
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
            
            // Style du container principal avec effet relief
            containerStyle: {
                backgroundColor: '#2c3e50',
                border: '2px solid #34495e',
                borderRadius: '12px',
                cursor: 'move',
                fontFamily: '"Roboto", -apple-system, BlinkMacSystemFont, sans-serif',
                userSelect: 'none',
                // Transition sera appliquée conditionnellement
                // Multiple shadows pour effet relief 3D
                boxShadow: [
                    '0 8px 24px rgba(0, 0, 0, 0.15)',        // Ombre externe pour élévation
                    '0 4px 12px rgba(0, 0, 0, 0.1)',         // Ombre secondaire
                    'inset 0 2px 4px rgba(255, 255, 255, 0.1)', // Highlight interne subtil
                    'inset 0 -2px 4px rgba(0, 0, 0, 0.2)'      // Ombre interne pour profondeur
                ],
                background: 'linear-gradient(145deg, #34495e 0%, #2c3e50 50%, #243342 100%)'
            },
            
            // Style du header avec effet bombé
            headerStyle: {
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px 10px 0 0',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#ecf0f1',
                cursor: 'move',
                // Transition sera appliquée conditionnellement
                // Effet relief subtil pour header
                boxShadow: [
                    'inset 0 1px 2px rgba(255, 255, 255, 0.1)',
                    'inset 0 -1px 2px rgba(0, 0, 0, 0.2)'
                ],
                background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(0, 0, 0, 0.1) 100%)'
            },
            
            // Style du contenu principal
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
            
            // Configuration des connecteurs avec styles avancés
            connectorConfig: {
                size: 14,
                spacing: 'auto', // ou valeur numérique
                // Style par défaut des connecteurs
                baseStyle: {
                    borderRadius: '50%',
                    border: '2px solid #ffffff',
                    cursor: 'crosshair',
                    // Transition sera appliquée conditionnellement
                    // Effet bombé pour connecteurs
                    boxShadow: [
                        '0 3px 8px rgba(0, 0, 0, 0.2)',           // Ombre externe
                        'inset 0 1px 2px rgba(255, 255, 255, 0.3)', // Highlight interne
                        'inset 0 -1px 2px rgba(0, 0, 0, 0.3)'      // Ombre interne
                    ]
                }
            },
            
            // Types de connecteurs avec couleurs et formes
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
            
            // Comportement
            draggable: true,
            grid: { enabled: false, size: 20 },
            
            // Callbacks avancés
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
        
        // Deep merge avec configuration utilisateur
        const mergedConfig = this.deepMerge(defaultConfig, config);
        
        // Application conditionnelle des animations selon la configuration
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
        // Configuration des animations selon config.animations
        if (!config.animations.enabled) {
            // Désactive toutes les animations
            console.log('🚫 Animations désactivées pour module:', config.id);
            return;
        }
        
        // Application des transitions selon la configuration
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
        // Create styles pour shadow DOM
        const styles = this._generateStyles();
        
        // Create container principal
        this.container = document.createElement('div');
        this.container.className = 'module-container';
        this.container.id = this.id;
        
        // Create header
        this._createHeader();
        
        // Create content area
        this._createContent();
        
        // Create connectors
        this._createConnectors();
        
        // Append to shadow DOM
        this.shadowRoot.appendChild(styles);
        this.shadowRoot.appendChild(this.container);
    }
    
    _generateStyles() {
        const style = document.createElement('style');
        
        // Helper function pour gérer les boxShadow multiples
        const formatShadow = (shadow) => {
            if (Array.isArray(shadow)) {
                return shadow.join(', ');
            }
            return shadow || '';
        };
        
        // Helper function pour générer CSS depuis objet style
        const objectToCSS = (obj) => {
            return Object.entries(obj).map(([key, value]) => {
                // Convert camelCase to kebab-case
                const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                
                // Handle special cases
                if (key === 'boxShadow') {
                    value = formatShadow(value);
                }
                
                return `${cssKey}: ${value};`;
            }).join('\\n    ');
        };
        
        // Générer styles hover/selected/drag conditionnellement
        const generateHoverStyles = () => {
            if (!this.config.animations.enabled || !this.config.animations.moduleHover.enabled) {
                return '';
            }
            
            return `
            .module-container:hover {
                transform: ${this.config.animations.moduleHover.transform};
                box-shadow: ${formatShadow(this.config.animations.moduleHover.boxShadow)};
                transition: all ${this.config.animations.moduleHover.duration} ${this.config.animations.moduleHover.timing};
            }`;
        };
        
        const generateSelectedStyles = () => {
            if (!this.config.animations.enabled || !this.config.animations.moduleSelected.enabled) {
                return '';
            }
            
            return `
            .module-container.selected {
                transform: ${this.config.animations.moduleSelected.transform};
                border-color: #3498db;
                box-shadow: ${formatShadow(this.config.animations.moduleSelected.boxShadow)};
                transition: all ${this.config.animations.moduleSelected.duration} ${this.config.animations.moduleSelected.timing};
            }`;
        };
        
        const generateDragStyles = () => {
            if (!this.config.animations.enabled || !this.config.animations.moduleDrag.enabled) {
                return '';
            }
            
            return `
            .module-container.dragging {
                transform: ${this.config.animations.moduleDrag.transform};
                box-shadow: ${formatShadow(this.config.animations.moduleDrag.boxShadow)};
                filter: brightness(1.1);
                transition: all ${this.config.animations.moduleDrag.duration} ${this.config.animations.moduleDrag.timing};
            }`;
        };
        
        const generateConnectorHoverStyles = () => {
            if (!this.config.animations.enabled || !this.config.animations.connectorHover.enabled) {
                return '';
            }
            
            return `
            .module-connector:hover {
                transform: ${this.config.animations.connectorHover.transform};
                box-shadow: ${formatShadow(this.config.animations.connectorHover.boxShadow)};
                transition: all ${this.config.animations.connectorHover.duration} ${this.config.animations.connectorHover.timing};
            }`;
        };
        
        const generateConnectorActiveStyles = () => {
            if (!this.config.animations.enabled || !this.config.animations.connectorActive.enabled) {
                return '';
            }
            
            return `
            .module-connector.active {
                transform: ${this.config.animations.connectorActive.transform};
                box-shadow: ${formatShadow(this.config.animations.connectorActive.boxShadow)};
                transition: all ${this.config.animations.connectorActive.duration} ${this.config.animations.connectorActive.timing};
            }`;
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
            
            ${generateHoverStyles()}
            ${generateSelectedStyles()}
            ${generateDragStyles()}
            
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
            
            ${generateConnectorHoverStyles()}
            ${generateConnectorActiveStyles()}
            
            .module-connector.connecting {
                animation: connectorConnect 1s ease-in-out infinite;
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
            
            .connector-input {
                left: -${this.config.connectorConfig.size / 2}px;
            }
            
            .connector-output {
                right: -${this.config.connectorConfig.size / 2}px;
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
            
            /* Responsive design */
            @media (max-width: 768px) {
                .module-container {
                    font-size: 12px;
                }
                
                .module-header {
                    padding: 8px 12px;
                    font-size: 11px;
                }
                
                .module-content {
                    padding: 8px 12px;
                    font-size: 10px;
                }
                
                .module-connector {
                    width: ${Math.max(10, this.config.connectorConfig.size - 2)}px;
                    height: ${Math.max(10, this.config.connectorConfig.size - 2)}px;
                }
            }
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
            background: transparent;
            border: 1px solid #3498db;
            color: #ecf0f1;
            font-family: inherit;
            font-size: inherit;
            font-weight: inherit;
            padding: 2px 4px;
            margin: -2px -4px;
            border-radius: 3px;
            outline: none;
            width: 100%;
            box-sizing: border-box;
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
        // Create input connectors
        this.inputElements = new Map();
        this.inputs.forEach((input, index) => {
            const connector = this._createConnector(input, 'input', index);
            this.inputElements.set(input.id, connector);
            this.container.appendChild(connector);
        });
        
        // Create output connectors
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
        
        // Calculate position
        const connectors = type === 'input' ? this.inputs : this.outputs;
        const spacing = this.config.connectorConfig.spacing === 'auto' 
            ? (this.config.height - 60) / Math.max(1, connectors.length - 1)
            : this.config.connectorConfig.spacing;
        
        const y = 40 + (index * spacing);
        connector.style.top = `${y}px`;
        
        // Setup connector events
        this._setupConnectorEvents(connector, config, type);
        
        return connector;
    }
    
    _setupConnectorEvents(connector, config, type) {
        let hoverTimeout;
        
        // Hover effects avec animation de taille conditionnelle
        connector.addEventListener('mouseenter', (e) => {
            clearTimeout(hoverTimeout);
            if (this.config.animations.enabled && this.config.animations.connectorHover.enabled) {
                // Animation sera gérée par CSS
            }
            this.config.callbacks.onConnectorHover(connector, config, type, e);
        });
        
        connector.addEventListener('mouseleave', (e) => {
            hoverTimeout = setTimeout(() => {
                // Reset hover state after delay
            }, 100);
        });
        
        // Gestion unifiée click/drag pour éviter les conflits
        let isDragging = false;
        let dragStarted = false;
        let startX, startY;
        
        connector.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click only
                isDragging = false;
                dragStarted = false;
                startX = e.clientX;
                startY = e.clientY;
                
                // Délai pour distinguer click vs drag
                const dragThreshold = 5; // pixels
                
                const handleMouseMove = (moveEvent) => {
                    const deltaX = moveEvent.clientX - startX;
                    const deltaY = moveEvent.clientY - startY;
                    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                    
                    if (distance > dragThreshold && !dragStarted) {
                        // C'est un drag, pas un click
                        dragStarted = true;
                        isDragging = true;
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                        
                        // Commencer le drag
                        this._startConnectionDrag(connector, config, type, e);
                    }
                };
                
                const handleMouseUp = (upEvent) => {
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                    
                    if (!dragStarted) {
                        // C'était un click simple
                        e.preventDefault();
                        e.stopPropagation();
                        this._handleConnectorClick(connector, config, type, upEvent);
                    }
                };
                
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            }
        });
        
        // Touch events pour mobile avec animation conditionnelle
        connector.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.config.animations.enabled && this.config.animations.connectorActive.enabled) {
                connector.classList.add('active');
            }
        });
        
        connector.addEventListener('touchend', (e) => {
            e.preventDefault();
            connector.classList.remove('active');
        });
    }
    
    _setupEventHandlers() {
        // Module click events
        this.container.addEventListener('click', (e) => {
            if (e.target === this.container || this.container.contains(e.target)) {
                this._handleModuleClick(e);
            }
        });
        
        this.container.addEventListener('dblclick', (e) => {
            this._handleModuleDoubleClick(e);
        });
        
        // Hover effects avec animation de taille conditionnelle
        this.container.addEventListener('mouseenter', (e) => {
            if (this.config.animations.enabled && this.config.animations.moduleHover.enabled) {
                // Animation sera gérée par CSS
            }
            this.config.callbacks.onModuleHover(this, e);
        });
        
        this.container.addEventListener('mouseleave', (e) => {
            this.config.callbacks.onModuleLeave(this, e);
        });
        
        // Drag and drop si activé
        if (this.config.draggable) {
            this._setupDragHandlers();
        }
    }
    
    _setupDragHandlers() {
        let startX, startY, startMouseX, startMouseY;
        
        this.header.addEventListener('mousedown', (e) => {
            // Skip drag if rename mode is active
            if (this._isDragDisabled) {
                return;
            }
            
            if (e.button === 0) { // Left click only
                this.isDragging = true;
                
                // Application conditionnelle de l'animation de drag
                if (this.config.animations.enabled && this.config.animations.moduleDrag.enabled) {
                    this.container.classList.add('dragging');
                }
                
                startX = this.config.x || 0;
                startY = this.config.y || 0;
                startMouseX = e.clientX;
                startMouseY = e.clientY;
                
                this.config.callbacks.onModuleDragStart(this, e);
                
                const handleMouseMove = (e) => {
                    if (this.isDragging && !this._isDragDisabled) {
                        const deltaX = e.clientX - startMouseX;
                        const deltaY = e.clientY - startMouseY;
                        
                        this.config.x = startX + deltaX;
                        this.config.y = startY + deltaY;
                        
                        // Apply grid snapping if enabled
                        if (this.config.grid.enabled) {
                            this.config.x = Math.round(this.config.x / this.config.grid.size) * this.config.grid.size;
                            this.config.y = Math.round(this.config.y / this.config.grid.size) * this.config.grid.size;
                        }
                        
                        this.style.left = `${this.config.x}px`;
                        this.style.top = `${this.config.y}px`;
                        
                        // Mettre à jour les lignes de connexion pendant le drag
                        this._updateConnectionLines();
                        
                        this.config.callbacks.onModuleDragMove(this, e);
                    }
                };
                
                const handleMouseUp = (e) => {
                    if (this.isDragging) {
                        this.isDragging = false;
                        this.container.classList.remove('dragging');
                        
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                        
                        this.config.callbacks.onModuleDragEnd(this, e);
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
        
        // Créer une ligne temporaire pour visualiser la connexion en cours
        const tempLine = this._createTempConnectionLine(sourceConnector, event);
        
        // Marquer le connecteur comme étant en cours de connexion
        this._selectConnector(sourceConnector);
        
        // Gestionnaires d'événements pour le drag
        const handleMouseMove = (e) => {
            // Store mouse coordinates for Shadow DOM search
            this._lastMouseX = e.clientX;
            this._lastMouseY = e.clientY;
            
            this._updateTempConnectionLine(tempLine, sourceConnector, e);
            
            // Debug drag state
            if (Math.random() < 0.1) { // Log 10% of move events to avoid spam
                this._debugDragState(e, 'MOVE');
            }
            
            // Détecter le connecteur cible sous la souris using improved method
            // Pass tempLine as element to exclude from detection
            const targetConnector = this._findConnectorAtPosition(e.clientX, e.clientY, [tempLine]);
            
            if (targetConnector && !this._isSameConnector(sourceConnector, targetConnector)) {
                // Highlight du connecteur cible potentiel
                this._highlightTargetConnector(targetConnector);
                console.log(`🎯 Target highlighted: ${targetConnector.module.name}.${targetConnector.config.name}`);
            } else {
                // Supprimer tous les highlights
                this._clearTargetHighlights();
            }
        };
        
        const handleMouseUp = (e) => {
            // Store final mouse coordinates for Shadow DOM search
            this._lastMouseX = e.clientX;
            this._lastMouseY = e.clientY;
            
            // Debug drag state at end
            this._debugDragState(e, 'END');
            
            // Trouver le connecteur cible using improved method BEFORE removing temp line
            const targetConnector = this._findConnectorAtPosition(e.clientX, e.clientY, [tempLine]);
            
            // Supprimer la ligne temporaire
            if (tempLine && tempLine.parentNode) {
                tempLine.parentNode.removeChild(tempLine);
            }
            
            if (targetConnector && !this._isSameConnector(sourceConnector, targetConnector)) {
                console.log(`🎯 Connecteur cible trouvé: ${targetConnector.module.name}.${targetConnector.config.name}`);
                // Tenter de créer la connexion
                if (this._attemptConnection(sourceConnector, targetConnector)) {
                    console.log(`🔗 Connexion créée par drag: ${sourceConnector.module.name}.${sourceConnector.config.name} → ${targetConnector.module.name}.${targetConnector.config.name}`);
                }
            } else {
                console.log(`❌ Aucun connecteur cible valide trouvé`);
            }
            
            // Nettoyer les états visuels
            this._deselectConnector(sourceConnector);
            this._clearTargetHighlights();
            
            // Supprimer les gestionnaires d'événements
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            console.log('🏁 Fin du drag de connexion');
        };
        
        // Ajouter les gestionnaires d'événements
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    _createTempConnectionLine(sourceConnector, event) {
        const container = this._getOrCreateConnectionContainer();
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        
        // Style de la ligne temporaire
        line.setAttribute('stroke', '#3498db');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '5,5');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('fill', 'none');
        line.style.opacity = '0.7';
        line.style.pointerEvents = 'none'; // Important: ne pas interférer avec elementFromPoint
        line.classList.add('temp-connection-line');
        
        // Position initiale
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
    
    _findConnectorFromElement(element) {
        if (!element) {
            console.log(`❌ Element is null`);
            return null;
        }
        
        console.log(`🔍 Searching for connector in element:`, element.tagName, element.className, element.id);
        
        // Si c'est un module (SQUIRREL-MODULE), chercher dans son Shadow DOM
        if (element.tagName === 'SQUIRREL-MODULE') {
            console.log(`🔍 Searching inside Shadow DOM of module: ${element.id}`);
            
            // Accéder directement au module via son ID
            const module = Module.modules.get(element.id);
            if (module && module.shadowRoot) {
                // Chercher tous les connecteurs dans le Shadow DOM
                const connectors = module.shadowRoot.querySelectorAll('.module-connector');
                console.log(`🔍 Found ${connectors.length} connectors in Shadow DOM`);
                
                // Pour chaque connecteur, vérifier s'il est à la position de la souris
                for (const connector of connectors) {
                    const rect = connector.getBoundingClientRect();
                    // On utilise les coordonnées de la dernière position de la souris
                    // (stockées dans une variable globale pour ce debug)
                    if (this._lastMouseX >= rect.left && this._lastMouseX <= rect.right &&
                        this._lastMouseY >= rect.top && this._lastMouseY <= rect.bottom) {
                        
                        console.log(`✅ Found connector at mouse position!`, connector);
                        
                        const connectorId = connector.dataset.connectorId;
                        const connectorType = connector.dataset.connectorType;
                        const dataType = connector.dataset.dataType;
                        
                        console.log(`🔍 Connecteur trouvé: ${module.name}.${connectorId} (${connectorType})`);
                        
                        // Trouver la configuration du connecteur
                        const connectors = connectorType === 'input' ? module.inputs : module.outputs;
                        const config = connectors.find(c => c.id === connectorId);
                        
                        if (config) {
                            return {
                                connector: connector,
                                config: config,
                                type: connectorType,
                                module: module
                            };
                        } else {
                            console.warn(`⚠️ Configuration du connecteur ${connectorId} introuvable`);
                        }
                    }
                }
                
                console.log(`❌ No connector found at mouse position in Shadow DOM`);
                return null;
            }
        }
        
        // Fallback: remonter l'arbre DOM classique pour les autres éléments
        let current = element;
        let depth = 0;
        while (current && current !== document.body && depth < 10) {
            console.log(`  └─ Level ${depth}: ${current.tagName}.${current.className} [${current.id}]`);
            
            if (current.classList && current.classList.contains('module-connector')) {
                console.log(`  ✅ Found connector element!`);
                
                // Trouver le module propriétaire
                const moduleElement = current.closest('squirrel-module');
                if (moduleElement) {
                    const module = moduleElement;
                    const connectorId = current.dataset.connectorId;
                    const connectorType = current.dataset.connectorType;
                    const dataType = current.dataset.dataType;
                    
                    console.log(`🔍 Connecteur trouvé: ${module.name}.${connectorId} (${connectorType})`);
                    
                    // Trouver la configuration du connecteur
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
                } else {
                    console.warn(`⚠️ Module parent introuvable pour le connecteur`);
                }
            }
            current = current.parentNode;
            depth++;
        }
        
        console.log(`❌ Aucun connecteur trouvé à cette position (searched ${depth} levels)`);
        return null;
    }
    
    /**
     * Enhanced connector detection for drag operations
     * Temporarily hides interfering elements to get accurate elementFromPoint results
     */
    _findConnectorAtPosition(x, y, excludeElements = []) {
        // Store mouse coordinates for Shadow DOM search
        this._lastMouseX = x;
        this._lastMouseY = y;
        
        // Store original states of elements to hide
        const elementsToHide = [
            document.getElementById('module-connections-svg'),
            ...excludeElements
        ].filter(el => el); // Remove null elements
        
        const originalStates = elementsToHide.map(el => ({
            element: el,
            pointerEvents: el.style.pointerEvents,
            visibility: el.style.visibility
        }));
        
        // Temporarily hide interfering elements
        elementsToHide.forEach(el => {
            el.style.pointerEvents = 'none';
            el.style.visibility = 'hidden';
        });
        
        // Get element at position
        const element = document.elementFromPoint(x, y);
        console.log(`🎯 Element at position (${x}, ${y}):`, element?.tagName, element?.className);
        
        // Restore original states
        originalStates.forEach(state => {
            state.element.style.pointerEvents = state.pointerEvents;
            state.element.style.visibility = state.visibility;
        });
        
        // Find connector from element with Shadow DOM support
        return this._findConnectorFromElement(element);
    }
    
    _highlightTargetConnector(connectorInfo) {
        // Supprimer les anciens highlights
        this._clearTargetHighlights();
        
        // Ajouter le highlight au connecteur cible
        if (connectorInfo && connectorInfo.connector) {
            connectorInfo.connector.classList.add('drag-target');
            connectorInfo.connector.style.boxShadow = '0 0 12px rgba(46, 204, 113, 0.8)';
        }
    }
    
    _clearTargetHighlights() {
        // Supprimer tous les highlights de drag
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
            container.style.pointerEvents = 'none'; // Important: ne pas bloquer les interactions
            container.style.zIndex = '999'; // Plus bas que les modules (1000)
            container.classList.add('connections-layer');
            
            console.log('📦 Created SVG container with pointer-events: none and z-index: 999');
            
            document.body.appendChild(container);
        }
        return container;
    }
    
    _getConnectionColor(source, target) {
        // Couleur basée sur le type de données
        const sourceType = source.config.type;
        const targetType = target.config.type;
        
        // Si les types correspondent, utiliser la couleur du type
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
        
        // Sinon, couleur neutre
        return '#95a5a6';
    }
    
    _updateConnectionLinePosition(line, source, target) {
        // Obtenir les positions des connecteurs
        const sourcePos = this._getConnectorPosition(source);
        const targetPos = this._getConnectorPosition(target);
        
        line.setAttribute('x1', sourcePos.x);
        line.setAttribute('y1', sourcePos.y);
        line.setAttribute('x2', targetPos.x);
        line.setAttribute('y2', targetPos.y);
        
        // Mettre à jour aussi la ligne visible si elle existe
        if (line._visibleLine) {
            line._visibleLine.setAttribute('x1', sourcePos.x);
            line._visibleLine.setAttribute('y1', sourcePos.y);
            line._visibleLine.setAttribute('x2', targetPos.x);
            line._visibleLine.setAttribute('y2', targetPos.y);
        }
    }
    
    _getConnectorPosition(connectorInfo) {
        const connector = connectorInfo.connector;
        const rect = connector.getBoundingClientRect();
        
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }
    
    // Méthodes utilitaires pour les connexions (manquantes)
    
    _isSameConnector(connector1, connector2) {
        return (
            connector1.module.id === connector2.module.id &&
            connector1.config.id === connector2.config.id &&
            connector1.type === connector2.type
        );
    }
    
    _findExistingConnection(source, target) {
        // Chercher une connexion existante entre ces deux connecteurs (dans les deux sens)
        const id1 = `${source.module.id}_${source.config.id}_to_${target.module.id}_${target.config.id}`;
        const id2 = `${target.module.id}_${target.config.id}_to_${source.module.id}_${source.config.id}`;
        
        if (Module.connections.has(id1)) return id1;
        if (Module.connections.has(id2)) return id2;
        
        return null;
    }
    
    _getConnectorConnections(connectorInfo) {
        const connections = [];
        for (const [id, connection] of Module.connections.entries()) {
            if (this._isSameConnector(connection.source, connectorInfo) ||
                this._isSameConnector(connection.target, connectorInfo)) {
                connections.push(connection);
            }
        }
        return connections;
    }
    
    _selectConnector(connectorInfo) {
        if (this.config.animations.enabled) {
            connectorInfo.connector.classList.add('connecting', 'selected');
        }
        
        // Ajouter un effet visuel
        connectorInfo.connector.style.boxShadow = '0 0 12px rgba(52, 152, 219, 0.8)';
    }
    
    _deselectConnector(connectorInfo) {
        if (connectorInfo && connectorInfo.connector) {
            connectorInfo.connector.classList.remove('connecting', 'selected', 'active');
            connectorInfo.connector.style.boxShadow = '';
        }
    }
    
    _removeConnection(connectionId) {
        const connection = Module.connections.get(connectionId);
        if (!connection) return false;
        
        // Supprimer la ligne visuelle et sa ligne visible associée
        if (connection.line && connection.line.parentNode) {
            if (connection.line._visibleLine && connection.line._visibleLine.parentNode) {
                connection.line._visibleLine.parentNode.removeChild(connection.line._visibleLine);
            }
            connection.line.parentNode.removeChild(connection.line);
        }
        
        // Supprimer des registres des modules
        connection.source.module.connections.delete(connectionId);
        connection.target.module.connections.delete(connectionId);
        
        // Supprimer de la map globale
        Module.connections.delete(connectionId);
        
        // Événements
        this.config.callbacks.onConnectionDelete(connection);
        
        // Émettre un événement personnalisé
        this.dispatchEvent(new CustomEvent('connectionDeleted', {
            detail: { connection, connectionId },
            bubbles: true
        }));
        
        console.log(`🗑️ Connexion supprimée: ${connection.source.module.name}.${connection.source.config.name} ↔ ${connection.target.module.name}.${connection.target.config.name}`);
        
        return true;
    }
    
    _createConnectionLine(source, target) {
        console.log(`📏 Création ligne de connexion: ${source.module.name}.${source.config.name} → ${target.module.name}.${target.config.name}`);
        
        // Créer un conteneur SVG si nécessaire
        const container = this._getOrCreateConnectionContainer();
        
        // Créer une ligne SVG pour la connexion visuelle
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        
        // Style de base de la ligne
        line.setAttribute('stroke', this._getConnectionColor(source, target));
        line.setAttribute('stroke-width', '3');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('fill', 'none');
        line.style.pointerEvents = 'auto';
        line.style.cursor = 'pointer';
        
        // Ajouter une classe pour le styling CSS
        line.classList.add('connection-line');
        line.dataset.sourceModule = source.module.id;
        line.dataset.targetModule = target.module.id;
        line.dataset.sourceConnector = source.config.id;
        line.dataset.targetConnector = target.config.id;
        
        // Calculer et appliquer les positions
        this._updateConnectionLinePosition(line, source, target);
        
        // Ajouter un événement click pour supprimer la connexion
        line.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const connectionId = `${source.module.id}_${source.config.id}_to_${target.module.id}_${target.config.id}`;
            this._removeConnection(connectionId);
            console.log('🗑️ Connexion supprimée par click sur la ligne');
        });
        
        // Effet hover
        line.addEventListener('mouseenter', () => {
            line.setAttribute('stroke-width', '5');
            line.style.filter = 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.8))';
        });
        
        line.addEventListener('mouseleave', () => {
            line.setAttribute('stroke-width', '3');
            line.style.filter = 'none';
        });
        
        // Important: permettre les interactions uniquement sur les lignes finales
        line.style.pointerEvents = 'stroke';
        line.style.strokeWidth = '8'; // Zone de clic plus large
        line.style.stroke = 'transparent'; // Stroke invisible pour la zone de clic
        
        // Ligne visible par-dessus
        const visibleLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        visibleLine.setAttribute('stroke', this._getConnectionColor(source, target));
        visibleLine.setAttribute('stroke-width', '3');
        visibleLine.setAttribute('stroke-linecap', 'round');
        visibleLine.setAttribute('fill', 'none');
        visibleLine.style.pointerEvents = 'none';
        visibleLine.classList.add('connection-line-visible');
        
        // Copier les attributs de position
        this._updateConnectionLinePosition(visibleLine, source, target);
        container.appendChild(visibleLine);
        
        // Stocker la référence à la ligne visible
        line._visibleLine = visibleLine;
        
        console.log(`✅ Ligne de connexion créée et stylée`);
        return line;
    }
    
    // === CONNECTION SYSTEM METHODS ===
    
    /**
     * Handle connector click events (simple clicks, not drags)
     */
    _handleConnectorClick(connector, config, type, event) {
        console.log(`🔌 Click sur connecteur: ${this.name}.${config.name} (${type})`);
        
        const clickedConnector = { connector, config, type, module: this };
        
        if (Module.selectedConnector) {
            // Il y a déjà un connecteur sélectionné - tenter une connexion
            if (this._isSameConnector(Module.selectedConnector, clickedConnector)) {
                // Clic sur le même connecteur - désélectionner
                this._deselectConnector(Module.selectedConnector);
                Module.selectedConnector = null;
                console.log('🔄 Connecteur désélectionné');
            } else {
                // Tenter de créer une connexion
                if (this._attemptConnection(Module.selectedConnector, clickedConnector)) {
                    console.log(`🔗 Connexion créée: ${Module.selectedConnector.module.name}.${Module.selectedConnector.config.name} → ${clickedConnector.module.name}.${clickedConnector.config.name}`);
                }
                
                // Nettoyer la sélection
                this._deselectConnector(Module.selectedConnector);
                Module.selectedConnector = null;
            }
        } else {
            // Aucun connecteur sélectionné - sélectionner celui-ci
            this._selectConnector(clickedConnector);
            Module.selectedConnector = clickedConnector;
            console.log(`📌 Connecteur sélectionné: ${this.name}.${config.name}`);
        }
        
        // Callback utilisateur
        this.config.callbacks.onConnectorClick(connector, config, type, event);
    }
    
    /**
     * Attempt to create a connection between two connectors
     */
    _attemptConnection(source, target) {
        console.log(`🔍 Tentative de connexion: ${source.module.name}.${source.config.name} → ${target.module.name}.${target.config.name}`);
        
        // Validation de base
        if (this._isSameConnector(source, target)) {
            console.log('❌ Cannot connect a connector to itself');
            return false;
        }
        
        // Vérifier si une connexion existe déjà
        const existingConnectionId = this._findExistingConnection(source, target);
        if (existingConnectionId) {
            console.log('🗑️ Connection already exists, removing it');
            this._removeConnection(existingConnectionId);
            return false; // On a supprimé au lieu de créer
        }
        
        // Validation type (input ne peut pas se connecter à input, etc.)
        if (source.type === target.type) {
            console.log('❌ Cannot connect same connector types (input-input or output-output)');
            return false;
        }
        
        // Créer l'ID de connexion
        const connectionId = `${source.module.id}_${source.config.id}_to_${target.module.id}_${target.config.id}`;
        
        // Créer la ligne visuelle
        const line = this._createConnectionLine(source, target);
        
        // Créer l'objet de connexion
        const connection = {
            id: connectionId,
            source: source,
            target: target,
            line: line,
            created: new Date().toISOString()
        };
        
        // Enregistrer la connexion
        Module.connections.set(connectionId, connection);
        source.module.connections.add(connectionId);
        target.module.connections.add(connectionId);
        
        // Ajouter la ligne au DOM
        const container = this._getOrCreateConnectionContainer();
        container.appendChild(line);
        
        // Callbacks et événements
        this.config.callbacks.onConnectionCreate(connection);
        
        // Émettre un événement personnalisé
        this.dispatchEvent(new CustomEvent('connectionCreated', {
            detail: { connection, connectionId },
            bubbles: true
        }));
        
        console.log(`✅ Connexion créée: ${source.module.name}.${source.config.name} ↔ ${target.module.name}.${target.config.name}`);
        
        return true;
    }
    
    /**
     * Handle module click events
     */
    _handleModuleClick(event) {
        // Ne pas traiter si c'est un clic sur un connecteur
        if (event.target.classList.contains('module-connector')) {
            return;
        }
        
        console.log(`📱 Module clicked: ${this.name}`);
        
        // Track interaction
        this._updateInteraction();
        
        // Check for modifier keys for multi-selection
        const addToSelection = event.ctrlKey || event.metaKey || event.shiftKey;
        
        // Toggle selection with multi-selection support
        this.toggleSelection(addToSelection);
        
        // Callbacks et événements
        this.config.callbacks.onModuleClick(this, event);
        
        this.dispatchEvent(new CustomEvent('moduleClick', {
            detail: { 
                module: this, 
                selected: this.selected,
                totalSelected: Module.selectedModules.size,
                multiSelect: addToSelection
            },
            bubbles: true
        }));
    }

    /**
     * Update interaction tracking
     */
    _updateInteraction() {
        this._lastInteraction = Date.now();
        this._interactionCount = (this._interactionCount || 0) + 1;
    }
    
    /**
     * Handle module double click events
     */
    _handleModuleDoubleClick(event) {
        console.log(`🖱️ Module double-clicked: ${this.name}`);
        
        this.config.callbacks.onModuleDoubleClick(this, event);
        
        this.dispatchEvent(new CustomEvent('moduleDoubleClick', {
            detail: { module: this },
            bubbles: true
        }));
    }
    
    // === PUBLIC API METHODS ===
    
    /**
     * Connect this module's output to another module's input
     * @param {Module} targetModule - Target module to connect to
     * @param {string} outputId - ID of output connector on this module
     * @param {string} inputId - ID of input connector on target module
     * @returns {boolean} - True if connection was successful
     */
    connectTo(targetModule, outputId, inputId) {
        console.log(`🔗 API connectTo: ${this.name}.${outputId} → ${targetModule.name}.${inputId}`);
        
        // Find source output
        const outputConfig = this.outputs.find(o => o.id === outputId);
        if (!outputConfig) {
            console.error(`❌ Output connector '${outputId}' not found on module '${this.name}'`);
            return false;
        }
        
        // Find target input
        const inputConfig = targetModule.inputs.find(i => i.id === inputId);
        if (!inputConfig) {
            console.error(`❌ Input connector '${inputId}' not found on module '${targetModule.name}'`);
            return false;
        }
        
        // Get DOM elements
        const outputElement = this.outputElements.get(outputId);
        const inputElement = targetModule.inputElements.get(inputId);
        
        if (!outputElement || !inputElement) {
            console.error(`❌ Could not find DOM elements for connectors`);
            return false;
        }
        
        // Create connector objects
        const source = { 
            connector: outputElement, 
            config: outputConfig, 
            type: 'output', 
            module: this 
        };
        const target = { 
            connector: inputElement, 
            config: inputConfig, 
            type: 'input', 
            module: targetModule 
        };
        
        // Attempt connection
        return this._attemptConnection(source, target);
    }
    
    /**
     * Disconnect all connections from this module
     * @returns {number} - Number of connections removed
     */
    disconnectAll() {
        console.log(`🗑️ Disconnecting all connections from module: ${this.name}`);
        
        let disconnectedCount = 0;
        
        // Get copy of connections to avoid modification during iteration
        const connectionIds = Array.from(this.connections);
        
        for (const connectionId of connectionIds) {
            if (this._removeConnection(connectionId)) {
                disconnectedCount++;
            }
        }
        
        console.log(`✅ Disconnected ${disconnectedCount} connections from ${this.name}`);
        return disconnectedCount;
    }
    
    /**
     * Update connection line positions (called during module drag)
     */
    _updateConnectionLines() {
        for (const connectionId of this.connections) {
            const connection = Module.connections.get(connectionId);
            if (connection && connection.line) {
                this._updateConnectionLinePosition(connection.line, connection.source, connection.target);
            }
        }
    }

    /**
     * Get connection statistics for this module
     * @returns {Object} - Connection statistics
     */
    getConnectionStats() {
        const stats = {
            totalConnections: this.connections.size,
            inputConnections: 0,
            outputConnections: 0,
            connectedInputs: new Set(),
            connectedOutputs: new Set(),
            connectionsByType: {},
            connectedModules: new Set(),
            connections: []
        };

        // Analyze each connection
        for (const connectionId of this.connections) {
            const connection = Module.connections.get(connectionId);
            if (!connection) continue;

            const connectionInfo = {
                id: connectionId,
                source: {
                    module: connection.source.module.name,
                    connector: connection.source.config.name || connection.source.config.id,
                    type: connection.source.config.type
                },
                target: {
                    module: connection.target.module.name,
                    connector: connection.target.config.name || connection.target.config.id,
                    type: connection.target.config.type
                },
                dataType: connection.source.config.type,
                created: connection.created
            };

            stats.connections.push(connectionInfo);

            // Count input vs output connections for this module
            if (connection.source.module.id === this.id) {
                stats.outputConnections++;
                stats.connectedOutputs.add(connection.source.config.id);
                stats.connectedModules.add(connection.target.module.id);
            }

            if (connection.target.module.id === this.id) {
                stats.inputConnections++;
                stats.connectedInputs.add(connection.target.config.id);
                stats.connectedModules.add(connection.source.module.id);
            }

            // Count by data type
            const dataType = connection.source.config.type;
            if (!stats.connectionsByType[dataType]) {
                stats.connectionsByType[dataType] = 0;
            }
            stats.connectionsByType[dataType]++;
        }

        // Calculate ratios
        stats.inputRatio = this.inputs.length > 0 ? stats.connectedInputs.size / this.inputs.length : 0;
        stats.outputRatio = this.outputs.length > 0 ? stats.connectedOutputs.size / this.outputs.length : 0;
        stats.connectedModulesCount = stats.connectedModules.size;

        return stats;
    }

    /**
     * Get detailed connector information
     * @returns {Object} - Detailed connector info
     */
    getConnectorInfo() {
        return {
            inputs: this.inputs.map(input => ({
                id: input.id,
                name: input.name || input.id,
                type: input.type,
                connected: this._isConnectorConnected('input', input.id),
                connections: this._getConnectorConnections({ module: this, config: input, type: 'input' }).length
            })),
            outputs: this.outputs.map(output => ({
                id: output.id,
                name: output.name || output.id,
                type: output.type,
                connected: this._isConnectorConnected('output', output.id),
                connections: this._getConnectorConnections({ module: this, config: output, type: 'output' }).length
            }))
        };
    }

    /**
     * Check if a specific connector is connected
     * @param {string} type - 'input' or 'output'
     * @param {string} connectorId - ID of the connector
     * @returns {boolean} - True if connector has connections
     */
    _isConnectorConnected(type, connectorId) {
        for (const connectionId of this.connections) {
            const connection = Module.connections.get(connectionId);
            if (!connection) continue;

            if (type === 'input' && connection.target.module.id === this.id && connection.target.config.id === connectorId) {
                return true;
            }
            if (type === 'output' && connection.source.module.id === this.id && connection.source.config.id === connectorId) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get module performance metrics
     * @returns {Object} - Performance metrics
     */
    getPerformanceMetrics() {
        const now = Date.now();
        const createdTime = new Date(this.config.created || now).getTime();
        const age = now - createdTime;

        return {
            age: age,
            ageFormatted: this._formatDuration(age),
            memoryUsage: this._estimateMemoryUsage(),
            connectionCount: this.connections.size,
            connectorCount: this.inputs.length + this.outputs.length,
            lastInteraction: this._lastInteraction || createdTime,
            interactionCount: this._interactionCount || 0
        };
    }

    /**
     * Estimate memory usage of this module
     * @returns {Object} - Memory usage estimate
     */
    _estimateMemoryUsage() {
        // Basic estimation based on module components
        let bytes = 0;
        
        // Base module overhead
        bytes += 1024; // Base object
        
        // Shadow DOM overhead
        bytes += 512;
        
        // Connectors
        bytes += (this.inputs.length + this.outputs.length) * 256;
        
        // Connections
        bytes += this.connections.size * 128;
        
        // Configuration
        bytes += JSON.stringify(this.config).length;

        return {
            bytes: bytes,
            formatted: this._formatBytes(bytes)
        };
    }

    /**
     * Format duration in milliseconds to human readable
     * @param {number} ms - Duration in milliseconds
     * @returns {string} - Formatted duration
     */
    _formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    /**
     * Format bytes to human readable
     * @param {number} bytes - Bytes
     * @returns {string} - Formatted bytes
     */
    _formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // === MODULE SELECTION MANAGEMENT ===
    
    /**
     * Select this module
     * @param {boolean} addToSelection - If true, adds to current selection instead of replacing it
     */
    select(addToSelection = false) {
        if (!addToSelection) {
            // Deselect all other modules first
            Module.deselectAll();
        }
        
        if (!this.selected) {
            this.selected = true;
            this.container.classList.add('selected');
            Module.selectedModules.add(this);
            
            console.log(`📌 Module selected: ${this.name} (Total selected: ${Module.selectedModules.size})`);
            
            // Callback
            this.config.callbacks.onModuleSelect(this);
            
            // Emit event
            this.dispatchEvent(new CustomEvent('moduleSelected', {
                detail: { module: this, totalSelected: Module.selectedModules.size },
                bubbles: true
            }));
        }
    }
    
    /**
     * Deselect this module
     */
    deselect() {
        if (this.selected) {
            this.selected = false;
            this.container.classList.remove('selected');
            Module.selectedModules.delete(this);
            
            console.log(`📌 Module deselected: ${this.name} (Total selected: ${Module.selectedModules.size})`);
            
            // Callback
            this.config.callbacks.onModuleDeselect(this);
            
            // Emit event
            this.dispatchEvent(new CustomEvent('moduleDeselected', {
                detail: { module: this, totalSelected: Module.selectedModules.size },
                bubbles: true
            }));
        }
    }
    
    /**
     * Toggle selection state of this module
     * @param {boolean} addToSelection - If true, adds to current selection instead of replacing it
     */
    toggleSelection(addToSelection = false) {
        if (this.selected) {
            this.deselect();
        } else {
            this.select(addToSelection);
        }
    }
    
    /**
     * Delete this module and all its connections
     * @returns {boolean} - True if module was successfully deleted
     */
    delete() {
        console.log(`🗑️ Deleting module: ${this.name}`);
        
        // Disconnect all connections first
        const disconnectedCount = this.disconnectAll();
        console.log(`🔗 Disconnected ${disconnectedCount} connections`);
        
        // Remove from selection if selected
        if (this.selected) {
            this.deselect();
        }
        
        // Remove from DOM
        if (this.parentElement) {
            this.parentElement.removeChild(this);
        }
        
        // Remove from registry
        Module.modules.delete(this.id);
        
        // Emit deletion event
        this.dispatchEvent(new CustomEvent('moduleDeleted', {
            detail: { module: this },
            bubbles: true
        }));
        
        console.log(`✅ Module deleted: ${this.name}`);
        return true;
    }
    
    /**
     * Duplicate this module
     * @param {number} offsetX - X offset for the duplicate
     * @param {number} offsetY - Y offset for the duplicate
     * @returns {Module} - The new duplicated module
     */
    duplicate(offsetX = 20, offsetY = 20) {
        console.log(`📋 Duplicating module: ${this.name}`);
        
        // Create new config based on current module
        const newConfig = JSON.parse(JSON.stringify(this.config));
        
        // Update ID and name
        newConfig.id = `module_${Date.now()}`;
        newConfig.name = `${this.name} Copy`;
        
        // Update position
        if (newConfig.x !== undefined) newConfig.x += offsetX;
        if (newConfig.y !== undefined) newConfig.y += offsetY;
        
        // Create new module
        const duplicate = new Module(newConfig);
        
        // Auto-attach if original was attached
        if (this.parentElement) {
            this.parentElement.appendChild(duplicate);
        }
        
        console.log(`✅ Module duplicated: ${this.name} → ${duplicate.name}`);
        
        return duplicate;
    }
    
    // === STATIC SELECTION METHODS ===
    
    /**
     * Get all currently selected modules
     * @returns {Array<Module>} - Array of selected modules
     */
    static getSelectedModules() {
        return Array.from(Module.selectedModules);
    }
    
    /**
     * Get the first selected module (if any)
     * @returns {Module|null} - First selected module or null
     */
    static getFirstSelectedModule() {
        return Module.selectedModules.size > 0 ? Module.selectedModules.values().next().value : null;
    }
    
    /**
     * Check if any modules are selected
     * @returns {boolean} - True if at least one module is selected
     */
    static hasSelectedModules() {
        return Module.selectedModules.size > 0;
    }
    
    /**
     * Get the number of selected modules
     * @returns {number} - Number of selected modules
     */
    static getSelectedCount() {
        return Module.selectedModules.size;
    }
    
    /**
     * Select all modules
     */
    static selectAll() {
        console.log(`📌 Selecting all modules (${Module.modules.size} modules)`);
        
        Module.modules.forEach(module => {
            module.select(true); // Add to selection
        });
    }
    
    /**
     * Deselect all modules
     */
    static deselectAll() {
        if (Module.selectedModules.size > 0) {
            console.log(`📌 Deselecting all modules (${Module.selectedModules.size} modules)`);
            
            // Create a copy to avoid modification during iteration
            const selectedCopy = Array.from(Module.selectedModules);
            selectedCopy.forEach(module => {
                module.deselect();
            });
        }
    }
    
    /**
     * Delete all selected modules
     * @returns {number} - Number of modules deleted
     */
    static deleteSelected() {
        const selectedModules = Array.from(Module.selectedModules);
        
        if (selectedModules.length === 0) {
            console.log(`❌ No modules selected for deletion`);
            return 0;
        }
        
        console.log(`🗑️ Deleting ${selectedModules.length} selected modules`);
        
        let deletedCount = 0;
        selectedModules.forEach(module => {
            if (module.delete()) {
                deletedCount++;
            }
        });
        
       
        
        console.log(`✅ Deleted ${deletedCount} modules`);
        return deletedCount;
    }
    
    /**
     * Disconnect all connections from selected modules
     * @returns {number} - Total number of connections removed
     */
    static disconnectSelected() {
        const selectedModules = Array.from(Module.selectedModules);
        
        if (selectedModules.length === 0) {
            console.log(`❌ No modules selected for disconnection`);
            return 0;
        }
        
        console.log(`🔗 Disconnecting all connections from ${selectedModules.length} selected modules`);
        
        let totalDisconnected = 0;
        selectedModules.forEach(module => {
            totalDisconnected += module.disconnectAll();
        });
        
        console.log(`✅ Disconnected ${totalDisconnected} connections from selected modules`);
        return totalDisconnected;
    }
    
    /**
     * Duplicate all selected modules
     * @param {number} offsetX - X offset for duplicates
     * @param {number} offsetY - Y offset for duplicates
     * @returns {Array<Module>} - Array of duplicated modules
     */
    static duplicateSelected(offsetX = 20, offsetY = 20) {
        const selectedModules = Array.from(Module.selectedModules);
        
        if (selectedModules.length === 0) {
            console.log(`❌ No modules selected for duplication`);
            return [];
        }
        
        console.log(`📋 Duplicating ${selectedModules.length} selected modules`);
        
        const duplicates = [];
        selectedModules.forEach(module => {
            const duplicate = module.duplicate(offsetX, offsetY);
            duplicates.push(duplicate);
        });
        
        // Deselect original modules and select duplicates
        Module.deselectAll();
        duplicates.forEach(duplicate => {
            duplicate.select(true);
        });
        
        console.log(`✅ Duplicated ${duplicates.length} modules`);
        return duplicates;
    }
    
    /**
     * Get modules by selection state
     * @param {boolean} selected - True to get selected modules, false for unselected
     * @returns {Array<Module>} - Array of modules matching selection state
     */
    static getModulesBySelection(selected = true) {
        const allModules = Array.from(Module.modules.values());
        return allModules.filter(module => module.selected === selected);
    }
    
    /**
     * Select modules by name pattern
     * @param {string|RegExp} pattern - Name pattern to match
     * @param {boolean} addToSelection - If true, adds to current selection
     * @returns {Array<Module>} - Array of modules that were selected
     */
    static selectByName(pattern, addToSelection = false) {
        if (!addToSelection) {
            Module.deselectAll();
        }
        
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
        const matchingModules = [];
        
        Module.modules.forEach(module => {
            if (regex.test(module.name)) {
                module.select(true);
                matchingModules.push(module);
            }
        });
        
        console.log(`📌 Selected ${matchingModules.length} modules matching pattern: ${pattern}`);
        return matchingModules;
    }
    
    /**
     * Setup keyboard shortcuts for module management
     * Call this once to enable keyboard shortcuts
     */
    static setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only handle shortcuts when no input field is focused
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            // Ctrl/Cmd + A: Select all modules
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                Module.selectAll();
                console.log('⌨️ Keyboard shortcut: Select All');
            }
            
            // Delete/Backspace: Delete selected modules
            else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (Module.hasSelectedModules()) {
                    e.preventDefault();
                    const count = Module.deleteSelected();
                    console.log(`⌨️ Keyboard shortcut: Deleted ${count} modules`);
                }
            }
            
            // Ctrl/Cmd + D: Duplicate selected modules
            else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                if (Module.hasSelectedModules()) {
                    e.preventDefault();
                    const duplicates = Module.duplicateSelected();
                    console.log(`⌨️ Keyboard shortcut: Duplicated ${duplicates.length} modules`);
                }
            }
            
            // Ctrl/Cmd + Shift + D: Disconnect selected modules
            else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
                if (Module.hasSelectedModules()) {
                    e.preventDefault();
                    const count = Module.disconnectSelected();
                    console.log(`⌨️ Keyboard shortcut: Disconnected ${count} connections`);
                }
            }
            
            // Escape: Deselect all
            else if (e.key === 'Escape') {
                if (Module.hasSelectedModules()) {
                    Module.deselectAll();
                    console.log('⌨️ Keyboard shortcut: Deselect All');
                }
            }
        });
        
        console.log('⌨️ Keyboard shortcuts enabled for module management');
        console.log('   Ctrl/Cmd + A: Select All');
        console.log('   Delete/Backspace: Delete Selected');
        console.log('   Ctrl/Cmd + D: Duplicate Selected');
        console.log('   Ctrl/Cmd + Shift + D: Disconnect Selected');
        console.log('   Escape: Deselect All');
    }
    
    // === DEBUG AND TESTING METHODS ===
    
    /**
     * Test method to debug drag connection issues
     */
    static testDragConnection() {
        console.log('\n🧪 === TEST DRAG CONNECTION ===');
        
        // Find all modules
        const modules = Array.from(Module.modules.values());
        console.log(`📊 Found ${modules.length} modules:`, modules.map(m => m.name));
        
        if (modules.length < 2) {
            console.error('❌ Need at least 2 modules to test drag connections');
            return;
        }
        
        const sourceModule = modules[0];
        const targetModule = modules[1];
        
        console.log(`🎯 Testing drag from ${sourceModule.name} to ${targetModule.name}`);
        
        // Test connector detection
        if (sourceModule.outputs.length > 0 && targetModule.inputs.length > 0) {
            const outputId = sourceModule.outputs[0].id;
            const inputId = targetModule.inputs[0].id;
            
            const outputElement = sourceModule.outputElements.get(outputId);
            const inputElement = targetModule.inputElements.get(inputId);
            
            console.log('🔌 Source output element:', outputElement);
            console.log('🔌 Target input element:', inputElement);
            
            if (outputElement && inputElement) {
                // Test positions
                const outputRect = outputElement.getBoundingClientRect();
                const inputRect = inputElement.getBoundingClientRect();
                
                console.log('📍 Output position:', {
                    x: outputRect.left + outputRect.width / 2,
                    y: outputRect.top + outputRect.height / 2,
                    rect: outputRect
                });
                
                console.log('📍 Input position:', {
                    x: inputRect.left + inputRect.width / 2,
                    y: inputRect.top + inputRect.height / 2,
                    rect: inputRect
                });
                
                // Test element detection at input position
                const testX = inputRect.left + inputRect.width / 2;
                const testY = inputRect.top + inputRect.height / 2;
                
                console.log(`🎯 Testing element detection at (${testX}, ${testY})`);
                
                const elementAtPosition = document.elementFromPoint(testX, testY);
                console.log('🔍 Element found at position:', elementAtPosition);
                
                const connectorFound = sourceModule._findConnectorFromElement(elementAtPosition);
                console.log('🔗 Connector found:', connectorFound);
                
                // Test API connection
                console.log('🚀 Testing API connection...');
                const apiResult = sourceModule.connectTo(targetModule, outputId, inputId);
                console.log('✅ API connection result:', apiResult);
            }
        }
        
        console.log('🧪 === TEST COMPLETE ===\n');
    }
    
    /**
     * Debug method to show detailed drag state
     */
    _debugDragState(event, phase) {
        console.log(`\n🐛 DRAG DEBUG [${phase}] at (${event.clientX}, ${event.clientY})`);
        
        // Test element detection with different methods
        const methods = [
            { name: 'direct', fn: () => document.elementFromPoint(event.clientX, event.clientY) },
            { name: 'with SVG hidden', fn: () => {
                const svg = document.getElementById('module-connections-svg');
                const originalPointer = svg?.style.pointerEvents;
                if (svg) svg.style.pointerEvents = 'none';
                const element = document.elementFromPoint(event.clientX, event.clientY);
                if (svg) svg.style.pointerEvents = originalPointer;
                return element;
            }},
            { name: 'enhanced method', fn: () => this._findConnectorAtPosition(event.clientX, event.clientY) }
        ];
        
        methods.forEach(method => {
            try {
                const result = method.fn();
                console.log(`  ${method.name}:`, result?.tagName, result?.className, result);
                
                if (method.name !== 'enhanced method') {
                    const connector = this._findConnectorFromElement(result);
                    console.log(`    └─ connector found:`, connector?.module?.name, connector?.config?.name);
                }
            } catch (error) {
                console.error(`  ${method.name} failed:`, error);
            }
        });
        
        console.log('🐛 END DEBUG\n');
    }

    /**
     * Check if this module is connected to another module
     * @param {Module} otherModule - The module to check connection with
     * @returns {boolean} True if there's a connection between the modules
     */
    isConnectedTo(otherModule) {
        if (!(otherModule instanceof Module)) {
            return false;
        }
        
        // Check all connections involving this module
        for (const connectionId of this.connections) {
            const connection = Module.connections.get(connectionId);
            if (!connection) continue;
            
            // Check if this connection involves the other module
            if ((connection.source.module === this && connection.target.module === otherModule) ||
                (connection.source.module === otherModule && connection.target.module === this)) {
                return true;
            }
        }
        
        return false;
    }
}

// Register Web Component
customElements.define('squirrel-module', Module);

// Export pour ES6 modules et usage direct
export default Module;

// Disponible globalement pour compatibilité
if (typeof window !== 'undefined') {
    window.SquirrelModule = Module;
}
