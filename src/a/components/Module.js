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
        
        // Click events pour connexions
        connector.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._handleConnectorClick(connector, config, type, e);
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
    
    // Event handlers
    _handleModuleClick(event) {
        this.select();
        this.config.callbacks.onModuleClick(this, event);
    }
    
    _handleModuleDoubleClick(event) {
        this.config.callbacks.onModuleDoubleClick(this, event);
    }
    
    _handleConnectorClick(connector, config, type, event) {
        if (this.config.animations.enabled && this.config.animations.connectorActive.enabled) {
            connector.classList.add('active');
        }
        
        if (Module.selectedConnector) {
            // Try to create connection
            this._attemptConnection(Module.selectedConnector, { connector, config, type, module: this });
            if (Module.selectedConnector.connector) {
                Module.selectedConnector.connector.classList.remove('active', 'connecting');
            }
            Module.selectedConnector = null;
        } else {
            // Select this connector
            Module.selectedConnector = { connector, config, type, module: this };
            if (this.config.animations.enabled) {
                connector.classList.add('connecting');
            }
        }
        
        this.config.callbacks.onConnectorClick(connector, config, type, event);
    }
    
    _attemptConnection(source, target) {
        // Validate connection (inputs can only connect to outputs)
        if (source.type === target.type) {
            console.warn('Cannot connect same type connectors');
            return false;
        }
        
        // Create visual connection
        const connectionId = `${source.module.id}_${source.config.id}_to_${target.module.id}_${target.config.id}`;
        
        const connection = {
            id: connectionId,
            source: source,
            target: target,
            element: this._createConnectionLine(source, target)
        };
        
        Module.connections.set(connectionId, connection);
        
        // Remove connecting state
        source.connector.classList.remove('connecting', 'active');
        target.connector.classList.remove('active');
        
        this.config.callbacks.onConnectionCreate(connection);
        
        return true;
    }
    
    _createConnectionLine(source, target) {
        // Create SVG line for visual connection
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        // Implementation would depend on your connection rendering system
        return line;
    }
    
    _enableRename() {
        // Temporarily disable drag functionality during rename
        const originalPointerEvents = this.header.style.pointerEvents;
        const originalCursor = this.header.style.cursor;
        this._isDragDisabled = true;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = this.name;
        input.style.cssText = `
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid #3498db;
            border-radius: 4px;
            padding: 4px 8px;
            font-size: inherit;
            font-family: inherit;
            color: #2c3e50;
            width: 100%;
            cursor: text;
        `;
        
        // Prevent drag events from bubbling up from the input
        input.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        
        input.addEventListener('mousemove', (e) => {
            e.stopPropagation();
        });
        
        input.addEventListener('dragstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        this.header.textContent = '';
        this.header.appendChild(input);
        input.focus();
        input.select();
        
        const finishRename = () => {
            const newName = input.value.trim() || this.name;
            this.name = newName;
            this.config.name = newName;
            this.header.textContent = newName;
            
            // Restore drag functionality
            this._isDragDisabled = false;
            this.header.style.pointerEvents = originalPointerEvents;
            this.header.style.cursor = originalCursor;
        };
        
        const cancelRename = () => {
            this.header.textContent = this.name;
            
            // Restore drag functionality
            this._isDragDisabled = false;
            this.header.style.pointerEvents = originalPointerEvents;
            this.header.style.cursor = originalCursor;
        };
        
        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                finishRename();
            } else if (e.key === 'Escape') {
                cancelRename();
            }
        });
    }
    
    // Public API methods
    select() {
        if (!this.selected) {
            this.selected = true;
            if (this.config.animations.enabled && this.config.animations.moduleSelected.enabled) {
                this.container.classList.add('selected');
            }
            this.config.callbacks.onModuleSelect(this);
        }
    }
    
    deselect() {
        if (this.selected) {
            this.selected = false;
            this.container.classList.remove('selected');
            this.config.callbacks.onModuleDeselect(this);
        }
    }
    
    setPosition(x, y) {
        this.config.x = x;
        this.config.y = y;
        this.style.left = `${x}px`;
        this.style.top = `${y}px`;
    }
    
    setSize(width, height) {
        this.config.width = width;
        this.config.height = height;
        this.style.width = `${width}px`;
        this.style.height = `${height}px`;
        this._updateConnectorPositions();
    }
    
    // API pour contrôler les animations dynamiquement
    enableAnimations() {
        this.config.animations.enabled = true;
        this.setupAnimations(this.config);
        this._regenerateStyles();
        console.log('🎬 Animations activées pour module:', this.id);
    }
    
    disableAnimations() {
        this.config.animations.enabled = false;
        this._regenerateStyles();
        console.log('🚫 Animations désactivées pour module:', this.id);
    }
    
    setAnimationConfig(animationName, config) {
        if (this.config.animations[animationName]) {
            this.config.animations[animationName] = { ...this.config.animations[animationName], ...config };
            this._regenerateStyles();
            console.log(`🎯 Animation ${animationName} mise à jour pour module:`, this.id);
        }
    }
    
    _regenerateStyles() {
        // Régénère les styles dans le Shadow DOM
        const oldStyles = this.shadowRoot.querySelector('style');
        if (oldStyles) {
            oldStyles.remove();
        }
        const newStyles = this._generateStyles();
        this.shadowRoot.insertBefore(newStyles, this.shadowRoot.firstChild);
    }
    
    _updateConnectorPositions() {
        // Recalculate connector positions after resize
        [...this.inputElements.values(), ...this.outputElements.values()].forEach((connector, index) => {
            const type = connector.classList.contains('connector-input') ? 'input' : 'output';
            const connectors = type === 'input' ? this.inputs : this.outputs;
            const spacing = this.config.connectorConfig.spacing === 'auto' 
                ? (this.config.height - 60) / Math.max(1, connectors.length - 1)
                : this.config.connectorConfig.spacing;
            
            const connectorIndex = type === 'input' 
                ? this.inputs.findIndex(c => c.id === connector.dataset.connectorId)
                : this.outputs.findIndex(c => c.id === connector.dataset.connectorId);
            
            const y = 40 + (connectorIndex * spacing);
            connector.style.top = `${y}px`;
        });
    }
    
    addInput(config) {
        const input = { id: `input_${Date.now()}`, type: 'data', name: 'Input', ...config };
        this.inputs.push(input);
        const connector = this._createConnector(input, 'input', this.inputs.length - 1);
        this.inputElements.set(input.id, connector);
        this.container.appendChild(connector);
        this._updateConnectorPositions();
        return input;
    }
    
    addOutput(config) {
        const output = { id: `output_${Date.now()}`, type: 'data', name: 'Output', ...config };
        this.outputs.push(output);
        const connector = this._createConnector(output, 'output', this.outputs.length - 1);
        this.outputElements.set(output.id, connector);
        this.container.appendChild(connector);
        this._updateConnectorPositions();
        return output;
    }
    
    setContent(content) {
        if (typeof content === 'string') {
            this.content.textContent = content;
        } else if (content instanceof HTMLElement) {
            this.content.innerHTML = '';
            this.content.appendChild(content);
        }
    }
    
    getConnections() {
        return Array.from(Module.connections.values()).filter(conn => 
            conn.source.module === this || conn.target.module === this
        );
    }
    
    getPosition() {
        return {
            x: this.config.position?.x || 0,
            y: this.config.position?.y || 0
        };
    }
    
    setPosition(x, y) {
        this.config.position = { x, y };
        this.style.left = `${x}px`;
        this.style.top = `${y}px`;
        this._updateConnectionLines();
    }
    
    destroy() {
        // Remove all connections
        this.getConnections().forEach(conn => {
            Module.connections.delete(conn.id);
            if (conn.element && conn.element.parentElement) {
                conn.element.parentElement.removeChild(conn.element);
            }
        });
        
        // Remove from registry
        Module.modules.delete(this.id);
        
        // Remove from DOM
        if (this.parentElement) {
            this.parentElement.removeChild(this);
        }
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
