/**
 * 🔧 Module Component - Squirrel Framework
 * 
 * Component for creating draggable modules with input/output connectors
 * that can be connected together to build visual programming interfaces.
 * 
 * @version 1.0.0
 * @author Squirrel Framework Team
 */

class Module {
    static modules = new Map(); // Registry of all modules
    static connections = new Map(); // Registry of all connections
    static draggedModule = null;
    static connectionInProgress = null;

    constructor(config = {}) {
        // Default configuration
        this.config = {
            id: config.id || `module_${Date.now()}`,
            name: config.name || 'Untitled Module',
            attach: config.attach || 'body',
            x: config.x || 100,
            y: config.y || 100,
            width: config.width || 200,
            height: config.height || 120,
            
            // Connectors
            inputs: config.inputs || [],
            outputs: config.outputs || [],
            
            // Styling
            style: {
                backgroundColor: '#2c3e50',
                borderRadius: '8px',
                border: '2px solid #34495e',
                color: 'white',
                fontSize: '14px',
                fontFamily: 'Roboto, sans-serif',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                ...config.style
            },
            
            // Connector styling
            connectors: {
                input: {
                    backgroundColor: '#e74c3c',
                    size: 12,
                    position: 'left',
                    ...config.connectors?.input
                },
                output: {
                    backgroundColor: '#27ae60',
                    size: 12,
                    position: 'right',
                    ...config.connectors?.output
                }
            },
            
            // Connector types
            connectorTypes: {
                audio: { color: '#e74c3c', shape: 'circle' },
                control: { color: '#3498db', shape: 'square' },
                data: { color: '#f39c12', shape: 'triangle' },
                ...config.connectorTypes
            },
            
            // Behavior
            draggable: config.draggable !== false,
            grid: config.grid || { enabled: false, size: 20 },
            
            // Callbacks
            callbacks: {
                onMove: config.callbacks?.onMove || (() => {}),
                onConnect: config.callbacks?.onConnect || (() => {}),
                onDisconnect: config.callbacks?.onDisconnect || (() => {}),
                onClick: config.callbacks?.onClick || (() => {}),
                onSelect: config.callbacks?.onSelect || (() => {})
            }
        };

        this.id = this.config.id;
        this.name = this.config.name;
        this.inputs = [...this.config.inputs];
        this.outputs = [...this.config.outputs];
        this.connections = new Set();
        this.selected = false;
        
        this._createModule();
        this._setupEventHandlers();
        
        // Register module
        Module.modules.set(this.id, this);
        
        console.log(`🔧 Module created: ${this.name} (${this.id})`);
    }

    _createModule() {
        // Get container
        const container = typeof this.config.attach === 'string' 
            ? document.querySelector(this.config.attach)
            : this.config.attach;

        if (!container) {
            throw new Error(`Container not found: ${this.config.attach}`);
        }

        // Create main module element
        this.element = document.createElement('div');
        this.element.className = 'squirrel-module';
        this.element.id = this.id;
        
        // Apply styling
        Object.assign(this.element.style, {
            position: 'absolute',
            left: `${this.config.x}px`,
            top: `${this.config.y}px`,
            width: `${this.config.width}px`,
            height: `${this.config.height}px`,
            cursor: this.config.draggable ? 'move' : 'default',
            userSelect: 'none',
            zIndex: '1000',
            ...this.config.style
        });

        // Create header with module name
        this._createHeader();
        
        // Create connector areas
        this._createConnectors();
        
        // Create content area
        this._createContent();

        container.appendChild(this.element);
    }

    _createHeader() {
        this.header = document.createElement('div');
        this.header.className = 'module-header';
        this.header.textContent = this.name;
        
        Object.assign(this.header.style, {
            padding: '8px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            fontWeight: 'bold',
            fontSize: '12px',
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: '6px 6px 0 0'
        });

        this.element.appendChild(this.header);
    }

    _createConnectors() {
        // Create input connectors
        this.inputElements = new Map();
        this.inputs.forEach((input, index) => {
            const connector = this._createConnector(input, 'input', index);
            this.inputElements.set(input.id, connector);
        });

        // Create output connectors
        this.outputElements = new Map();
        this.outputs.forEach((output, index) => {
            const connector = this._createConnector(output, 'output', index);
            this.outputElements.set(output.id, connector);
        });
    }

    _createConnector(config, type, index) {
        const connector = document.createElement('div');
        connector.className = `module-connector module-${type}`;
        connector.dataset.connectorId = config.id;
        connector.dataset.connectorType = type;
        connector.dataset.dataType = config.type || 'data';
        
        const connectorConfig = this.config.connectors[type];
        const typeConfig = this.config.connectorTypes[config.type] || this.config.connectorTypes.data;
        
        // Position connector
        const spacing = (this.config.height - 40) / Math.max(1, this[`${type}s`].length - 1);
        const y = 30 + (index * spacing);
        const x = type === 'input' ? -connectorConfig.size/2 : this.config.width - connectorConfig.size/2;
        
        Object.assign(connector.style, {
            position: 'absolute',
            left: `${x}px`,
            top: `${y}px`,
            width: `${connectorConfig.size}px`,
            height: `${connectorConfig.size}px`,
            backgroundColor: typeConfig.color,
            borderRadius: typeConfig.shape === 'circle' ? '50%' : 
                          typeConfig.shape === 'square' ? '0%' : '0',
            border: '2px solid white',
            cursor: 'pointer',
            zIndex: '1001',
            transition: 'transform 0.2s ease-out'
        });

        // Add label
        const label = document.createElement('span');
        label.textContent = config.name;
        label.style.cssText = `
            position: absolute;
            ${type === 'input' ? 'left: 20px' : 'right: 20px'};
            top: 50%;
            transform: translateY(-50%);
            font-size: 10px;
            white-space: nowrap;
            pointer-events: none;
        `;
        connector.appendChild(label);

        // Add hover effects
        connector.addEventListener('mouseenter', () => {
            connector.style.transform = 'scale(1.2)';
        });
        
        connector.addEventListener('mouseleave', () => {
            if (!connector.classList.contains('dragging')) {
                connector.style.transform = 'scale(1)';
            }
        });

        // Setup drag & drop for connections
        this._setupConnectorDragDrop(connector);

        this.element.appendChild(connector);
        return connector;
    }

    _setupConnectorDragDrop(connector) {
        let isDragging = false;
        let dragLine = null;
        let startConnector = null;

        connector.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Only left click
            
            // Check if connector is already connected - if so, allow disconnection click
            const connectorId = connector.dataset.connectorId;
            const connectorType = connector.dataset.connectorType;
            const existingConnections = this._getConnectorConnections(connectorId, connectorType);
            
            if (existingConnections.length > 0 && !e.shiftKey) {
                // Normal click on connected connector = disconnect
                return; // Let the normal click handler deal with it
            }
            
            // Start drag for new connection
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = true;
            startConnector = {
                element: connector,
                module: this,
                id: connectorId,
                type: connectorType
            };
            
            // Visual feedback
            connector.classList.add('dragging');
            connector.style.transform = 'scale(1.3)';
            connector.style.boxShadow = '0 0 15px #00ff00, 0 0 25px #00ff00';
            
            // Create temporary drag line
            dragLine = this._createDragLine(connector);
            
            console.log(`🎯 Starting drag connection from ${this.name}.${connectorId}`);
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging || !startConnector) return;
            
            // Update drag line to follow mouse
            this._updateDragLine(dragLine, startConnector.element, { x: e.clientX, y: e.clientY });
            
            // Highlight valid drop targets
            this._highlightDropTargets(startConnector, e);
        });

        document.addEventListener('mouseup', (e) => {
            if (!isDragging || !startConnector) return;
            
            isDragging = false;
            
            // Clean up visual feedback
            startConnector.element.classList.remove('dragging');
            startConnector.element.style.transform = 'scale(1)';
            startConnector.element.style.boxShadow = '';
            
            // Remove drag line
            if (dragLine) {
                dragLine.remove();
                dragLine = null;
            }
            
            // Clear all highlights
            this._clearDropTargetHighlights();
            
            // Check if we dropped on a valid target
            const dropTarget = this._findDropTarget(e);
            if (dropTarget && this._isValidConnection(startConnector, dropTarget)) {
                this._createDragConnection(startConnector, dropTarget);
            } else {
                console.log('❌ Invalid drop target or connection');
            }
            
            startConnector = null;
        });
    }

    _createDragLine(fromConnector) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const svg = this._getOrCreateSVG();
        
        line.setAttribute('stroke', '#00ff00');
        line.setAttribute('stroke-width', '3');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('stroke-dasharray', '5,5');
        line.style.pointerEvents = 'none';
        
        svg.appendChild(line);
        return line;
    }

    _updateDragLine(line, fromConnector, toPoint) {
        const fromRect = fromConnector.getBoundingClientRect();
        const fromX = fromRect.left + fromRect.width / 2;
        const fromY = fromRect.top + fromRect.height / 2;
        
        line.setAttribute('x1', fromX);
        line.setAttribute('y1', fromY);
        line.setAttribute('x2', toPoint.x);
        line.setAttribute('y2', toPoint.y);
    }

    _highlightDropTargets(startConnector, mouseEvent) {
        // Clear previous highlights
        this._clearDropTargetHighlights();
        
        // Find all valid connectors
        const allConnectors = document.querySelectorAll('.module-connector');
        allConnectors.forEach(connector => {
            const module = Module.modules.get(connector.closest('.squirrel-module').id);
            if (!module || module === startConnector.module) return;
            
            const dropTarget = {
                element: connector,
                module: module,
                id: connector.dataset.connectorId,
                type: connector.dataset.connectorType
            };
            
            if (this._isValidConnection(startConnector, dropTarget)) {
                connector.style.backgroundColor = '#00ff00';
                connector.style.transform = 'scale(1.4)';
                connector.style.boxShadow = '0 0 10px #00ff00';
            }
        });
    }

    _clearDropTargetHighlights() {
        const allConnectors = document.querySelectorAll('.module-connector');
        allConnectors.forEach(connector => {
            if (!connector.classList.contains('dragging')) {
                const dataType = connector.dataset.dataType;
                const connectorType = connector.dataset.connectorType;
                const module = Module.modules.get(connector.closest('.squirrel-module').id);
                
                if (module) {
                    const typeConfig = module.config.connectorTypes[dataType] || module.config.connectorTypes.data;
                    connector.style.backgroundColor = typeConfig.color;
                    connector.style.transform = 'scale(1)';
                    
                    // Keep connected style if connector is connected
                    const existingConnections = module._getConnectorConnections(connector.dataset.connectorId, connectorType);
                    if (existingConnections.length > 0) {
                        connector.style.border = '3px solid #f1c40f';
                        connector.style.boxShadow = '0 0 8px rgba(241, 196, 15, 0.6)';
                    } else {
                        connector.style.border = '2px solid white';
                        connector.style.boxShadow = '';
                    }
                }
            }
        });
    }

    _findDropTarget(mouseEvent) {
        const elementUnderMouse = document.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY);
        if (!elementUnderMouse) return null;
        
        const connector = elementUnderMouse.closest('.module-connector');
        if (!connector) return null;
        
        const moduleElement = connector.closest('.squirrel-module');
        if (!moduleElement) return null;
        
        const module = Module.modules.get(moduleElement.id);
        if (!module) return null;
        
        return {
            element: connector,
            module: module,
            id: connector.dataset.connectorId,
            type: connector.dataset.connectorType
        };
    }

    _isValidConnection(from, to) {
        // Different modules
        if (from.module === to.module) return false;
        
        // Different connector types (input ↔ output)
        if (from.type === to.type) return false;
        
        // Check if connection already exists
        const connectionId1 = `${from.module.id}.${from.id}_to_${to.module.id}.${to.id}`;
        const connectionId2 = `${to.module.id}.${to.id}_to_${from.module.id}.${from.id}`;
        
        return !Module.connections.has(connectionId1) && !Module.connections.has(connectionId2);
    }

    _createDragConnection(from, to) {
        // Determine which is input and which is output
        let fromData, toData;
        
        if (from.type === 'output') {
            fromData = from;
            toData = to;
        } else {
            fromData = to;
            toData = from;
        }
        
        // Create the connection using existing method
        this._createConnection(
            {
                fromModule: fromData.module,
                fromConnector: fromData.id,
                fromType: 'output',
                fromElement: fromData.element
            },
            {
                toModule: toData.module,
                toConnector: toData.id,
                toType: 'input',
                toElement: toData.element
            }
        );
    }

    _createContent() {
        this.content = document.createElement('div');
        this.content.className = 'module-content';
        
        Object.assign(this.content.style, {
            padding: '10px',
            height: `${this.config.height - 40}px`,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.7)'
        });

        this.content.textContent = `${this.inputs.length} inputs, ${this.outputs.length} outputs`;
        this.element.appendChild(this.content);
    }

    _setupEventHandlers() {
        if (this.config.draggable) {
            this._setupDragHandlers();
        }
        
        this._setupConnectorHandlers();
        this._setupSelectionHandlers();
    }

    _setupDragHandlers() {
        let isDragging = false;
        let dragStart = { x: 0, y: 0 };
        let moduleStart = { x: this.config.x, y: this.config.y };
        let hasMoved = false;

        const startDrag = (e) => {
            if (e.button !== 0) return; // Only left click
            
            isDragging = true;
            hasMoved = false;
            Module.draggedModule = this;
            
            dragStart = { x: e.clientX, y: e.clientY };
            moduleStart = { x: this.config.x, y: this.config.y };
            
            this.element.style.zIndex = '1002';
            this.element.style.cursor = 'grabbing';
            
            e.preventDefault();
            e.stopPropagation();
        };

        const doDrag = (e) => {
            if (!isDragging || Module.draggedModule !== this) return;
            
            const deltaX = e.clientX - dragStart.x;
            const deltaY = e.clientY - dragStart.y;
            
            // Marquer qu'on a bougé si le mouvement est significatif
            if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                hasMoved = true;
            }
            
            let newX = moduleStart.x + deltaX;
            let newY = moduleStart.y + deltaY;
            
            // Snap to grid if enabled
            if (this.config.grid.enabled) {
                const gridSize = this.config.grid.size;
                newX = Math.round(newX / gridSize) * gridSize;
                newY = Math.round(newY / gridSize) * gridSize;
            }
            
            this.moveTo(newX, newY);
        };

        const endDrag = (e) => {
            if (isDragging && Module.draggedModule === this) {
                isDragging = false;
                Module.draggedModule = null;
                this.element.style.zIndex = '1000';
                this.element.style.cursor = this.config.draggable ? 'move' : 'default';
                
                if (hasMoved) {
                    this.config.callbacks.onMove(this, this.config.x, this.config.y);
                }
            }
        };

        // Event listeners
        this.header.addEventListener('mousedown', startDrag);
        
        // Global mouse events pour capturer même si la souris sort de l'élément
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', endDrag);
        
        // Gérer la perte de focus (fenêtre)
        window.addEventListener('blur', () => {
            if (isDragging && Module.draggedModule === this) {
                endDrag();
            }
        });
    }

    _setupConnectorHandlers() {
        // Handle connector clicks for connections
        this.element.addEventListener('click', (e) => {
            if (e.target.classList.contains('module-connector')) {
                e.stopPropagation();
                this._handleConnectorClick(e.target);
            }
        });
        
        // Cancel connection in progress with right click or Escape
        this.element.addEventListener('contextmenu', (e) => {
            if (e.target.classList.contains('module-connector') && Module.connectionInProgress) {
                e.preventDefault();
                this._cancelConnectionInProgress();
            }
        });
        
        // Global Escape key to cancel connection
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && Module.connectionInProgress) {
                this._cancelConnectionInProgress();
            }
        });
    }
    
    _cancelConnectionInProgress() {
        if (Module.connectionInProgress) {
            Module.connectionInProgress.fromElement.style.boxShadow = '';
            Module.connectionInProgress.fromElement.style.transform = 'scale(1)';
            Module.connectionInProgress = null;
            console.log('❌ Connection cancelled');
        }
    }

    _setupSelectionHandlers() {
        let longPressTimer = null;
        let isLongPress = false;
        let mouseDownTime = 0;
        
        // Mouse down - start long press timer
        this.element.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('module-connector')) return;
            
            mouseDownTime = Date.now();
            isLongPress = false;
            
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                this._showContextMenu(e);
            }, 600); // Réduit à 600ms
        });
        
        // Mouse up - clear timer and handle click
        this.element.addEventListener('mouseup', (e) => {
            const pressDuration = Date.now() - mouseDownTime;
            
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            
            // Si c'est un clic court (pas un clic long)
            if (pressDuration < 600 && !isLongPress && !e.target.classList.contains('module-connector')) {
                e.stopPropagation();
                this.select();
                this.config.callbacks.onClick(this, e);
            }
            
            // Reset pour le prochain clic
            isLongPress = false;
        });
        
        // Mouse leave - clear timer seulement si pas en train de faire un clic long
        this.element.addEventListener('mouseleave', () => {
            if (longPressTimer && !isLongPress) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        });

        // Deselect when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.element.contains(e.target)) {
                this.deselect();
            }
        });
    }

    _showContextMenu(event) {
        // Remove existing context menu if any
        const existingMenu = document.getElementById('module-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.id = 'module-context-menu';
        
        // Calculer la position pour éviter les débordements d'écran
        const menuWidth = 200;
        const menuHeight = 300;
        let menuX = event.clientX;
        let menuY = event.clientY;
        
        // Ajuster si le menu dépasse à droite
        if (menuX + menuWidth > window.innerWidth) {
            menuX = window.innerWidth - menuWidth - 10;
        }
        
        // Ajuster si le menu dépasse en bas
        if (menuY + menuHeight > window.innerHeight) {
            menuY = window.innerHeight - menuHeight - 10;
        }
        
        menu.style.cssText = `
            position: fixed;
            left: ${menuX}px;
            top: ${menuY}px;
            background: #2c3e50;
            border: 2px solid #34495e;
            border-radius: 8px;
            padding: 10px 0;
            z-index: 10000;
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
            min-width: ${menuWidth}px;
            font-family: 'Roboto', Arial, sans-serif;
        `;

        const connections = this.getConnections();
        const hasConnections = connections.length > 0;

        const menuItems = [
            {
                text: `📊 ${this.name}`,
                disabled: true,
                style: 'font-weight: bold; color: #3498db; border-bottom: 1px solid #34495e; margin-bottom: 5px; padding-bottom: 8px;'
            },
            {
                text: `🔗 Connexions: ${connections.length}`,
                disabled: true,
                style: 'font-size: 12px; color: #bdc3c7;'
            },
            {
                text: '─────────────',
                disabled: true,
                style: 'color: #34495e; text-align: center;'
            },
            {
                text: '🔌 Déconnecter tout',
                action: () => this.disconnectAll(),
                disabled: !hasConnections,
                style: hasConnections ? 'color: #e74c3c;' : 'color: #7f8c8d;'
            },
            {
                text: '📝 Renommer',
                action: () => this._renameModule()
            },
            {
                text: '🎨 Changer couleur',
                action: () => this._changeColor()
            },
            {
                text: '─────────────',
                disabled: true,
                style: 'color: #34495e; text-align: center;'
            },
            {
                text: '🗑️ Supprimer',
                action: () => {
                    if (confirm(`Êtes-vous sûr de vouloir supprimer le module "${this.name}" ?`)) {
                        this.destroy();
                    }
                },
                style: 'color: #e74c3c; font-weight: bold;'
            }
        ];

        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.textContent = item.text;
            menuItem.style.cssText = `
                padding: 8px 15px;
                cursor: ${item.disabled ? 'default' : 'pointer'};
                color: ${item.disabled ? '#7f8c8d' : 'white'};
                font-size: 14px;
                transition: background-color 0.2s ease;
                ${item.style || ''}
            `;

            if (!item.disabled) {
                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.backgroundColor = '#34495e';
                });
                
                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.backgroundColor = 'transparent';
                });
                
                menuItem.addEventListener('click', () => {
                    // Exécuter l'action
                    if (item.action) {
                        item.action();
                    }
                    // Fermer le menu
                    menu.remove();
                    // Nettoyer les event listeners
                    document.removeEventListener('click', closeMenu);
                    document.removeEventListener('mousedown', closeMenu);
                    document.removeEventListener('keydown', handleEscape);
                });
            }

            menu.appendChild(menuItem);
        });

        document.body.appendChild(menu);

        // Empêcher la fermeture immédiate du menu
        menu.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        menu.addEventListener('mouseup', (e) => {
            e.stopPropagation();
        });

        // Close menu when clicking outside (avec un délai et zone de tolérance)
        const closeMenu = (e) => {
            // Vérifier si le clic est vraiment à l'extérieur du menu
            const rect = menu.getBoundingClientRect();
            const tolerance = 5; // 5px de tolérance
            
            const isOutside = (
                e.clientX < rect.left - tolerance ||
                e.clientX > rect.right + tolerance ||
                e.clientY < rect.top - tolerance ||
                e.clientY > rect.bottom + tolerance
            );
            
            if (isOutside && !menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
                document.removeEventListener('mousedown', closeMenu);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        
        // Fermer aussi avec Escape
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                menu.remove();
                document.removeEventListener('keydown', handleEscape);
                document.removeEventListener('click', closeMenu);
                document.removeEventListener('mousedown', closeMenu);
            }
        };
        
        // Ajouter les listeners après un petit délai pour éviter la fermeture immédiate
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
            document.addEventListener('mousedown', closeMenu);
            document.addEventListener('keydown', handleEscape);
        }, 200);

        console.log(`📋 Menu contextuel ouvert pour ${this.name}`);
    }

    _renameModule() {
        const newName = prompt(`Nouveau nom pour le module:`, this.name);
        if (newName && newName.trim()) {
            const oldName = this.name;
            this.name = newName.trim();
            this.header.textContent = this.name;
            console.log(`✏️ Module renommé: ${oldName} → ${this.name}`);
        }
    }

    _changeColor() {
        const colors = [
            '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
            '#9b59b6', '#1abc9c', '#34495e', '#e67e22',
            '#8e44ad', '#27ae60', '#2980b9', '#d35400'
        ];
        
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        this.element.style.backgroundColor = randomColor;
        console.log(`🎨 Couleur du module ${this.name} changée: ${randomColor}`);
    }

    _handleConnectorClick(connectorElement) {
        const connectorId = connectorElement.dataset.connectorId;
        const connectorType = connectorElement.dataset.connectorType;
        
        // Check if this connector already has connections
        const existingConnections = this._getConnectorConnections(connectorId, connectorType);
        
        if (existingConnections.length > 0) {
            // Si le connecteur a des connexions, les supprimer TOUTES d'un seul clic
            console.log(`🔌 Disconnecting ${existingConnections.length} connection(s) from ${this.name}.${connectorId}`);
            existingConnections.forEach(connection => {
                this.disconnect(connection.id);
            });
            
            // Retirer le highlight temporaire s'il y en a un
            if (Module.connectionInProgress) {
                Module.connectionInProgress.fromElement.style.boxShadow = '';
                Module.connectionInProgress = null;
            }
            return;
        }
        
        if (!Module.connectionInProgress) {
            // Start new connection
            Module.connectionInProgress = {
                fromModule: this,
                fromConnector: connectorId,
                fromType: connectorType,
                fromElement: connectorElement
            };
            
            connectorElement.style.boxShadow = '0 0 15px #ffff00, 0 0 25px #ffff00';
            connectorElement.style.transform = 'scale(1.3)';
            console.log(`🔗 Starting connection from ${this.name}.${connectorId}`);
            
        } else {
            // Complete connection
            const from = Module.connectionInProgress;
            
            // Reset visual state first
            from.fromElement.style.boxShadow = '';
            from.fromElement.style.transform = 'scale(1)';
            
            // Validate connection (output to input only, different modules)
            if (from.fromModule !== this && // Different modules
                from.fromType !== connectorType && 
                ((from.fromType === 'output' && connectorType === 'input') ||
                 (from.fromType === 'input' && connectorType === 'output'))) {
                
                this._createConnection(from, {
                    toModule: this,
                    toConnector: connectorId,
                    toType: connectorType,
                    toElement: connectorElement
                });
            } else {
                console.log(`❌ Invalid connection: ${from.fromModule.name}.${from.fromConnector} → ${this.name}.${connectorId}`);
                if (from.fromModule === this) {
                    console.log('Cannot connect module to itself');
                } else if (from.fromType === connectorType) {
                    console.log('Cannot connect same connector types (input→input or output→output)');
                }
            }
            
            // Reset connection state
            Module.connectionInProgress = null;
        }
    }

    _getConnectorConnections(connectorId, connectorType) {
        const connections = [];
        Module.connections.forEach((connection, id) => {
            if ((connectorType === 'input' && 
                 connection.to.toModule === this && 
                 connection.to.toConnector === connectorId) ||
                (connectorType === 'output' && 
                 connection.from.fromModule === this && 
                 connection.from.fromConnector === connectorId)) {
                connections.push(connection);
            }
        });
        return connections;
    }

    _createConnection(from, to) {
        const connectionId = `${from.fromModule.id}.${from.fromConnector}_to_${to.toModule.id}.${to.toConnector}`;
        
        if (Module.connections.has(connectionId)) {
            console.warn(`Connection already exists: ${connectionId}`);
            return;
        }

        const connection = {
            id: connectionId,
            from: from,
            to: to,
            element: this._createConnectionLine(from.fromElement, to.toElement)
        };

        Module.connections.set(connectionId, connection);
        from.fromModule.connections.add(connectionId);
        to.toModule.connections.add(connectionId);

        // Update connector visual state
        this._updateConnectorStyle(from.fromElement, true);
        this._updateConnectorStyle(to.toElement, true);

        console.log(`✅ Connected: ${from.fromModule.name}.${from.fromConnector} → ${to.toModule.name}.${to.toConnector}`);
        
        this.config.callbacks.onConnect(from.fromModule, from.fromConnector, to.toModule, to.toConnector);
    }

    _createConnectionLine(fromElement, toElement) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const svg = this._getOrCreateSVG();
        
        line.setAttribute('stroke', '#3498db');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-linecap', 'round');
        
        this._updateConnectionLine(line, fromElement, toElement);
        svg.appendChild(line);
        
        return line;
    }

    _getOrCreateSVG() {
        let svg = document.getElementById('module-connections-svg');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'module-connections-svg';
            svg.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 999;
            `;
            document.body.appendChild(svg);
        }
        return svg;
    }

    _updateConnectionLine(line, fromElement, toElement) {
        const fromRect = fromElement.getBoundingClientRect();
        const toRect = toElement.getBoundingClientRect();
        
        const fromX = fromRect.left + fromRect.width / 2;
        const fromY = fromRect.top + fromRect.height / 2;
        const toX = toRect.left + toRect.width / 2;
        const toY = toRect.top + toRect.height / 2;
        
        line.setAttribute('x1', fromX);
        line.setAttribute('y1', fromY);
        line.setAttribute('x2', toX);
        line.setAttribute('y2', toY);
    }

    // Public API Methods
    moveTo(x, y) {
        this.config.x = x;
        this.config.y = y;
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
        
        // Update connection lines
        this._updateConnectionLines();
    }

    _updateConnectionLines() {
        this.connections.forEach(connectionId => {
            const connection = Module.connections.get(connectionId);
            if (connection) {
                this._updateConnectionLine(
                    connection.element,
                    connection.from.fromElement,
                    connection.to.toElement
                );
            }
        });
    }

    addInput(config) {
        this.inputs.push(config);
        const connector = this._createConnector(config, 'input', this.inputs.length - 1);
        this.inputElements.set(config.id, connector);
        this._updateContentText();
        console.log(`➕ Added input: ${config.name} to ${this.name}`);
    }

    addOutput(config) {
        this.outputs.push(config);
        const connector = this._createConnector(config, 'output', this.outputs.length - 1);
        this.outputElements.set(config.id, connector);
        this._updateContentText();
        console.log(`➕ Added output: ${config.name} to ${this.name}`);
    }

    removeInput(connectorId) {
        this.inputs = this.inputs.filter(input => input.id !== connectorId);
        const element = this.inputElements.get(connectorId);
        if (element) {
            element.remove();
            this.inputElements.delete(connectorId);
        }
        this._updateContentText();
        console.log(`➖ Removed input: ${connectorId} from ${this.name}`);
    }

    removeOutput(connectorId) {
        this.outputs = this.outputs.filter(output => output.id !== connectorId);
        const element = this.outputElements.get(connectorId);
        if (element) {
            element.remove();
            this.outputElements.delete(connectorId);
        }
        this._updateContentText();
        console.log(`➖ Removed output: ${connectorId} from ${this.name}`);
    }

    _updateContentText() {
        if (this.content) {
            this.content.textContent = `${this.inputs.length} inputs, ${this.outputs.length} outputs`;
        }
    }

    connectTo(targetModule, fromConnectorId, toConnectorId) {
        // Find the connector elements
        const fromElement = this.outputElements.get(fromConnectorId);
        const toElement = targetModule.inputElements.get(toConnectorId);
        
        if (!fromElement || !toElement) {
            console.error('Connector not found for connection');
            return null;
        }

        const from = {
            fromModule: this,
            fromConnector: fromConnectorId,
            fromType: 'output',
            fromElement: fromElement
        };

        const to = {
            toModule: targetModule,
            toConnector: toConnectorId,
            toType: 'input',
            toElement: toElement
        };

        this._createConnection(from, to);
        return `${this.id}.${fromConnectorId}_to_${targetModule.id}.${toConnectorId}`;
    }

    disconnect(connectionId) {
        const connection = Module.connections.get(connectionId);
        if (connection) {
            connection.element.remove();
            Module.connections.delete(connectionId);
            connection.from.fromModule.connections.delete(connectionId);
            connection.to.toModule.connections.delete(connectionId);
            
            // Update connector visual state
            this._updateConnectorStyle(connection.from.fromElement, false);
            this._updateConnectorStyle(connection.to.toElement, false);
            
            this.config.callbacks.onDisconnect(connection);
            console.log(`🔌 Disconnected: ${connectionId}`);
        }
    }

    _updateConnectorStyle(connectorElement, isConnected) {
        if (isConnected) {
            connectorElement.style.border = '3px solid #f1c40f';
            connectorElement.style.boxShadow = '0 0 8px rgba(241, 196, 15, 0.6)';
        } else {
            connectorElement.style.border = '2px solid white';
            connectorElement.style.boxShadow = '';
        }
    }

    disconnectAll() {
        [...this.connections].forEach(connectionId => {
            this.disconnect(connectionId);
        });
    }

    select() {
        if (!this.selected) {
            this.selected = true;
            this.element.style.outline = '2px solid #3498db';
            this.element.style.outlineOffset = '2px';
            this.config.callbacks.onSelect(this, true);
        }
    }

    deselect() {
        if (this.selected) {
            this.selected = false;
            this.element.style.outline = '';
            this.element.style.outlineOffset = '';
            this.config.callbacks.onSelect(this, false);
        }
    }

    getConnections() {
        return Array.from(this.connections).map(id => Module.connections.get(id));
    }

    getInputs() {
        return [...this.inputs];
    }

    getOutputs() {
        return [...this.outputs];
    }

    setDraggable(draggable) {
        this.config.draggable = draggable;
        this.element.style.cursor = draggable ? 'move' : 'default';
    }

    destroy() {
        this.disconnectAll();
        this.element.remove();
        Module.modules.delete(this.id);
        console.log(`🗑️ Module destroyed: ${this.name}`);
    }

    // Static methods
    static getModule(id) {
        return Module.modules.get(id);
    }

    static getAllModules() {
        return Array.from(Module.modules.values());
    }

    static getAllConnections() {
        return Array.from(Module.connections.values());
    }

    static clearAll() {
        Module.modules.forEach(module => module.destroy());
        const svg = document.getElementById('module-connections-svg');
        if (svg) svg.remove();
    }
}

export default Module;
