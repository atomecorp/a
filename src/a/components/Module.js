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
            zIndex: '1000',
            ...this.config.style
        });

        // Create header with module name
        this._createHeader();
        
        // Create connector areas
        this._createConnectors();
        
        // Create content area
        this._createContent();

        // Apply selection prevention

        container.appendChild(this.element);
    }

    /**
     * Apply selection prevention to module components
     */
 
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

        this.header.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._enableRename();
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
            
            // Start global selection prevention for drag operation
            
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
            
            // Stop global selection prevention
    
            
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
                    connector.style.boxShadow = '';
                }
            }
        });
    }

    _findDropTarget(mouseEvent) {
        const elementUnderMouse = document.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY);
        if (!elementUnderMouse) return null;
        
        const connector = elementUnderMouse.closest('.module-connector');
        if (!connector) return null;
        
        const module = Module.modules.get(connector.closest('.squirrel-module').id);
        if (!module) return null;
        
        return {
            element: connector,
            module: module,
            id: connector.dataset.connectorId,
            type: connector.dataset.connectorType
        };
    }

    _isValidConnection(startConnector, endConnector) {
        // Can't connect to self
        if (startConnector.module === endConnector.module) return false;
        
        // Must be opposite types (input to output or output to input)
        if (startConnector.type === endConnector.type) return false;
        
        // Check if connection already exists
        const connectionKey = this._getConnectionKey(startConnector, endConnector);
        if (Module.connections.has(connectionKey)) return false;
        
        return true;
    }

    _createDragConnection(startConnector, endConnector) {
        const connectionKey = this._getConnectionKey(startConnector, endConnector);
        
        // Create connection object
        const connection = {
            id: connectionKey,
            from: {
                module: startConnector.module,
                connector: startConnector.id,
                element: startConnector.element
            },
            to: {
                module: endConnector.module,
                connector: endConnector.id,
                element: endConnector.element
            },
            line: this._createConnectionLine(startConnector.element, endConnector.element)
        };
        
        // Store connection
        Module.connections.set(connectionKey, connection);
        
        // Update module connection sets
        startConnector.module.connections.add(connectionKey);
        endConnector.module.connections.add(connectionKey);
        
        // Trigger callbacks
        startConnector.module.config.callbacks.onConnect(connection);
        endConnector.module.config.callbacks.onConnect(connection);
        
        console.log(`🔗 Connection created: ${startConnector.module.name}.${startConnector.id} → ${endConnector.module.name}.${endConnector.id}`);
        
        return connection;
    }

    _createConnectionLine(fromElement, toElement) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const svg = this._getOrCreateSVG();
        
        line.setAttribute('stroke', '#3498db');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-linecap', 'round');
        line.style.pointerEvents = 'none';
        
        // Update line position
        this._updateConnectionLine(line, fromElement, toElement);
        
        svg.appendChild(line);
        return line;
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

    _getConnectionKey(connector1, connector2) {
        // Ensure consistent ordering for connection keys
        const c1 = `${connector1.module.id}.${connector1.id}`;
        const c2 = `${connector2.module.id}.${connector2.id}`;
        return c1 < c2 ? `${c1}→${c2}` : `${c2}→${c1}`;
    }

    _getConnectorConnections(connectorId, connectorType) {
        const connections = [];
        Module.connections.forEach((connection, key) => {
            if ((connection.from.connector === connectorId && connection.from.module === this) ||
                (connection.to.connector === connectorId && connection.to.module === this)) {
                connections.push(connection);
            }
        });
        return connections;
    }

    _getOrCreateSVG() {
        let svg = document.querySelector('#squirrel-connections-svg');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 'squirrel-connections-svg';
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

    _createContent() {
        this.content = document.createElement('div');
        this.content.className = 'module-content';
        
        Object.assign(this.content.style, {
            padding: '12px',
            height: 'calc(100% - 32px)',
            overflow: 'hidden'
        });
        
        this.element.appendChild(this.content);
    }

    _setupEventHandlers() {
        // Module dragging
        if (this.config.draggable) {
            this._setupModuleDrag();
        }
        
        // Module selection
        this.element.addEventListener('click', (e) => {
            if (e.target.closest('.module-connector')) return; // Don't select when clicking connectors
            
            this.select();
            e.stopPropagation();
        });
        
        // Context menu
        this.element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._showContextMenu(e);
        });
    }

    _setupModuleDrag() {
        let isDragging = false;
        let startPos = { x: 0, y: 0 };
        let startMousePos = { x: 0, y: 0 };

        this.header.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Only left click
            
            // Start global selection prevention for module drag
            
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = true;
            startPos = { x: this.config.x, y: this.config.y };
            startMousePos = { x: e.clientX, y: e.clientY };
            
            this.element.style.zIndex = '1001';
            this.element.style.cursor = 'grabbing';
            
            Module.draggedModule = this;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startMousePos.x;
            const deltaY = e.clientY - startMousePos.y;
            
            this.config.x = startPos.x + deltaX;
            this.config.y = startPos.y + deltaY;
            
            // Apply grid snapping if enabled
            if (this.config.grid.enabled) {
                this.config.x = Math.round(this.config.x / this.config.grid.size) * this.config.grid.size;
                this.config.y = Math.round(this.config.y / this.config.grid.size) * this.config.grid.size;
            }
            
            this.element.style.left = `${this.config.x}px`;
            this.element.style.top = `${this.config.y}px`;
            
            // Update connections
            this._updateConnectionLines();
            
            // Trigger move callback
            this.config.callbacks.onMove(this);
        });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            
            isDragging = false;
            
            // Stop global selection prevention
            
            this.element.style.zIndex = '1000';
            this.element.style.cursor = this.config.draggable ? 'move' : 'default';
            
            Module.draggedModule = null;
        });
    }

    _updateConnectionLines() {
        this.connections.forEach(connectionKey => {
            const connection = Module.connections.get(connectionKey);
            if (connection && connection.line) {
                this._updateConnectionLine(
                    connection.line,
                    connection.from.element,
                    connection.to.element
                );
            }
        });
    }

    _showContextMenu(event) {
        // Create context menu
        const menu = document.createElement('div');
        menu.className = 'module-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${event.clientX}px;
            top: ${event.clientY}px;
            background: #2c3e50;
            border: 1px solid #34495e;
            border-radius: 4px;
            padding: 8px 0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            min-width: 120px;
        `;
        
        // Menu items
        const items = [
            { text: 'Duplicate', action: () => this.duplicate() },
            { text: 'Disconnect All', action: () => this.disconnectAll() },
            { text: 'Delete', action: () => this.delete() },
            { text: 'Properties', action: () => this.showProperties() }
        ];
        
        items.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.textContent = item.text;
            menuItem.style.cssText = `
                padding: 8px 16px;
                color: white;
                cursor: pointer;
                font-size: 12px;
            `;
            
            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.backgroundColor = '#34495e';
            });
            
            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.backgroundColor = 'transparent';
            });
            
            menuItem.addEventListener('click', () => {
                item.action();
                menu.remove();
            });
            
            menu.appendChild(menuItem);
        });
        
        // Close menu on outside click
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        document.addEventListener('click', closeMenu);
        document.body.appendChild(menu);
    }

    _enableRename() {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = this.name;
        
        Object.assign(input.style, {
            background: 'transparent',
            border: '1px solid #3498db',
            color: 'white',
            padding: '4px 8px',
            fontSize: '12px',
            fontWeight: 'bold',
            width: 'calc(100% - 16px)',
            borderRadius: '3px'
        });

        this.header.innerHTML = '';
        this.header.appendChild(input);
        
        input.focus();
        input.select();

        const finishRename = () => {
            const newName = input.value.trim();
            if (newName && newName !== this.name) {
                this.name = newName;
                this.config.name = newName;
            }
            this.header.innerHTML = '';
            this.header.textContent = this.name;
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finishRename();
            if (e.key === 'Escape') {
                this.header.innerHTML = '';
                this.header.textContent = this.name;
            }
        });
    }

    // ...existing code...
    // Public API methods
    select() {
        // Deselect all other modules
        Module.modules.forEach(module => {
            if (module !== this) module.deselect();
        });
        
        this.selected = true;
        this.element.style.border = '2px solid #3498db';
        this.element.style.boxShadow = '0 0 0 2px rgba(52, 152, 219, 0.3)';
        
        this.config.callbacks.onSelect(this);
    }

    deselect() {
        this.selected = false;
        this.element.style.border = this.config.style.border || '2px solid #34495e';
        this.element.style.boxShadow = this.config.style.boxShadow || '0 4px 12px rgba(0,0,0,0.2)';
    }

    moveTo(x, y) {
        this.config.x = x;
        this.config.y = y;
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
        this._updateConnectionLines();
        this.config.callbacks.onMove(this);
    }

    duplicate() {
        const newConfig = JSON.parse(JSON.stringify(this.config));
        newConfig.id = `module_${Date.now()}`;
        newConfig.x += 20;
        newConfig.y += 20;
        newConfig.name += ' (Copy)';
        
        return new Module(newConfig);
    }

    delete() {
        // Remove all connections
        const connectionsToRemove = [...this.connections];
        connectionsToRemove.forEach(connectionKey => {
            const connection = Module.connections.get(connectionKey);
            if (connection) {
                connection.line.remove();
                Module.connections.delete(connectionKey);
            }
        });
        
        // Remove from registry
        Module.modules.delete(this.id);
        
        // Remove DOM element
        this.element.remove();
        
        console.log(`🗑️ Module deleted: ${this.name} (${this.id})`);
    }

    showProperties() {
        console.log('📋 Module Properties:', {
            id: this.id,
            name: this.name,
            position: { x: this.config.x, y: this.config.y },
            size: { width: this.config.width, height: this.config.height },
            inputs: this.inputs,
            outputs: this.outputs,
            connections: this.connections.size
        });
    }

    disconnectAll() {
        const connectionsToRemove = [...this.connections];
        connectionsToRemove.forEach(connectionKey => {
            const connection = Module.connections.get(connectionKey);
            if (connection) {
                connection.line.remove();
                Module.connections.delete(connectionKey);
                
                // Remove from other module's connections set
                if (connection.from.module !== this) {
                    connection.from.module.connections.delete(connectionKey);
                }
                if (connection.to.module !== this) {
                    connection.to.module.connections.delete(connectionKey);
                }
            }
        });
        
        this.connections.clear();
    }

    // Static methods
    static getModule(id) {
        return Module.modules.get(id);
    }

    static getAllModules() {
        return Array.from(Module.modules.values());
    }

    static getConnection(id) {
        return Module.connections.get(id);
    }

    static getAllConnections() {
        return Array.from(Module.connections.values());
    }

    static clearAll() {
        // Remove all connections
        Module.connections.forEach(connection => {
            if (connection.line) connection.line.remove();
        });
        Module.connections.clear();
        
        // Remove all modules
        Module.modules.forEach(module => {
            module.element.remove();
        });
        Module.modules.clear();
        
        // Remove SVG
        const svg = document.querySelector('#squirrel-connections-svg');
        if (svg) svg.remove();
    }
}

export default Module;
