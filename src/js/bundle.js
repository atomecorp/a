var SquirrelApp = (function () {
    'use strict';

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
        static selectedConnector = null;

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
            // Click system for connection/disconnection
            connector.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const connectorId = connector.dataset.connectorId;
                const connectorType = connector.dataset.connectorType;
                
                const connectorInfo = {
                    element: connector,
                    module: this,
                    id: connectorId,
                    type: connectorType
                };
                
                if (!Module.selectedConnector) {
                    // First selection
                    Module.selectedConnector = connectorInfo;
                    connector.style.border = '3px solid #00ff00';
                    connector.style.boxShadow = '0 0 10px #00ff00';
                } else {
                    // Second selection
                    const first = Module.selectedConnector;
                    const second = connectorInfo;
                    
                    // Clear first connector highlight
                    first.element.style.border = '2px solid white';
                    first.element.style.boxShadow = '';
                    
                    // Check if valid connection (opposite types, different modules)
                    if (first.type !== second.type && first.module !== second.module) {
                        // Check if already connected
                        const connectionKey = this._getConnectionKey(first, second);
                        const existingConnection = Module.connections.get(connectionKey);
                        
                        if (existingConnection) {
                            // Disconnect
                            existingConnection.line.remove();
                            Module.connections.delete(connectionKey);
                            first.module.connections.delete(connectionKey);
                            second.module.connections.delete(connectionKey);
                            
                            // Trigger disconnect callbacks
                            if (first.module.config.callbacks.onDisconnect) {
                                first.module.config.callbacks.onDisconnect(existingConnection);
                            }
                            if (second.module.config.callbacks.onDisconnect) {
                                second.module.config.callbacks.onDisconnect(existingConnection);
                            }
                        } else {
                            // Connect
                            this._createDragConnection(first, second);
                        }
                    }
                    
                    Module.selectedConnector = null;
                }
            });

            // Drag and drop system for connections
            let isDragging = false;
            let dragLine = null;
            let startConnector = null;

            connector.addEventListener('mousedown', (e) => {
                // Only start drag if not a click (right button or long press)
                if (e.button !== 0) return;
                
                e.preventDefault();
                e.stopPropagation();
                
                const dragTimer = setTimeout(() => {
                    // Start drag after a short delay to distinguish from click
                    isDragging = true;
                    startConnector = {
                        element: connector,
                        module: this,
                        id: connector.dataset.connectorId,
                        type: connector.dataset.connectorType
                    };
                    
                    // Create drag line
                    dragLine = this._createDragLine(connector);
                    
                    // Add visual feedback
                    connector.classList.add('dragging');
                    connector.style.transform = 'scale(1.3)';
                    connector.style.border = '3px solid #00ff00';
                    
                    // Highlight valid drop targets
                    this._highlightDropTargets(startConnector, e);
                    
                    Module.connectionInProgress = {
                        startConnector,
                        dragLine
                    };
                }, 150); // 150ms delay to distinguish from click

                const handleMouseMove = (e) => {
                    if (isDragging && dragLine) {
                        // Update drag line position
                        this._updateDragLine(dragLine, connector, {
                            x: e.clientX,
                            y: e.clientY
                        });
                        
                        // Update drop target highlights
                        this._highlightDropTargets(startConnector, e);
                    }
                };

                const handleMouseUp = (e) => {
                    clearTimeout(dragTimer);
                    
                    if (isDragging) {
                        // Find drop target
                        const dropTarget = this._findDropTarget(e);
                        
                        if (dropTarget && this._isValidConnection(startConnector, dropTarget)) {
                            // Create connection
                            this._createDragConnection(startConnector, dropTarget);
                        }
                        
                        // Clean up
                        if (dragLine) {
                            dragLine.remove();
                            dragLine = null;
                        }
                        
                        connector.classList.remove('dragging');
                        connector.style.transform = 'scale(1)';
                        connector.style.border = '2px solid white';
                        
                        this._clearDropTargetHighlights();
                        
                        Module.connectionInProgress = null;
                        isDragging = false;
                        startConnector = null;
                    }
                    
                    // Remove event listeners
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                };

                // Add global event listeners
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            });
            
            // Clear selection when clicking elsewhere
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.module-connector') && Module.selectedConnector) {
                    Module.selectedConnector.element.style.border = '2px solid white';
                    Module.selectedConnector.element.style.boxShadow = '';
                    Module.selectedConnector = null;
                }
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
                    connector.dataset.connectorType;
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

    class Slider {
        constructor(config) {
            // Stocker la config originale pour vérifier quelles valeurs ont été explicitement définies
            this.originalConfig = config || {};
            
            // Configuration par défaut
            this.config = {
                attach: 'body',
                id: 'slider_' + Math.random().toString(36).substr(2, 9),
                x: 20,
                y: 20,
                width: 300,
                height: 60,
                trackWidth: 300,
                trackHeight: 8,
                thumbSize: 24,
                min: 0,
                max: 100,
                step: 1,
                value: 50,
                type: 'horizontal', // 'horizontal', 'vertical', 'circular'
                
                // ===== NOUVELLE API DE STYLING AVANCÉ =====
                grip: {
                    // Styles pour le thumb/curseur
                    width: null,           // Si null, utilise thumbSize
                    height: null,          // Si null, utilise thumbSize
                    backgroundColor: '#2196f3',
                    border: '3px solid #ffffff',
                    borderRadius: '50%',
                    boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out'
                },
                
                support: {
                    // Styles pour le conteneur/background
                    backgroundColor: '#ffffff',
                    border: '1px solid rgba(0,0,0,0.04)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
                    padding: '15px'
                },
                
                rail: {
                    // Styles pour la track/rail
                    backgroundColor: '#e0e0e0',
                    borderRadius: '3px',
                    height: null,          // Si null, utilise trackHeight
                    width: null            // Si null, utilise trackWidth
                },
                
                progress: {
                    // Styles pour la barre de progression
                    backgroundColor: '#2196f3',
                    borderRadius: '3px',
                    boxShadow: '0 2px 4px rgba(33, 150, 243, 0.3)',
                    transition: 'width 0.2s ease-out, height 0.2s ease-out'
                },
                
                // ===== API LEGACY (maintenue pour compatibilité) =====
                colors: {
                    container: '#ffffff',
                    track: '#e0e0e0',
                    progress: '#2196f3',
                    thumb: '#2196f3'
                },
                
                animations: {
                    enabled: true,
                    duration: 0.2,
                    easing: 'ease-out'
                },
                callbacks: {
                    onChange: null,
                    onStart: null,
                    onEnd: null,
                    onDrag: null
                },
                theme: 'material',
                variation: null,
                circular: {
                    radius: 80,
                    strokeWidth: 8,
                    startAngle: 0,
                    endAngle: 270
                },
                ...config
            };

            this.currentValue = this.config.value;
            this.isDragging = false;
            this.elements = {};

            // Fusionner les styles legacy avec la nouvelle API
            this._mergeStyleAPIs();

            this._init();
        }

        _mergeStyleAPIs() {
            // Fusionner l'API legacy colors avec la nouvelle API de styling
            if (this.config.colors) {
                // Support (container)
                if (this.config.colors.container && !this.originalConfig.support?.backgroundColor) {
                    this.config.support.backgroundColor = this.config.colors.container;
                }
                
                // Rail (track)
                if (this.config.colors.track && !this.originalConfig.rail?.backgroundColor) {
                    this.config.rail.backgroundColor = this.config.colors.track;
                }
                
                // Progress
                if (this.config.colors.progress && !this.originalConfig.progress?.backgroundColor) {
                    this.config.progress.backgroundColor = this.config.colors.progress;
                }
                
                // Grip (thumb)
                if (this.config.colors.thumb && !this.originalConfig.grip?.backgroundColor) {
                    this.config.grip.backgroundColor = this.config.colors.thumb;
                    // Mettre à jour aussi la boxShadow pour rester cohérent
                    if (!this.originalConfig.grip?.boxShadow) {
                        const thumbColor = this.config.colors.thumb;
                        this.config.grip.boxShadow = `0 4px 12px ${this._addAlphaToColor(thumbColor, 0.4)}`;
                    }
                }
            }
            
            // Appliquer les dimensions personnalisées
            if (this.config.grip.width === null) {
                this.config.grip.width = this.config.thumbSize;
            }
            if (this.config.grip.height === null) {
                this.config.grip.height = this.config.thumbSize;
            }
            if (this.config.rail.height === null) {
                this.config.rail.height = this.config.trackHeight;
            }
            if (this.config.rail.width === null) {
                this.config.rail.width = this.config.trackWidth;
            }
        }

        _init() {
            if (this.config.type === 'circular') {
                this._createCircularSlider();
                this._attachCircularEvents();
            } else {
                this._createLinearSlider();
                this._attachEvents();
            }
            this._applyStyles();
            this.setValue(this.config.value);
        }

        _createLinearSlider() {
            // Ajuster trackWidth et trackHeight selon le type et les dimensions
            if (this.config.type === 'vertical') {
                // Pour vertical: trackWidth = épaisseur, trackHeight = longueur utilisable
                if (!this.originalConfig.hasOwnProperty('trackWidth')) {
                    this.config.trackWidth = 8; // Épaisseur par défaut
                }
                if (!this.originalConfig.hasOwnProperty('trackHeight')) {
                    this.config.trackHeight = Math.max(100, this.config.height - 40); // Longueur utilisable
                }
            } else {
                // Pour horizontal: trackWidth = longueur utilisable, trackHeight = épaisseur
                if (!this.originalConfig.hasOwnProperty('trackWidth')) {
                    this.config.trackWidth = Math.max(100, this.config.width - 40); // Longueur utilisable
                }
                if (!this.originalConfig.hasOwnProperty('trackHeight')) {
                    this.config.trackHeight = 8; // Épaisseur par défaut
                }
            }
            
            this._createContainer();
            this._createTrack();
            this._createProgress();
            this._createThumb();
        }

        _createCircularSlider() {
            this._createCircularContainer();
            this._createCircularTrack();
            this._createCircularProgress();
            this._createCircularThumb();
        }

        _createContainer() {
            this.config.type === 'vertical';
            
            this.elements.container = new A({
                attach: this.config.attach,
                id: this.config.id + '_container',
                markup: 'div',
                role: 'slider-container',
                x: this.config.x,
                y: this.config.y,
                width: this.config.width,
                height: this.config.height,
                // Utiliser une couleur de base pour éviter les conflits avec la particle backgroundColor
                backgroundColor: '#ffffff', // Couleur temporaire
                border: this.config.support.border,
                smooth: this.config.support.borderRadius ? parseInt(this.config.support.borderRadius) : 12,
                padding: this.config.support.padding ? parseInt(this.config.support.padding) : 15,
                boxShadow: this.config.support.boxShadow,
                overflow: 'visible'
            });
            
            // Appliquer directement le style backgroundColor pour supporter les dégradés
            // Utiliser une approche plus robuste avec un délai plus long
            const applyGradient = () => {
                if (this.elements.container && this.elements.container.html_object) {
                    this.elements.container.html_object.style.background = this.config.support.backgroundColor;
                    this.elements.container.html_object.style.backgroundImage = 
                        this.config.support.backgroundColor.includes('gradient') ? 
                        this.config.support.backgroundColor : '';
                    
                    // Debug: vérifier que le style est appliqué
                    console.log('🎨 Support background appliqué:', this.config.support.backgroundColor);
                    console.log('🔍 Element style:', this.elements.container.html_object.style.background);
                } else {
                    // Réessayer si l'élément n'est pas encore prêt
                    setTimeout(applyGradient, 10);
                }
            };
            
            setTimeout(applyGradient, 50);
        }

        _createTrack() {
            this.config.type === 'vertical';
            
            // Calculer le padding effectif
            const padding = this.config.support.padding ? parseInt(this.config.support.padding) : 15;
            const paddingTotal = padding * 2; // padding des deux côtés
            
            // Zone utilisable après déduction du padding
            const usableWidth = this.config.width - paddingTotal;
            const usableHeight = this.config.height - paddingTotal;
            
            this.elements.track = new A({
                attach: `#${this.config.id}_container`,
                id: this.config.id + '_track',
                markup: 'div',
                // CORRECTION: calcul de centrage dans la zone utilisable (après padding)
                x: (usableWidth - this.config.trackWidth) / 2,
                y: (usableHeight - this.config.trackHeight) / 2,
                // Dimensions correctes selon l'orientation
                width: this.config.trackWidth,
                height: this.config.trackHeight,
                // NOUVELLE API: utiliser rail pour le styling du track
                backgroundColor: this.config.rail.backgroundColor,
                smooth: this.config.rail.borderRadius ? parseInt(this.config.rail.borderRadius) : 3,
                position: 'relative',
                cursor: 'pointer'
            });
        }

        _createProgress() {
            const isVertical = this.config.type === 'vertical';
            // Correction: pour vertical, la progression se base sur trackHeight (hauteur de la barre)
            const initialSize = (this.currentValue / (this.config.max - this.config.min)) * 
                               (isVertical ? this.config.trackHeight : this.config.trackWidth);
            
            this.elements.progress = new A({
                attach: `#${this.config.id}_track`,
                id: this.config.id + '_progress',
                markup: 'div',
                x: 0,
                // Correction: pour vertical, y se base sur trackHeight
                y: isVertical ? this.config.trackHeight - initialSize : 0,
                // Correction: pour vertical, width = trackWidth, height = progression
                width: isVertical ? this.config.trackWidth : initialSize,
                height: isVertical ? initialSize : this.config.trackHeight,
                // NOUVELLE API: utiliser progress pour le styling
                backgroundColor: '#ffffff', // Couleur temporaire pour éviter les conflits
                smooth: this.config.progress.borderRadius ? parseInt(this.config.progress.borderRadius) : 3,
                position: 'absolute',
                transition: this.config.animations.enabled ? 
                           this.config.progress.transition || 
                           `${isVertical ? 'height' : 'width'} ${this.config.animations.duration}s ${this.config.animations.easing}` : 'none',
                boxShadow: this.config.progress.boxShadow
            });
            
            // Appliquer le dégradé pour la barre de progression
            const applyProgressGradient = () => {
                if (this.elements.progress && this.elements.progress.html_object) {
                    this.elements.progress.html_object.style.background = this.config.progress.backgroundColor;
                    this.elements.progress.html_object.style.backgroundImage = 
                        this.config.progress.backgroundColor.includes('gradient') ? 
                        this.config.progress.backgroundColor : '';
                    
                    console.log('🌈 Progress background appliqué:', this.config.progress.backgroundColor);
                } else {
                    setTimeout(applyProgressGradient, 10);
                }
            };
            
            setTimeout(applyProgressGradient, 50);
        }

        _createThumb() {
            const isVertical = this.config.type === 'vertical';
            // Correction: pour vertical, le thumb se déplace sur trackHeight (hauteur de la barre)
            const trackSize = isVertical ? this.config.trackHeight : this.config.trackWidth;
            const initialPosition = (this.currentValue / (this.config.max - this.config.min)) * trackSize;
            
            this.elements.thumb = new A({
                attach: `#${this.config.id}_track`,
                id: this.config.id + '_thumb',
                markup: 'div',
                // Correction: pour vertical, x se centre sur trackWidth, y suit la position sur trackHeight
                x: isVertical ? (this.config.trackWidth - this.config.grip.width) / 2 : initialPosition - this.config.grip.width / 2,
                y: isVertical ? this.config.trackHeight - initialPosition - this.config.grip.height / 2 : 
                   (this.config.trackHeight - this.config.grip.height) / 2,
                // NOUVELLE API: utiliser grip pour le styling du thumb
                width: this.config.grip.width,
                height: this.config.grip.height,
                backgroundColor: this.config.grip.backgroundColor,
                smooth: this.config.grip.borderRadius || '50%',
                position: 'absolute',
                cursor: this.config.grip.cursor,
                transition: this.config.animations.enabled ? 
                           this.config.grip.transition || 
                           `transform ${this.config.animations.duration}s ${this.config.animations.easing}, box-shadow ${this.config.animations.duration}s ${this.config.animations.easing}` : 'none',
                boxShadow: this.config.grip.boxShadow,
                border: this.config.grip.border
            });
        }

        _applyStyles() {
            // Appliquer le thème
            this._applyTheme();

            // Appliquer les styles de la nouvelle API
            this._applySupportStyles();
            this._applyRailStyles();
            this._applyProgressStyles();
            this._applyGripStyles();

            // Ajouter les styles CSS pour les animations
            if (!document.getElementById('slider-animations')) {
                const style = document.createElement('style');
                style.id = 'slider-animations';
                style.textContent = `
                @keyframes ripple {
                    to {
                        transform: translate(-50%, -50%) scale(4);
                        opacity: 0;
                    }
                }
                
                .slider-thumb:focus {
                    outline: 2px solid #2196f3;
                    outline-offset: 2px;
                }
            `;
                document.head.appendChild(style);
            }
        }

        _updateVariationColors(percentage) {
            if (!this.config.variation || !Array.isArray(this.config.variation)) {
                // Couleur dynamique par défaut (rouge vers vert)
                const hue = percentage * 120; // 0 (rouge) à 120 (vert)
                const color = `hsl(${hue}, 70%, 50%)`;
                this.elements.progress.html_object.style.backgroundColor = color;
                this.elements.thumb.html_object.style.backgroundColor = color;
                this.elements.thumb.html_object.style.boxShadow = `0 4px 12px hsla(${hue}, 70%, 50%, 0.4)`;
                return;
            }

            // Interpolation entre les couleurs du tableau variation
            const colors = this.config.variation;
            if (colors.length === 0) return;

            // Si on a qu'une couleur, l'utiliser
            if (colors.length === 1) {
                const color = colors[0].color;
                this.elements.progress.html_object.style.backgroundColor = color;
                this.elements.thumb.html_object.style.backgroundColor = color;
                return;
            }

            // Trouver les deux couleurs entre lesquelles interpoler
            let color1 = colors[0];
            let color2 = colors[colors.length - 1];
            
            for (let i = 0; i < colors.length - 1; i++) {
                const currentPos = this._parsePosition(colors[i].position) / 100;
                const nextPos = this._parsePosition(colors[i + 1].position) / 100;
                
                if (percentage >= currentPos && percentage <= nextPos) {
                    color1 = colors[i];
                    color2 = colors[i + 1];
                    break;
                }
            }

            // Calculer le facteur d'interpolation entre les deux couleurs
            const pos1 = this._parsePosition(color1.position) / 100;
            const pos2 = this._parsePosition(color2.position) / 100;
            const factor = pos1 === pos2 ? 0 : (percentage - pos1) / (pos2 - pos1);

            // Interpoler entre les deux couleurs
            const interpolatedColor = this._interpolateColors(color1.color, color2.color, factor);
            
            this.elements.progress.html_object.style.backgroundColor = interpolatedColor;
            this.elements.thumb.html_object.style.backgroundColor = interpolatedColor;
            
            // Ajouter une ombre avec la même couleur
            const shadowColor = this._addAlphaToColor(interpolatedColor, 0.4);
            this.elements.thumb.html_object.style.boxShadow = `0 4px 12px ${shadowColor}`;
        }

        _parsePosition(position) {
            if (typeof position === 'string') {
                return parseFloat(position.replace('%', ''));
            }
            if (typeof position === 'object' && position.x) {
                return parseFloat(position.x.replace('%', ''));
            }
            return 0;
        }

        _interpolateColors(color1, color2, factor) {
            // Convertir les couleurs en RGB
            const rgb1 = this._hexToRgb(color1);
            const rgb2 = this._hexToRgb(color2);
            
            if (!rgb1 || !rgb2) return color1;

            // Interpoler chaque composant RGB
            const r = Math.round(rgb1.r + factor * (rgb2.r - rgb1.r));
            const g = Math.round(rgb1.g + factor * (rgb2.g - rgb1.g));
            const b = Math.round(rgb1.b + factor * (rgb2.b - rgb1.b));

            return `rgb(${r}, ${g}, ${b})`;
        }

        _hexToRgb(hex) {
            // Support pour les couleurs hex (#rrggbb) et nommées
            if (hex.startsWith('#')) {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ? {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16)
                } : null;
            }
            
            // Pour les couleurs nommées, créer un élément temporaire pour obtenir la valeur RGB
            const tempDiv = document.createElement('div');
            tempDiv.style.color = hex;
            document.body.appendChild(tempDiv);
            const rgbColor = window.getComputedStyle(tempDiv).color;
            document.body.removeChild(tempDiv);
            
            const match = rgbColor.match(/\d+/g);
            return match ? {
                r: parseInt(match[0]),
                g: parseInt(match[1]),
                b: parseInt(match[2])
            } : null;
        }

        _addAlphaToColor(color, alpha) {
            if (color.startsWith('rgb(')) {
                return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
            }
            return color;
        }

        _applyTheme() {
            const themes = {
                material: {
                    containerShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
                    thumbShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
                    borderRadius: '12px'
                },
                flat: {
                    containerShadow: 'none',
                    thumbShadow: 'none',
                    borderRadius: '0px'
                },
                custom: {} // L'utilisateur peut définir ses propres styles
            };

            const theme = themes[this.config.theme] || themes.material;
            
            if (theme.containerShadow) {
                this.elements.container.html_object.style.boxShadow = theme.containerShadow;
            }
            if (theme.thumbShadow && this.elements.thumb) {
                this.elements.thumb.html_object.style.boxShadow = theme.thumbShadow;
            }
            if (theme.borderRadius) {
                this.elements.container.html_object.style.borderRadius = theme.borderRadius;
            }
        }

        _attachEvents() {
            this._attachHoverEvents();
            this._attachClickEvents();
            this._attachDragEvents();
            this._attachKeyboardEvents();
        }

        _attachCircularEvents() {
            this._attachCircularHoverEvents();
            this._attachCircularKeyboardEvents();
        }

        _attachCircularHoverEvents() {
            if (!this.elements.thumb) return;
            
            this.elements.thumb.html_object.addEventListener('mouseenter', () => {
                if (!this.isDragging) {
                    this.elements.thumb.html_object.style.transform = 'scale(1.2)';
                }
            });

            this.elements.thumb.html_object.addEventListener('mouseleave', () => {
                if (!this.isDragging) {
                    this.elements.thumb.html_object.style.transform = 'scale(1)';
                }
            });
        }

        _attachCircularKeyboardEvents() {
            if (!this.elements.thumb) return;
            
            this.elements.thumb.html_object.setAttribute('tabindex', '0');
            this.elements.thumb.html_object.classList.add('slider-thumb');
            
            this.elements.thumb.html_object.addEventListener('keydown', (e) => {
                let newValue = this.currentValue;
                
                switch(e.key) {
                    case 'ArrowLeft':
                    case 'ArrowDown':
                        newValue -= this.config.step;
                        break;
                    case 'ArrowRight':
                    case 'ArrowUp':
                        newValue += this.config.step;
                        break;
                    case 'Home':
                        newValue = this.config.min;
                        break;
                    case 'End':
                        newValue = this.config.max;
                        break;
                    default:
                        return;
                }
                
                this.setValue(newValue);
                this._triggerCallback('onChange', newValue);
                e.preventDefault();
            });
        }

        _attachHoverEvents() {
            this.elements.thumb.html_object.addEventListener('mouseenter', () => {
                if (!this.isDragging) {
                    this.elements.thumb.html_object.style.transform = 'scale(1.2)';
                }
            });

            this.elements.thumb.html_object.addEventListener('mouseleave', () => {
                if (!this.isDragging) {
                    this.elements.thumb.html_object.style.transform = 'scale(1)';
                }
            });
        }

        _attachClickEvents() {
            // Seulement pour les sliders linéaires
            if (this.config.type !== 'circular') {
                this.elements.track.html_object.addEventListener('click', (e) => {
                    if (!this.isDragging) {
                        const newValue = this._getValueFromEvent(e);
                        this.setValue(newValue);
                        this._createRipple(e);
                        this._triggerCallback('onChange', newValue);
                    }
                });
            }
        }

        _attachDragEvents() {
            this.elements.thumb.html_object.addEventListener('mousedown', (e) => {
                this._startDrag(e);
            });
        }

        _attachKeyboardEvents() {
            this.elements.thumb.html_object.setAttribute('tabindex', '0');
            this.elements.thumb.html_object.classList.add('slider-thumb');
            
            this.elements.thumb.html_object.addEventListener('keydown', (e) => {
                let newValue = this.currentValue;
                
                switch(e.key) {
                    case 'ArrowLeft':
                    case 'ArrowDown':
                        newValue -= this.config.step;
                        break;
                    case 'ArrowRight':
                    case 'ArrowUp':
                        newValue += this.config.step;
                        break;
                    case 'Home':
                        newValue = this.config.min;
                        break;
                    case 'End':
                        newValue = this.config.max;
                        break;
                    default:
                        return;
                }
                
                this.setValue(newValue);
                this._triggerCallback('onChange', newValue);
                e.preventDefault();
            });
        }

        _startDrag(e) {
            this.isDragging = true;
            this.elements.thumb.html_object.style.transform = 'scale(1.3)';
            this.elements.thumb.html_object.style.zIndex = '1000';
            document.body.style.userSelect = 'none';

            // Désactiver les transitions pendant le drag
            this.elements.progress.html_object.style.transition = 'none';

            this._triggerCallback('onStart', this.currentValue);

            const handleMouseMove = (e) => {
                if (this.isDragging) {
                    const newValue = this._getValueFromEvent(e);
                    this.setValue(newValue);
                    this._triggerCallback('onChange', newValue);
                }
            };

            const handleMouseUp = () => {
                this.isDragging = false;
                this.elements.thumb.html_object.style.transform = 'scale(1)';
                this.elements.thumb.html_object.style.zIndex = '';
                document.body.style.userSelect = '';

                // Réactiver les transitions
                if (this.config.animations.enabled) {
                    const isVertical = this.config.type === 'vertical';
                    this.elements.progress.html_object.style.transition = 
                        `${isVertical ? 'height' : 'width'} ${this.config.animations.duration}s ${this.config.animations.easing}`;
                }

                this._triggerCallback('onEnd', this.currentValue);

                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            e.preventDefault();
        }

        _getValueFromEvent(e) {
            const isVertical = this.config.type === 'vertical';
            const isCircular = this.config.type === 'circular';
            
            if (isCircular) {
                return this._getValueFromCircularEvent(e);
            }
            
            const trackRect = this.elements.track.html_object.getBoundingClientRect();
            
            let relativePosition;
            if (isVertical) {
                // CORRECTION: pour vertical, trackHeight est la longueur de déplacement
                const trackHeight = trackRect.height;
                relativePosition = (trackRect.bottom - e.clientY) / trackHeight;
            } else {
                relativePosition = (e.clientX - trackRect.left) / trackRect.width;
            }
            
            const value = this.config.min + (relativePosition * (this.config.max - this.config.min));
            return Math.max(this.config.min, Math.min(this.config.max, value));
        }

        _createRipple(e) {
            const ripple = document.createElement('div');
            ripple.style.cssText = `
            position: absolute;
            width: 20px;
            height: 20px;
            background: rgba(33, 150, 243, 0.3);
            border-radius: 50%;
            pointer-events: none;
            transform: translate(-50%, -50%) scale(0);
            animation: ripple 0.6s ease-out;
        `;

            const trackRect = this.elements.track.html_object.getBoundingClientRect();
            const isVertical = this.config.type === 'vertical';
            
            if (isVertical) {
                ripple.style.left = '50%';
                ripple.style.top = (e.clientY - trackRect.top) + 'px';
            } else {
                ripple.style.left = (e.clientX - trackRect.left) + 'px';
                ripple.style.top = '50%';
            }

            this.elements.track.html_object.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        }

        _triggerCallback(callbackName, value) {
            const callback = this.config.callbacks[callbackName];
            if (typeof callback === 'function') {
                callback(value, this);
            }
        }

        // API publique
        setValue(value) {
            this.currentValue;
            this.currentValue = Math.max(this.config.min, Math.min(this.config.max, value));
            
            if (this.config.type === 'circular') {
                this._setCircularValue(this.currentValue);
                return this;
            }
            
            const isVertical = this.config.type === 'vertical';
            // CORRECTION FINALE: pour vertical, trackHeight est la longueur de déplacement
            const trackSize = isVertical ? this.config.trackHeight : this.config.trackWidth;
            const percentage = (this.currentValue - this.config.min) / (this.config.max - this.config.min);
            const progressSize = percentage * trackSize;
            const thumbPosition = progressSize;

            // Mettre à jour la barre de progression
            if (isVertical) {
                this.elements.progress.height(progressSize);
                this.elements.progress.y(trackSize - progressSize);
                this.elements.thumb.y(trackSize - thumbPosition - this.config.grip.height / 2);
            } else {
                this.elements.progress.width(progressSize);
                this.elements.thumb.x(thumbPosition - this.config.grip.width / 2);
            }

            // Appliquer la variation de couleur basée sur la position
            this._updateVariationColors(percentage);
            
            return this;
        }

        getValue() {
            return this.currentValue;
        }

        getCurrentValue() {
            return this.currentValue;
        }

        setConfig(newConfig) {
            this.config = { ...this.config, ...newConfig };
            this._mergeStyleAPIs();
            this._applyStyles();
        }

        // ===== NOUVELLE API DE STYLING DYNAMIQUE =====
        
        setGripStyle(styles) {
            this.config.grip = { ...this.config.grip, ...styles };
            this._applyGripStyles();
        }
        
        setSupportStyle(styles) {
            this.config.support = { ...this.config.support, ...styles };
            this._applySupportStyles();
        }
        
        setRailStyle(styles) {
            this.config.rail = { ...this.config.rail, ...styles };
            this._applyRailStyles();
        }
        
        setProgressStyle(styles) {
            this.config.progress = { ...this.config.progress, ...styles };
            this._applyProgressStyles();
        }
        
        _applyGripStyles() {
            if (!this.elements.thumb) return;
            
            const thumb = this.elements.thumb.html_object;
            if (this.config.grip.backgroundColor) thumb.style.backgroundColor = this.config.grip.backgroundColor;
            if (this.config.grip.border) thumb.style.border = this.config.grip.border;
            if (this.config.grip.borderRadius) thumb.style.borderRadius = this.config.grip.borderRadius;
            if (this.config.grip.boxShadow) thumb.style.boxShadow = this.config.grip.boxShadow;
            if (this.config.grip.cursor) thumb.style.cursor = this.config.grip.cursor;
            if (this.config.grip.transition) thumb.style.transition = this.config.grip.transition;
        }
        
        _applySupportStyles() {
            if (!this.elements.container) return;
            
            const container = this.elements.container.html_object;
            if (this.config.support.backgroundColor) container.style.backgroundColor = this.config.support.backgroundColor;
            if (this.config.support.border) container.style.border = this.config.support.border;
            if (this.config.support.borderRadius) container.style.borderRadius = this.config.support.borderRadius;
            if (this.config.support.boxShadow) container.style.boxShadow = this.config.support.boxShadow;
            if (this.config.support.padding) container.style.padding = this.config.support.padding;
        }
        
        _applyRailStyles() {
            if (!this.elements.track) return;
            
            const track = this.elements.track.html_object;
            
            // Pour les sliders circulaires, ne pas appliquer backgroundColor au SVG
            // car la couleur du track est gérée par l'attribut stroke du path
            if (this.config.type !== 'circular') {
                if (this.config.rail.backgroundColor) track.style.backgroundColor = this.config.rail.backgroundColor;
            }
            
            if (this.config.rail.borderRadius) track.style.borderRadius = this.config.rail.borderRadius;
        }
        
        _applyProgressStyles() {
            if (!this.elements.progress) return;
            
            const progress = this.elements.progress.html_object;
            if (this.config.progress.backgroundColor) progress.style.backgroundColor = this.config.progress.backgroundColor;
            if (this.config.progress.borderRadius) progress.style.borderRadius = this.config.progress.borderRadius;
            if (this.config.progress.boxShadow) progress.style.boxShadow = this.config.progress.boxShadow;
            if (this.config.progress.transition) progress.style.transition = this.config.progress.transition;
        }

        destroy() {
            if (this.elements.container) {
                this.elements.container.html_object.remove();
            }
        }

        // ===== MÉTHODES POUR LES SLIDERS CIRCULAIRES =====
        
        _createCircularContainer() {
            const size = this.config.circular.radius * 2 + this.config.thumbSize + 20;
            
            this.elements.container = new A({
                attach: this.config.attach,
                id: this.config.id + '_container',
                markup: 'div',
                role: 'circular-slider-container',
                x: this.config.x-200,
                y: this.config.y,
                width: size,
                height: size,
                backgroundColor: this.config.colors.container,
                smooth: 12,
                padding: 10,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
                border: '1px solid rgba(0,0,0,0.04)',
                overflow: 'visible',
                position: 'relative'
            });
        }

        _createCircularTrack() {
            const { radius, strokeWidth, startAngle, endAngle } = this.config.circular;
            
            // Créer un SVG pour le track circulaire
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            const svgSize = radius * 2 + strokeWidth + 20;
            svg.setAttribute('width', svgSize);
            svg.setAttribute('height', svgSize);
            svg.style.position = 'absolute';
            
            // SIMPLIFICATION: centrer le SVG dans le conteneur
            const containerSize = this.config.circular.radius * 2 + this.config.thumbSize + 20;
            const svgOffset = (containerSize - svgSize) / 2;
            svg.style.left = svgOffset + 'px';
            svg.style.top = svgOffset + 'px';
            
            svg.style.pointerEvents = 'auto';
            svg.style.cursor = 'pointer';
            svg.style.zIndex = '5';  // Z-index plus bas que le thumb
            
            // Force la visibilité du SVG (même solution que pour les thumbs)
            svg.style.display = 'block';
            svg.style.visibility = 'visible';
            svg.style.opacity = '1';
            svg.style.backgroundColor = 'transparent';  // SVG totalement transparent
            svg.style.setProperty('border-radius', '0', 'important');  // Force la suppression du border-radius

            const centerX = radius + strokeWidth / 2 + 10;
            const centerY = radius + strokeWidth / 2 + 10;

            // Track arc (seulement la partie utilisable entre startAngle et endAngle)
            const trackArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            
            // Calculer le path de l'arc pour le track
            const startRadians = (startAngle - 90) * Math.PI / 180;
            const endRadians = (endAngle - 90) * Math.PI / 180;
            
            const startX = centerX + radius * Math.cos(startRadians);
            const startY = centerY + radius * Math.sin(startRadians);
            const endX = centerX + radius * Math.cos(endRadians);
            const endY = centerY + radius * Math.sin(endRadians);
            
            const angleRange = Math.abs(endAngle - startAngle);
            const largeArcFlag = angleRange > 180 ? 1 : 0;
            const pathData = `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
            
            trackArc.setAttribute('d', pathData);
            trackArc.setAttribute('fill', 'none');
            trackArc.setAttribute('stroke', this.config.colors.track);
            trackArc.setAttribute('stroke-width', strokeWidth);
            trackArc.setAttribute('stroke-linecap', 'round');
            
            // Force la visibilité du track path (même solution que pour les thumbs)
            trackArc.style.display = 'block';
            trackArc.style.visibility = 'visible';
            trackArc.style.opacity = '1';
            
            // Ajouter un événement de clic sur le track pour click-to-position
            trackArc.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // S'assurer qu'on n'est pas en train de dragger
                if (!this.isDragging) {
                    const newValue = this._getValueFromCircularEvent(e);
                    if (newValue !== this.currentValue) {
                        this.setValue(newValue);
                        this._triggerCallback('onChange', newValue);
                    }
                }
            });
            
            // Ajouter aussi un gestionnaire sur le conteneur SVG pour capturer tous les clics
            svg.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Vérifier si le clic n'est pas sur le thumb lui-même
                if (!this.isDragging && e.target !== this.elements.thumb?.html_object) {
                    const newValue = this._getValueFromCircularEvent(e);
                    if (newValue !== this.currentValue) {
                        this.setValue(newValue);
                        this._triggerCallback('onChange', newValue);
                    }
                }
            });
            
            // Améliorer l'accessibilité avec des événements de survol
            trackArc.addEventListener('mouseenter', () => {
                trackArc.style.opacity = '0.8';
            });
            
            trackArc.addEventListener('mouseleave', () => {
                trackArc.style.opacity = '1';
            });

            svg.appendChild(trackArc);
            
            this.elements.container.html_object.appendChild(svg);
            
            // Stocker une référence simple au SVG
            this.elements.track = { 
                html_object: svg, 
                arc: trackArc,
                radius: radius
            };
        }

        _createCircularProgress() {
            const { radius, strokeWidth } = this.config.circular;
            
            // Progress arc
            const progressArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            progressArc.setAttribute('fill', 'none');
            progressArc.setAttribute('stroke', this.config.colors.progress);
            progressArc.setAttribute('stroke-width', strokeWidth);
            progressArc.setAttribute('stroke-linecap', 'round');
            
            this.elements.track.html_object.appendChild(progressArc);
            this.elements.progress = { html_object: progressArc };
        }

        _createCircularThumb() {
            const { radius, strokeWidth, startAngle, endAngle } = this.config.circular;
            
            // Calculer la position initiale basée sur la valeur courante
            const percentage = (this.currentValue - this.config.min) / (this.config.max - this.config.min);
            const angleRange = endAngle - startAngle;
            const currentAngle = startAngle + (percentage * angleRange);
            
            // Coordonnées cohérentes avec le SVG
            const svgSize = radius * 2 + strokeWidth + 20;
            const containerSize = radius * 2 + this.config.thumbSize + 20;
            const centerOffset = (containerSize - svgSize) / 2;
            
            // Centre dans le SVG (pas dans le conteneur)
            const svgCenterX = radius + strokeWidth / 2 + 10;
            const svgCenterY = radius + strokeWidth / 2 + 10;
            
            // Convertir l'angle en radians
            const radians = (currentAngle - 90) * Math.PI / 180;
            
            // Position du thumb sur la track SVG
            const thumbX = centerOffset + svgCenterX + radius * Math.cos(radians) - this.config.thumbSize / 2;
            const thumbY = centerOffset + svgCenterY + radius * Math.sin(radians) - this.config.thumbSize / 2;
            
            this.elements.thumb = new A({
                attach: `#${this.config.id}_container`,
                id: this.config.id + '_thumb',
                markup: 'div',
                x: thumbX,
                y: thumbY,
                width: this.config.thumbSize,
                height: this.config.thumbSize,
                backgroundColor: this.config.colors.thumb,
                smooth: this.config.thumbSize / 2,
                position: 'absolute',
                cursor: 'grab',
                boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4), 0 2px 4px rgba(0,0,0,0.1)',
                border: '3px solid white',
                transition: this.config.animations.enabled ? 
                           `transform ${this.config.animations.duration}s ${this.config.animations.easing}` : 'none',
                zIndex: 25,  // Z-index plus élevé que le SVG
                display: 'block',
                visibility: 'visible',
                pointerEvents: 'auto'
            });

            // Force la visibilité du thumb
            this.elements.thumb.html_object.style.display = 'block';
            this.elements.thumb.html_object.style.visibility = 'visible';
            this.elements.thumb.html_object.style.position = 'absolute';
            this.elements.thumb.html_object.style.zIndex = '25';

            // Empêcher que les clics sur le thumb se propagent au track
            this.elements.thumb.html_object.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });

            // Ajouter les événements de drag spécifiques aux sliders circulaires
            this.elements.thumb.html_object.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.isDragging = true;
                this.elements.thumb.html_object.style.cursor = 'grabbing';
                
                // Désactiver les transitions pendant le drag pour éviter les conflits
                const originalTransition = this.elements.thumb.html_object.style.transition;
                this.elements.thumb.html_object.style.transition = 'none';
                
                // Déclencher le callback onStart
                this._triggerCallback('onStart', this.currentValue);
                
                const handleCircularDrag = (moveEvent) => {
                    if (!this.isDragging) return;
                    
                    moveEvent.preventDefault();
                    moveEvent.stopPropagation();
                    
                    // Calculer et appliquer la nouvelle valeur de manière fluide
                    const newValue = this._getValueFromCircularEvent(moveEvent);
                    if (newValue !== this.currentValue) {
                        this.setValue(newValue);
                        this._triggerCallback('onDrag', newValue);
                    }
                };

                const handleCircularDragEnd = (endEvent) => {
                    if (this.isDragging) {
                        this.isDragging = false;
                        this.elements.thumb.html_object.style.cursor = 'grab';
                        
                        // Réactiver les transitions
                        this.elements.thumb.html_object.style.transition = originalTransition;
                        
                        this._triggerCallback('onEnd', this.currentValue);
                        this._triggerCallback('onChange', this.currentValue);
                    }
                    
                    // Nettoyer les événements
                    document.removeEventListener('pointermove', handleCircularDrag);
                    document.removeEventListener('pointerup', handleCircularDragEnd);
                    document.removeEventListener('pointercancel', handleCircularDragEnd);
                };

                // Attacher les événements de mouvement et de fin
                document.addEventListener('pointermove', handleCircularDrag, { passive: false });
                document.addEventListener('pointerup', handleCircularDragEnd);
                document.addEventListener('pointercancel', handleCircularDragEnd);
            });
        }

        _getValueFromCircularEvent(e) {
            const { radius, strokeWidth, startAngle, endAngle } = this.config.circular;
            
            // SIMPLIFICATION: calcul direct du centre du conteneur
            const containerRect = this.elements.container.html_object.getBoundingClientRect();
            const centerX = containerRect.left + containerRect.width / 2;
            const centerY = containerRect.top + containerRect.height / 2;
            
            // Calculer l'angle de la souris par rapport au centre
            const deltaX = e.clientX - centerX;
            const deltaY = e.clientY - centerY;
            let mouseDegrees = Math.atan2(deltaY, deltaX) * 180 / Math.PI + 90;
            
            // Normaliser l'angle entre 0 et 360
            while (mouseDegrees < 0) mouseDegrees += 360;
            while (mouseDegrees >= 360) mouseDegrees -= 360;
            
            // Calculer la position sur l'arc avec gestion bidirectionnelle améliorée
            let relativePosition = this._getRelativePositionOnArc(mouseDegrees, startAngle, endAngle);
            
            // Convertir en valeur et appliquer le step
            const rawValue = this.config.min + (relativePosition * (this.config.max - this.config.min));
            const steppedValue = Math.round(rawValue / this.config.step) * this.config.step;
            return Math.max(this.config.min, Math.min(this.config.max, steppedValue));
        }

        _getRelativePositionOnArc(mouseDegrees, startAngle, endAngle) {
            // Normaliser les angles de l'arc
            let arcStart = startAngle % 360;
            let arcEnd = endAngle % 360;
            if (arcStart < 0) arcStart += 360;
            if (arcEnd < 0) arcEnd += 360;
            
            let relativePosition;
            
            if (arcStart <= arcEnd) {
                // Arc simple qui ne traverse pas 0°
                const arcRange = arcEnd - arcStart;
                
                if (mouseDegrees >= arcStart && mouseDegrees <= arcEnd) {
                    // Directement sur l'arc
                    relativePosition = (mouseDegrees - arcStart) / arcRange;
                } else {
                    // Hors de l'arc - trouver le côté le plus proche avec logique bidirectionnelle
                    const currentValue = this.getCurrentValue();
                    (currentValue - this.config.min) / (this.config.max - this.config.min);
                    
                    // Calculer les distances angulaires avec wrap-around
                    const distToStart = this._getAngularDistance(mouseDegrees, arcStart);
                    const distToEnd = this._getAngularDistance(mouseDegrees, arcEnd);
                    
                    // Si on clique plus près du début ou si on veut descendre en valeur
                    if (distToStart < distToEnd || (distToStart === distToEnd && mouseDegrees < arcStart + arcRange / 2)) {
                        relativePosition = 0;
                    } else {
                        relativePosition = 1;
                    }
                }
            } else {
                // Arc qui traverse 0° (ex: de 300° à 60°)
                const totalRange = (360 - arcStart) + arcEnd;
                
                if (mouseDegrees >= arcStart || mouseDegrees <= arcEnd) {
                    // Sur l'arc
                    if (mouseDegrees >= arcStart) {
                        relativePosition = (mouseDegrees - arcStart) / totalRange;
                    } else {
                        relativePosition = ((360 - arcStart) + mouseDegrees) / totalRange;
                    }
                } else {
                    // Hors de l'arc - logique bidirectionnelle améliorée
                    const gapStart = arcEnd;
                    const gapEnd = arcStart;
                    const middleOfGap = (gapStart + gapEnd) / 2;
                    
                    if (mouseDegrees <= middleOfGap) {
                        relativePosition = 1; // Plus près de la fin
                    } else {
                        relativePosition = 0; // Plus près du début
                    }
                }
            }
            
            return Math.max(0, Math.min(1, relativePosition));
        }

        _getAngularDistance(angle1, angle2) {
            const diff = Math.abs(angle1 - angle2);
            return Math.min(diff, 360 - diff);
        }

        _setCircularValue(value) {
            // S'assurer que la valeur est dans les limites
            this.currentValue = Math.max(this.config.min, Math.min(this.config.max, value));
            
            const percentage = (this.currentValue - this.config.min) / (this.config.max - this.config.min);
            const { radius, strokeWidth, startAngle, endAngle } = this.config.circular;
            
            // Calculer l'angle pour le thumb
            const angleRange = endAngle - startAngle;
            const currentAngle = startAngle + (percentage * angleRange);
            
            // SIMPLIFICATION: utiliser les dimensions du conteneur
            const containerSize = this.config.circular.radius * 2 + this.config.thumbSize + 20;
            const centerX = containerSize / 2;
            const centerY = containerSize / 2;
            
            // Convertir l'angle en radians (correction de l'offset de -90°)
            const radians = (currentAngle - 90) * Math.PI / 180;
            
            // Position du thumb exactement sur la track (même rayon que le path SVG)
            const thumbX = centerX + radius * Math.cos(radians) - this.config.thumbSize / 2;
            const thumbY = centerY + radius * Math.sin(radians) - this.config.thumbSize / 2;
            
            // Mettre à jour la position du thumb de manière fluide
            if (this.elements.thumb && this.elements.thumb.html_object) {
                // Utilisation directe du style pour s'assurer que les changements sont appliqués
                this.elements.thumb.html_object.style.left = thumbX + 'px';
                this.elements.thumb.html_object.style.top = thumbY + 'px';
                
                // S'assurer que le thumb est visible
                this.elements.thumb.html_object.style.display = 'block';
                this.elements.thumb.html_object.style.position = 'absolute';
                this.elements.thumb.html_object.style.zIndex = '20';
                
                // Fallback avec les méthodes A
                try {
                    this.elements.thumb.x(thumbX);
                    this.elements.thumb.y(thumbY);
                } catch(e) {
                    console.warn('Fallback pour position thumb:', e);
                }
            }
            
            // Mettre à jour l'arc de progression
            this._updateCircularProgress(percentage);
            
            // Appliquer la variation de couleur circulaire
            this._updateCircularVariationColors(percentage);
        }

        _updateCircularProgress(percentage) {
            if (!this.elements.progress || !this.elements.progress.html_object) return;
            
            const { radius, strokeWidth, startAngle, endAngle } = this.config.circular;
            // SIMPLIFICATION: utiliser le centre du SVG directement
            const centerX = radius + strokeWidth / 2 + 10;
            const centerY = radius + strokeWidth / 2 + 10;
            
            const angleRange = endAngle - startAngle;
            const progressAngle = startAngle + (percentage * angleRange);
            
            const startRadians = (startAngle - 90) * Math.PI / 180;
            const endRadians = (progressAngle - 90) * Math.PI / 180;
            
            const startX = centerX + radius * Math.cos(startRadians);
            const startY = centerY + radius * Math.sin(startRadians);
            const endX = centerX + radius * Math.cos(endRadians);
            const endY = centerY + radius * Math.sin(endRadians);
            
            // Calculer si on a besoin d'un grand arc
            const progressAngleRange = Math.abs(progressAngle - startAngle);
            const largeArcFlag = progressAngleRange > 180 ? 1 : 0;
            
            let pathData;
            if (percentage <= 0.001) {
                // Pas de progression visible - utiliser un point
                pathData = `M ${startX} ${startY} L ${startX} ${startY}`;
            } else {
                pathData = `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
            }
            
            this.elements.progress.html_object.setAttribute('d', pathData);
        }

        _updateCircularVariationColors(percentage) {
            if (!this.config.variation || !Array.isArray(this.config.variation)) {
                return;
            }

            const colors = this.config.variation;
            if (colors.length === 0) return;

            // Si on a qu'une couleur, l'utiliser
            if (colors.length === 1) {
                if (this.elements.progress && this.elements.progress.html_object) {
                    this.elements.progress.html_object.setAttribute('stroke', colors[0].color);
                }
                if (this.elements.thumb && this.elements.thumb.html_object) {
                    this.elements.thumb.html_object.style.backgroundColor = colors[0].color;
                }
                return;
            }

            // Trouver les deux couleurs entre lesquelles interpoler
            let color1 = colors[0];
            let color2 = colors[colors.length - 1];
            
            for (let i = 0; i < colors.length - 1; i++) {
                const pos1 = this._parsePosition(colors[i].position) / 100;
                const pos2 = this._parsePosition(colors[i + 1].position) / 100;
                
                if (percentage >= pos1 && percentage <= pos2) {
                    color1 = colors[i];
                    color2 = colors[i + 1];
                    break;
                }
            }

            // Calculer le facteur d'interpolation entre les deux couleurs
            const pos1 = this._parsePosition(color1.position) / 100;
            const pos2 = this._parsePosition(color2.position) / 100;
            const factor = pos1 === pos2 ? 0 : (percentage - pos1) / (pos2 - pos1);

            // Interpoler entre les deux couleurs
            const interpolatedColor = this._interpolateColors(color1.color, color2.color, factor);
            
            // Appliquer aux éléments circulaires
            if (this.elements.progress && this.elements.progress.html_object) {
                this.elements.progress.html_object.setAttribute('stroke', interpolatedColor);
            }
            
            if (this.elements.thumb && this.elements.thumb.html_object) {
                this.elements.thumb.html_object.style.backgroundColor = interpolatedColor;
                // Ajouter une ombre avec la même couleur
                const shadowColor = this._addAlphaToColor(interpolatedColor, 0.4);
                this.elements.thumb.html_object.style.boxShadow = `0 4px 12px ${shadowColor}`;
            }
        }
    }

    // Export pour utilisation globale
    window.Slider = Slider;

    /**
     * 🔲 Matrix Component - Squirrel Framework
     * 
     * Component for creating responsive grid matrices with interactive cells.
     * Each cell has a unique ID based on its position and supports various
     * interaction callbacks including clicks, double-clicks, long-clicks, and mouse events.
     * 
     * @version 1.0.0
     * @author Squirrel Framework Team
     */

    class Matrix {
        static matrices = new Map(); // Registry of all matrices
        static resizeObserver = null; // Global resize observer

        constructor(config = {}) {
            // Default configuration
            this.config = {
                id: config.id || `matrix_${Date.now()}`,
                attach: config.attach || 'body',
                
                // Grid dimensions
                grid: {
                    x: config.grid?.x || 3,
                    y: config.grid?.y || 3
                },
                
                // Position
                position: {
                    x: config.position?.x || 0,
                    y: config.position?.y || 0
                },
                
                // Size
                size: {
                    width: config.size?.width || '300px',
                    height: config.size?.height || '300px'
                },
                
                // Enhanced spacing configuration
                spacing: {
                    horizontal: config.spacing?.horizontal || 2,
                    vertical: config.spacing?.vertical || 2,
                    mode: config.spacing?.mode || 'gap', // 'gap', 'margin', 'padding', 'border'
                    uniform: config.spacing?.uniform !== false, // Espacement uniforme par défaut
                    outer: config.spacing?.outer || 0, // Espacement externe (padding du container)
                    // Enhanced features
                    animate: config.spacing?.animate !== false, // Smooth transitions when spacing changes
                    adaptiveMin: config.spacing?.adaptiveMin || 0, // Minimum spacing that adapts to content
                    responsive: config.spacing?.responsive || false, // Auto-adjust spacing based on viewport
                    debugMode: config.spacing?.debugMode || false, // Visual debugging indicators
                    // NEW: Advanced gradient spacing
                    gradient: config.spacing?.gradient || false, // Enable gradient spacing (variable spacing across matrix)
                    gradientDirection: config.spacing?.gradientDirection || 'horizontal', // 'horizontal', 'vertical', 'radial'
                    gradientIntensity: config.spacing?.gradientIntensity || 0.5, // 0.1 to 1.0
                    // NEW: Custom animation settings
                    animationEasing: config.spacing?.animationEasing || 'ease', // CSS easing or custom cubic-bezier
                    animationDuration: config.spacing?.animationDuration || 300, // milliseconds
                    animationDelay: config.spacing?.animationDelay || 0, // milliseconds between cell animations
                    // NEW: Accessibility and performance
                    reduceMotion: config.spacing?.reduceMotion !== false, // Respect prefers-reduced-motion
                    optimizeRendering: config.spacing?.optimizeRendering !== false, // Use will-change and transform optimization
                    semanticLabels: config.spacing?.semanticLabels || false // Add ARIA labels for spacing changes
                },
                
                // Cell styling
                cellStyle: {
                    backgroundColor: '#3498db',
                    border: '2px solid #2980b9',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    color: 'white',
                    fontWeight: 'bold',
                    ...config.cellStyle
                },
                
                // Hover style
                cellHoverStyle: {
                    backgroundColor: '#2980b9',
                    transform: 'scale(1.05)',
                    ...config.cellHoverStyle
                },
                
                // Selected style
                cellSelectedStyle: {
                    backgroundColor: '#e74c3c',
                    border: '3px solid #c0392b',
                    ...config.cellSelectedStyle
                },
                
                // Long click duration (ms)
                longClickDuration: config.longClickDuration || 600,
                
                // Callbacks
                callbacks: {
                    onClick: config.callbacks?.onClick || (() => {}),
                    onDoubleClick: config.callbacks?.onDoubleClick || (() => {}),
                    onLongClick: config.callbacks?.onLongClick || (() => {}),
                    onMouseUp: config.callbacks?.onMouseUp || (() => {}),
                    onMouseDown: config.callbacks?.onMouseDown || (() => {}),
                    onHover: config.callbacks?.onHover || (() => {}),
                    onResize: config.callbacks?.onResize || (() => {})
                }
            };

            this.id = this.config.id;
            this.cells = new Map(); // Store cell elements and data
            this.selectedCells = new Set(); // Track selected cells
            this.isPercentageSize = this._isPercentageSize();
            
            this._createMatrix();
            this._setupEventHandlers();
            this._setupResizeObserver();
            
            // Register matrix
            Matrix.matrices.set(this.id, this);
            
            console.log(`🔲 Matrix created: ${this.id} (${this.config.grid.x}x${this.config.grid.y})`);
        }

        _isPercentageSize() {
            return (
                (typeof this.config.size.width === 'string' && this.config.size.width.includes('%')) ||
                (typeof this.config.size.height === 'string' && this.config.size.height.includes('%'))
            );
        }

        _createMatrix() {
            // Get container
            const container = typeof this.config.attach === 'string' 
                ? document.querySelector(this.config.attach)
                : this.config.attach;

            if (!container) {
                throw new Error(`Container not found: ${this.config.attach}`);
            }

            // Create main matrix element
            this.element = document.createElement('div');
            this.element.className = 'squirrel-matrix';
            this.element.id = this.id;
            
            // Apply styling with improved spacing
            const matrixStyle = {
                position: 'absolute',
                left: `${this.config.position.x}px`,
                top: `${this.config.position.y}px`,
                width: this.config.size.width,
                height: this.config.size.height,
                display: 'grid',
                gridTemplateColumns: `repeat(${this.config.grid.x}, 1fr)`,
                gridTemplateRows: `repeat(${this.config.grid.y}, 1fr)`,
                boxSizing: 'border-box',
                userSelect: 'none'
            };

            // Apply spacing based on mode
            this._applySpacingMethod(matrixStyle);
            
            Object.assign(this.element.style, matrixStyle);

            // Create cells
            this._createCells();

            container.appendChild(this.element);
        }

        _applySpacingMethod(matrixStyle) {
            const spacing = this.config.spacing;
            
            // Apply responsive spacing if enabled
            const effectiveSpacing = this._calculateResponsiveSpacing(spacing);
            
            // NEW: Check for reduced motion preference
            const shouldAnimate = spacing.animate && spacing.reduceMotion && 
                !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            
            // Enhanced animation support with custom easing and duration
            if (shouldAnimate) {
                const easingFunction = this._getEasingFunction(spacing.animationEasing);
                matrixStyle.transition = `gap ${spacing.animationDuration}ms ${easingFunction}, padding ${spacing.animationDuration}ms ${easingFunction}`;
                
                // NEW: Performance optimization hint
                if (spacing.optimizeRendering) {
                    matrixStyle.willChange = 'gap, padding';
                }
            }
            
            // Add debug mode visual indicators
            if (spacing.debugMode) {
                matrixStyle.outline = '2px dashed #ff6b6b';
                matrixStyle.outlineOffset = '2px';
            }
            
            // NEW: Apply gradient spacing if enabled
            if (spacing.gradient) {
                this._applyGradientSpacing(matrixStyle, effectiveSpacing);
            } else {
                this._applyUniformSpacing(matrixStyle, effectiveSpacing);
            }
            
            // NEW: Add semantic labeling for accessibility
            if (spacing.semanticLabels) {
                this.element.setAttribute('aria-label', 
                    `Matrix with ${spacing.mode} spacing: ${effectiveSpacing.horizontal}px horizontal, ${effectiveSpacing.vertical}px vertical`);
            }
        }

        _getEasingFunction(easing) {
            const easingPresets = {
                'ease': 'ease',
                'ease-in': 'ease-in',
                'ease-out': 'ease-out',
                'ease-in-out': 'ease-in-out',
                'linear': 'linear',
                'bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                'elastic': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                'smooth': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                'sharp': 'cubic-bezier(0.4, 0.0, 0.6, 1)',
                'gentle': 'cubic-bezier(0.25, 0.1, 0.25, 1)'
            };
            
            return easingPresets[easing] || easing; // Allow custom cubic-bezier values
        }

        _applyGradientSpacing(matrixStyle, effectiveSpacing) {
            const spacing = this.config.spacing;
            const { gradientDirection, gradientIntensity } = spacing;
            
            // Store gradient info for cell spacing calculation
            this.gradientInfo = {
                direction: gradientDirection,
                intensity: gradientIntensity,
                baseSpacing: effectiveSpacing
            };
            
            // For gradient spacing, we use margin mode to achieve variable spacing
            matrixStyle.gap = '0';
            matrixStyle.padding = `${spacing.outer}px`;
            this.spacingMode = 'gradient';
            this.effectiveSpacing = effectiveSpacing;
        }

        _applyUniformSpacing(matrixStyle, effectiveSpacing) {
            const spacing = this.config.spacing;
            
            switch (spacing.mode) {
                case 'gap':
                    // Mode CSS Grid gap (par défaut)
                    if (spacing.uniform) {
                        // Espacement uniforme forcé
                        const avgSpacing = (effectiveSpacing.horizontal + effectiveSpacing.vertical) / 2;
                        matrixStyle.gap = `${Math.max(avgSpacing, spacing.adaptiveMin)}px`;
                    } else {
                        matrixStyle.gap = `${Math.max(effectiveSpacing.vertical, spacing.adaptiveMin)}px ${Math.max(effectiveSpacing.horizontal, spacing.adaptiveMin)}px`;
                    }
                    matrixStyle.padding = `${spacing.outer}px`;
                    break;
                    
                case 'margin':
                    // Mode margin sur les cellules
                    matrixStyle.gap = '0';
                    matrixStyle.padding = `${spacing.outer}px`;
                    this.spacingMode = 'margin';
                    this.effectiveSpacing = effectiveSpacing;
                    break;
                    
                case 'padding':
                    // Mode padding sur les cellules
                    matrixStyle.gap = '0';
                    matrixStyle.padding = `${spacing.outer}px`;
                    this.spacingMode = 'padding';
                    this.effectiveSpacing = effectiveSpacing;
                    break;
                    
                case 'border':
                    // Mode border transparent sur les cellules
                    matrixStyle.gap = '0';
                    matrixStyle.padding = `${spacing.outer}px`;
                    this.spacingMode = 'border';
                    this.effectiveSpacing = effectiveSpacing;
                    break;
                    
                default:
                    // Fallback to gap
                    matrixStyle.gap = `${Math.max(effectiveSpacing.vertical, spacing.adaptiveMin)}px ${Math.max(effectiveSpacing.horizontal, spacing.adaptiveMin)}px`;
                    matrixStyle.padding = `${spacing.outer}px`;
            }
        }

        _calculateResponsiveSpacing(spacing) {
            if (!spacing.responsive) {
                return {
                    horizontal: spacing.horizontal,
                    vertical: spacing.vertical
                };
            }
            
            // Responsive logic based on viewport and matrix size
            const viewportWidth = window.innerWidth;
            const matrixRect = this.element?.getBoundingClientRect();
            const matrixWidth = matrixRect?.width || 300;
            
            // Scale factor based on matrix size relative to viewport
            const scaleFactor = Math.min(1.5, Math.max(0.5, matrixWidth / (viewportWidth * 0.3)));
            
            return {
                horizontal: Math.round(spacing.horizontal * scaleFactor),
                vertical: Math.round(spacing.vertical * scaleFactor)
            };
        }

        _createCells() {
            for (let y = 1; y <= this.config.grid.y; y++) {
                for (let x = 1; x <= this.config.grid.x; x++) {
                    this._createCell(x, y);
                }
            }
        }

        _createCell(x, y) {
            const cellId = `${this.id}_${x}_${y}`;
            
            const cell = document.createElement('div');
            cell.className = 'matrix-cell';
            cell.id = cellId;
            cell.dataset.x = x;
            cell.dataset.y = y;
            cell.dataset.matrixId = this.id;
            
            // Apply cell styling
            Object.assign(cell.style, this.config.cellStyle);
            
            // Apply spacing according to spacing mode
            this._applyCellSpacing(cell, x, y);
            
            // Add cell content (optional - shows coordinates)
            cell.textContent = `${x},${y}`;
            
            // Store cell data
            const cellData = {
                id: cellId,
                x: x,
                y: y,
                element: cell,
                selected: false,
                originalStyle: {...this.config.cellStyle}
            };
            
            this.cells.set(cellId, cellData);
            
            // Setup cell event handlers
            this._setupCellEventHandlers(cell, cellData);
            
            this.element.appendChild(cell);
            return cell;
        }

        _applyCellSpacing(cell, x, y) {
            const spacing = this.config.spacing;
            const effectiveSpacing = this.effectiveSpacing || { horizontal: spacing.horizontal, vertical: spacing.vertical };
            
            // NEW: Check for reduced motion preference for cell animations
            const shouldAnimate = spacing.animate && spacing.reduceMotion && 
                !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            
            // Enhanced animation support for cell spacing changes with staggered delays
            if (shouldAnimate) {
                const easingFunction = this._getEasingFunction(spacing.animationEasing);
                const cellDelay = spacing.animationDelay * ((x - 1) + (y - 1) * this.config.grid.x);
                const duration = spacing.animationDuration;
                
                cell.style.transition = `margin ${duration}ms ${easingFunction} ${cellDelay}ms, padding ${duration}ms ${easingFunction} ${cellDelay}ms, border ${duration}ms ${easingFunction} ${cellDelay}ms`;
                
                // Performance optimization
                if (spacing.optimizeRendering) {
                    cell.style.willChange = 'margin, padding, border';
                    // Clean up will-change after animation
                    setTimeout(() => {
                        cell.style.willChange = 'auto';
                    }, duration + cellDelay + 100);
                }
            }
            
            // Add debug mode visual indicators for cells
            if (spacing.debugMode) {
                cell.style.boxShadow = 'inset 0 0 0 1px rgba(255, 107, 107, 0.5)';
            }
            
            // NEW: Apply gradient spacing if enabled
            if (this.spacingMode === 'gradient') {
                this._applyGradientCellSpacing(cell, x, y, effectiveSpacing);
            } else {
                this._applyStandardCellSpacing(cell, x, y, effectiveSpacing);
            }
            
            // NEW: Add semantic cell labeling
            if (spacing.semanticLabels) {
                cell.setAttribute('aria-label', `Cell at position ${x}, ${y} with ${this.spacingMode} spacing`);
            }
        }

        _applyGradientCellSpacing(cell, x, y, baseSpacing) {
            const { direction, intensity } = this.gradientInfo;
            const spacing = this.config.spacing;
            const gridX = this.config.grid.x;
            const gridY = this.config.grid.y;
            
            let spacingMultiplier = 1;
            
            switch (direction) {
                case 'horizontal':
                    // Spacing increases from left to right
                    spacingMultiplier = 1 + (intensity * (x - 1) / (gridX - 1));
                    break;
                case 'vertical':
                    // Spacing increases from top to bottom
                    spacingMultiplier = 1 + (intensity * (y - 1) / (gridY - 1));
                    break;
                case 'radial':
                    // Spacing increases from center outward
                    const centerX = (gridX + 1) / 2;
                    const centerY = (gridY + 1) / 2;
                    const maxDistance = Math.sqrt(Math.pow(centerX, 2) + Math.pow(centerY, 2));
                    const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                    spacingMultiplier = 1 + (intensity * distance / maxDistance);
                    break;
                case 'inverse-radial':
                    // Spacing decreases from center outward
                    const centerX2 = (gridX + 1) / 2;
                    const centerY2 = (gridY + 1) / 2;
                    const maxDistance2 = Math.sqrt(Math.pow(centerX2, 2) + Math.pow(centerY2, 2));
                    const distance2 = Math.sqrt(Math.pow(x - centerX2, 2) + Math.pow(y - centerY2, 2));
                    spacingMultiplier = 1 + (intensity * (1 - distance2 / maxDistance2));
                    break;
            }
            
            // Apply gradient-adjusted margin spacing
            const adjustedHorizontal = baseSpacing.horizontal * spacingMultiplier;
            const adjustedVertical = baseSpacing.vertical * spacingMultiplier;
            
            const marginTop = y === 1 ? 0 : Math.max(adjustedVertical / 2, spacing.adaptiveMin / 2);
            const marginBottom = y === gridY ? 0 : Math.max(adjustedVertical / 2, spacing.adaptiveMin / 2);
            const marginLeft = x === 1 ? 0 : Math.max(adjustedHorizontal / 2, spacing.adaptiveMin / 2);
            const marginRight = x === gridX ? 0 : Math.max(adjustedHorizontal / 2, spacing.adaptiveMin / 2);
            
            cell.style.margin = `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`;
        }

        _applyStandardCellSpacing(cell, x, y, effectiveSpacing) {
            const spacing = this.config.spacing;
            
            if (this.spacingMode === 'margin') {
                // Calcul des marges pour éviter les doublements avec adaptive minimum
                const marginTop = y === 1 ? 0 : Math.max(effectiveSpacing.vertical / 2, spacing.adaptiveMin / 2);
                const marginBottom = y === this.config.grid.y ? 0 : Math.max(effectiveSpacing.vertical / 2, spacing.adaptiveMin / 2);
                const marginLeft = x === 1 ? 0 : Math.max(effectiveSpacing.horizontal / 2, spacing.adaptiveMin / 2);
                const marginRight = x === this.config.grid.x ? 0 : Math.max(effectiveSpacing.horizontal / 2, spacing.adaptiveMin / 2);
                
                cell.style.margin = `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`;
                
            } else if (this.spacingMode === 'padding') {
                // Padding uniforme sur chaque cellule avec adaptive minimum
                const paddingH = Math.max(effectiveSpacing.horizontal / 2, spacing.adaptiveMin / 2);
                const paddingV = Math.max(effectiveSpacing.vertical / 2, spacing.adaptiveMin / 2);
                cell.style.padding = `${paddingV}px ${paddingH}px`;
                
            } else if (this.spacingMode === 'border') {
                // Border transparent pour créer l'espacement avec adaptive minimum
                const borderWidth = Math.max(
                    Math.max(effectiveSpacing.horizontal, effectiveSpacing.vertical) / 2,
                    spacing.adaptiveMin / 2
                );
                cell.style.border = `${borderWidth}px solid transparent`;
                cell.style.backgroundClip = 'padding-box';
            }
        }

        _setupCellEventHandlers(cell, cellData) {
            let clickTimer = null;
            let longClickTimer = null;
            let isLongClick = false;
            let clickCount = 0;

            // Mouse down
            cell.addEventListener('mousedown', (e) => {
                isLongClick = false;
                
                // Start long click timer
                longClickTimer = setTimeout(() => {
                    isLongClick = true;
                    this.config.callbacks.onLongClick(
                        cellData.id, 
                        cellData.x, 
                        cellData.y, 
                        cellData, 
                        e
                    );
                }, this.config.longClickDuration);
                
                // Call mousedown callback
                this.config.callbacks.onMouseDown(
                    cellData.id, 
                    cellData.x, 
                    cellData.y, 
                    cellData, 
                    e
                );
            });

            // Mouse up
            cell.addEventListener('mouseup', (e) => {
                // Clear long click timer
                if (longClickTimer) {
                    clearTimeout(longClickTimer);
                    longClickTimer = null;
                }
                
                // Call mouseup callback
                this.config.callbacks.onMouseUp(
                    cellData.id, 
                    cellData.x, 
                    cellData.y, 
                    cellData, 
                    e
                );
            });

            // Click handler
            cell.addEventListener('click', (e) => {
                // Don't trigger click if it was a long click
                if (isLongClick) {
                    isLongClick = false;
                    return;
                }
                
                clickCount++;
                
                if (clickCount === 1) {
                    clickTimer = setTimeout(() => {
                        // Single click
                        this.config.callbacks.onClick(
                            cellData.id, 
                            cellData.x, 
                            cellData.y, 
                            cellData, 
                            e
                        );
                        clickCount = 0;
                    }, 300); // Wait for potential double click
                } else if (clickCount === 2) {
                    // Double click
                    clearTimeout(clickTimer);
                    this.config.callbacks.onDoubleClick(
                        cellData.id, 
                        cellData.x, 
                        cellData.y, 
                        cellData, 
                        e
                    );
                    clickCount = 0;
                }
            });

            // Hover effects
            cell.addEventListener('mouseenter', (e) => {
                if (!cellData.selected) {
                    Object.assign(cell.style, this.config.cellHoverStyle);
                }
                
                this.config.callbacks.onHover(
                    cellData.id, 
                    cellData.x, 
                    cellData.y, 
                    cellData, 
                    e
                );
            });

            cell.addEventListener('mouseleave', (e) => {
                if (!cellData.selected) {
                    Object.assign(cell.style, cellData.originalStyle);
                }
            });
        }

        _setupEventHandlers() {
            // Handle mouse leave to clean up timers
            this.element.addEventListener('mouseleave', () => {
                // This could be extended for global matrix events
            });
        }

        _setupResizeObserver() {
            if (!this.isPercentageSize) return;
            
            // Create global resize observer if it doesn't exist
            if (!Matrix.resizeObserver) {
                Matrix.resizeObserver = new ResizeObserver((entries) => {
                    Matrix.matrices.forEach(matrix => {
                        if (matrix.isPercentageSize) {
                            matrix._handleResize();
                        }
                    });
                });
                
                // Observe the document body for window resize
                Matrix.resizeObserver.observe(document.body);
            }
        }

        _handleResize() {
            const rect = this.element.getBoundingClientRect();
            this.config.callbacks.onResize(this, rect.width, rect.height);
        }

        // Public API Methods

        /**
         * Get a cell by its ID
         */
        getCellById(cellId) {
            return this.cells.get(cellId);
        }

        /**
         * Get a cell by coordinates
         */
        getCellByCoordinates(x, y) {
            const cellId = `${this.id}_${x}_${y}`;
            return this.cells.get(cellId);
        }

        /**
         * Select a cell
         */
        selectCell(x, y) {
            const cellData = this.getCellByCoordinates(x, y);
            if (cellData && !cellData.selected) {
                cellData.selected = true;
                this.selectedCells.add(cellData.id);
                Object.assign(cellData.element.style, this.config.cellSelectedStyle);
                console.log(`🔲 Cell selected: ${cellData.id}`);
            }
        }

        /**
         * Deselect a cell
         */
        deselectCell(x, y) {
            const cellData = this.getCellByCoordinates(x, y);
            if (cellData && cellData.selected) {
                cellData.selected = false;
                this.selectedCells.delete(cellData.id);
                Object.assign(cellData.element.style, cellData.originalStyle);
                console.log(`🔲 Cell deselected: ${cellData.id}`);
            }
        }

        /**
         * Select all cells
         */
        selectAll() {
            this.cells.forEach((cellData) => {
                if (!cellData.selected) {
                    cellData.selected = true;
                    this.selectedCells.add(cellData.id);
                    Object.assign(cellData.element.style, this.config.cellSelectedStyle);
                }
            });
            console.log(`🔲 All cells selected in ${this.id}`);
        }

        /**
         * Deselect all cells
         */
        deselectAll() {
            this.cells.forEach((cellData) => {
                if (cellData.selected) {
                    cellData.selected = false;
                    Object.assign(cellData.element.style, cellData.originalStyle);
                }
            });
            this.selectedCells.clear();
            console.log(`🔲 All cells deselected in ${this.id}`);
        }

        /**
         * Set custom style for a specific cell
         */
        setCellStyle(x, y, style) {
            const cellData = this.getCellByCoordinates(x, y);
            if (cellData) {
                Object.assign(cellData.element.style, style);
                // Update original style if not selected
                if (!cellData.selected) {
                    Object.assign(cellData.originalStyle, style);
                }
            }
        }

        /**
         * Reset cell style to default
         */
        resetCellStyle(x, y) {
            const cellData = this.getCellByCoordinates(x, y);
            if (cellData) {
                const defaultStyle = {...this.config.cellStyle};
                Object.assign(cellData.element.style, defaultStyle);
                cellData.originalStyle = defaultStyle;
            }
        }

        /**
         * Get all selected cells
         */
        getSelectedCells() {
            return Array.from(this.selectedCells).map(id => this.cells.get(id));
        }

        /**
         * Get all cells
         */
        getAllCells() {
            return Array.from(this.cells.values());
        }

        /**
         * Resize the matrix
         */
        resize(newSize) {
            if (newSize.width) {
                this.config.size.width = newSize.width;
                this.element.style.width = newSize.width;
            }
            if (newSize.height) {
                this.config.size.height = newSize.height;
                this.element.style.height = newSize.height;
            }
            
            this.isPercentageSize = this._isPercentageSize();
            this._setupResizeObserver();
            
            console.log(`🔲 Matrix ${this.id} resized to ${this.config.size.width} x ${this.config.size.height}`);
        }

        /**
         * Move the matrix to new position
         */
        moveTo(x, y) {
            this.config.position.x = x;
            this.config.position.y = y;
            this.element.style.left = `${x}px`;
            this.element.style.top = `${y}px`;
        }

        /**
         * Change grid dimensions (recreates cells)
         */
        setGridSize(x, y) {
            this.config.grid.x = x;
            this.config.grid.y = y;
            
            // Clear existing cells
            this.cells.clear();
            this.selectedCells.clear();
            this.element.innerHTML = '';
            
            // Update grid template
            this.element.style.gridTemplateColumns = `repeat(${x}, 1fr)`;
            this.element.style.gridTemplateRows = `repeat(${y}, 1fr)`;
            
            // Recreate cells
            this._createCells();
            
            console.log(`🔲 Matrix ${this.id} grid changed to ${x}x${y}`);
        }

        /**
         * Destroy the matrix
         */
        destroy() {
            this.element.remove();
            Matrix.matrices.delete(this.id);
            
            // If this was the last matrix with percentage size, disconnect observer
            const hasPercentageMatrices = Array.from(Matrix.matrices.values())
                .some(matrix => matrix.isPercentageSize);
            
            if (!hasPercentageMatrices && Matrix.resizeObserver) {
                Matrix.resizeObserver.disconnect();
                Matrix.resizeObserver = null;
            }
            
            console.log(`🗑️ Matrix destroyed: ${this.id}`);
        }

        /**
         * Enhanced spacing configuration update with batch processing and performance optimization
         */
        setSpacing(newSpacing, options = {}) {
            const { 
                skipAnimation = false, 
                batchUpdate = true,
                triggerResize = false 
            } = options;
            
            // Store old spacing for comparison
            const oldSpacing = { ...this.config.spacing };
            
            // Update configuration
            Object.assign(this.config.spacing, newSpacing);
            
            // Temporarily disable animations if requested
            const originalAnimate = this.config.spacing.animate;
            if (skipAnimation) {
                this.config.spacing.animate = false;
            }
            
            // Batch DOM updates for better performance
            if (batchUpdate) {
                this._batchSpacingUpdate(oldSpacing);
            } else {
                this._immediateSpacingUpdate();
            }
            
            // Restore original animation setting
            this.config.spacing.animate = originalAnimate;
            
            // Trigger responsive recalculation if needed
            if (triggerResize && this.config.spacing.responsive) {
                this._handleResize();
            }
            
            console.log(`🔲 Enhanced spacing updated for matrix ${this.id}:`, this.config.spacing);
        }

        _batchSpacingUpdate(oldSpacing) {
            // Use requestAnimationFrame for smooth updates
            requestAnimationFrame(() => {
                // Apply container styles
                const matrixStyle = {};
                this._applySpacingMethod(matrixStyle);
                Object.assign(this.element.style, matrixStyle);
                
                // Batch cell updates using DocumentFragment for better performance
                document.createDocumentFragment();
                const cellsToUpdate = [];
                
                this.cells.forEach((cellData) => {
                    cellsToUpdate.push(cellData);
                });
                
                // Process cells in chunks to avoid blocking the main thread
                this._processCellsInChunks(cellsToUpdate, 0);
            });
        }

        _processCellsInChunks(cells, startIndex, chunkSize = 10) {
            const endIndex = Math.min(startIndex + chunkSize, cells.length);
            
            for (let i = startIndex; i < endIndex; i++) {
                const cellData = cells[i];
                this._resetAndApplyCellSpacing(cellData);
            }
            
            if (endIndex < cells.length) {
                // Process next chunk on next frame
                requestAnimationFrame(() => {
                    this._processCellsInChunks(cells, endIndex, chunkSize);
                });
            }
        }

        _resetAndApplyCellSpacing(cellData) {
            // Reset spacing styles
            cellData.element.style.margin = '';
            cellData.element.style.padding = '';
            cellData.element.style.border = '';
            cellData.element.style.backgroundClip = '';
            cellData.element.style.boxShadow = '';
            cellData.element.style.transition = '';
            
            // Reapply base styles
            Object.assign(cellData.element.style, cellData.originalStyle);
            
            // Reapply spacing
            this._applyCellSpacing(cellData.element, cellData.x, cellData.y);
        }

        _immediateSpacingUpdate() {
            // Immediate update without batching (for real-time feedback)
            const matrixStyle = {};
            this._applySpacingMethod(matrixStyle);
            Object.assign(this.element.style, matrixStyle);
            
            this.cells.forEach((cellData) => {
                this._resetAndApplyCellSpacing(cellData);
            });
        }

        /**
         * Apply advanced spacing presets
         */
        applySpacingPreset(presetName, customOverrides = {}) {
            const presets = Matrix.getSpacingPresets();
            const preset = presets[presetName];
            
            if (!preset) {
                console.warn(`🔲 Unknown spacing preset: ${presetName}`);
                return;
            }
            
            // Merge preset with custom overrides
            const spacingConfig = { ...preset, ...customOverrides };
            
            // Apply with optimized batch update
            this.setSpacing(spacingConfig, { batchUpdate: true });
            
            console.log(`🔲 Applied spacing preset "${presetName}" to matrix ${this.id}`);
        }

        /**
         * Validate spacing configuration
         */
        validateSpacing(spacing) {
            const errors = [];
            
            if (spacing.horizontal < 0) errors.push('Horizontal spacing cannot be negative');
            if (spacing.vertical < 0) errors.push('Vertical spacing cannot be negative');
            if (spacing.outer < 0) errors.push('Outer spacing cannot be negative');
            if (spacing.adaptiveMin < 0) errors.push('Adaptive minimum cannot be negative');
            
            if (!['gap', 'margin', 'padding', 'border'].includes(spacing.mode)) {
                errors.push('Invalid spacing mode. Must be: gap, margin, padding, or border');
            }
            
            if (spacing.mode === 'border' && Math.max(spacing.horizontal, spacing.vertical) > 10) {
                errors.push('Border mode is not recommended for spacing > 10px');
            }
            
            return {
                valid: errors.length === 0,
                errors: errors
            };
        }

        /**
         * Get spacing performance metrics with enhanced analysis
         */
        getSpacingMetrics() {
            const cellCount = this.cells.size;
            const spacingMode = this.config.spacing.mode;
            const isResponsive = this.config.spacing.responsive;
            const hasAnimation = this.config.spacing.animate;
            const hasGradient = this.config.spacing.gradient;
            const customEasing = this.config.spacing.animationEasing !== 'ease';
            
            // Calculate performance score (0-100) with enhanced factors
            let performanceScore = 100;
            if (spacingMode !== 'gap') performanceScore -= 20;
            if (isResponsive) performanceScore -= 15;
            if (hasAnimation) performanceScore -= 10;
            if (hasGradient) performanceScore -= 15; // NEW: Gradient impact
            if (customEasing) performanceScore -= 5; // NEW: Custom easing impact
            if (cellCount > 50) performanceScore -= Math.min(30, (cellCount - 50) * 0.5);
            
            // NEW: Bonus points for optimization features
            if (this.config.spacing.optimizeRendering) performanceScore += 5;
            if (this.config.spacing.reduceMotion) performanceScore += 3;
            
            return {
                cellCount,
                spacingMode,
                isResponsive,
                hasAnimation,
                hasGradient,
                customEasing,
                optimizeRendering: this.config.spacing.optimizeRendering,
                reduceMotion: this.config.spacing.reduceMotion,
                performanceScore: Math.max(0, Math.min(100, performanceScore)),
                recommendations: this._getPerformanceRecommendations(performanceScore),
                memoryUsage: this._estimateMemoryUsage(),
                renderingComplexity: this._calculateRenderingComplexity()
            };
        }

        _getPerformanceRecommendations(score) {
            const recommendations = [];
            const spacing = this.config.spacing;
            
            if (score < 70) {
                recommendations.push('Consider using "gap" mode for better performance');
            }
            if (spacing.responsive && this.cells.size > 30) {
                recommendations.push('Disable responsive spacing for large grids');
            }
            if (spacing.animate && this.cells.size > 50) {
                recommendations.push('Disable animations for large cell counts');
            }
            if (spacing.gradient && this.cells.size > 25) {
                recommendations.push('Gradient spacing adds complexity - consider uniform spacing');
            }
            if (!spacing.optimizeRendering && (spacing.animate || spacing.gradient)) {
                recommendations.push('Enable rendering optimization for better performance');
            }
            if (spacing.animationDelay > 0 && this.cells.size > 20) {
                recommendations.push('Reduce animation delay for large matrices');
            }
            
            return recommendations;
        }

        _estimateMemoryUsage() {
            const baseUsage = this.cells.size * 0.5; // KB per cell
            let additionalUsage = 0;
            
            if (this.config.spacing.animate) additionalUsage += this.cells.size * 0.2;
            if (this.config.spacing.gradient) additionalUsage += this.cells.size * 0.3;
            if (this.config.spacing.responsive) additionalUsage += 0.5;
            
            return Math.round((baseUsage + additionalUsage) * 100) / 100; // KB
        }

        _calculateRenderingComplexity() {
            let complexity = 1;
            
            if (this.config.spacing.mode !== 'gap') complexity += 0.5;
            if (this.config.spacing.animate) complexity += 0.3;
            if (this.config.spacing.gradient) complexity += 0.7;
            if (this.config.spacing.responsive) complexity += 0.4;
            if (this.config.spacing.debugMode) complexity += 0.2;
            
            return Math.round(complexity * 100) / 100;
        }

        /**
         * NEW: Advanced spacing analysis and optimization suggestions
         */
        analyzeSpacingPerformance() {
            const metrics = this.getSpacingMetrics();
            const analysis = {
                ...metrics,
                bottlenecks: [],
                optimizations: [],
                timestamp: Date.now()
            };
            
            // Identify performance bottlenecks
            if (metrics.cellCount > 100) {
                analysis.bottlenecks.push('Large cell count may impact performance');
            }
            if (metrics.hasGradient && metrics.hasAnimation) {
                analysis.bottlenecks.push('Gradient + animation combination is computationally expensive');
            }
            if (this.config.spacing.animationDelay > 0 && metrics.cellCount > 30) {
                analysis.bottlenecks.push('Staggered animations with many cells cause long animation sequences');
            }
            
            // Suggest specific optimizations
            if (!this.config.spacing.optimizeRendering && (metrics.hasAnimation || metrics.hasGradient)) {
                analysis.optimizations.push('Enable optimizeRendering for GPU acceleration');
            }
            if (metrics.customEasing && metrics.cellCount > 50) {
                analysis.optimizations.push('Use simpler easing functions for better performance');
            }
            if (metrics.isResponsive && window.innerWidth < 768) {
                analysis.optimizations.push('Consider disabling responsive spacing on mobile devices');
            }
            
            return analysis;
        }

        /**
         * NEW: Auto-optimize spacing configuration based on current conditions
         */
        autoOptimizeSpacing() {
            const analysis = this.analyzeSpacingPerformance();
            const optimizations = [];
            
            // Apply automatic optimizations
            if (analysis.performanceScore < 60) {
                if (this.config.spacing.mode !== 'gap' && this.cells.size < 30) {
                    this.setSpacing({ mode: 'gap' });
                    optimizations.push('Switched to gap mode for better performance');
                }
                
                if (this.config.spacing.animate && this.cells.size > 50) {
                    this.setSpacing({ animate: false });
                    optimizations.push('Disabled animations for large matrix');
                }
                
                if (this.config.spacing.gradient && this.cells.size > 40) {
                    this.setSpacing({ gradient: false });
                    optimizations.push('Disabled gradient spacing for large matrix');
                }
            }
            
            // Enable performance optimizations
            if (!this.config.spacing.optimizeRendering) {
                this.setSpacing({ optimizeRendering: true });
                optimizations.push('Enabled rendering optimization');
            }
            
            console.log(`🚀 Auto-optimization applied to ${this.id}:`, optimizations);
            return {
                optimizationsApplied: optimizations,
                newScore: this.getSpacingMetrics().performanceScore
            };
        }
    }

    /**
     * 🎵 WaveSurfer Component - Squirrel Framework
     * 
     * Component for creating interactive audio waveform visualizations
     * with playback controls, regions, and audio analysis features.
     * Compatible with WaveSurfer.js v7.x for complete offline functionality.
     * 
     * @version 3.0.0 - Offline Compatible (v7)
     * @author Squirrel Framework Team
     */

    // Global variables for WaveSurfer library and plugin loader
    let WaveSurferLib = null;
    let PluginLoader = null;

    // Load WaveSurfer.js library and plugin loader
    async function loadWaveSurfer() {
        if (WaveSurferLib) return WaveSurferLib;
        
        try {
            // Load WaveSurfer v7 ES module
            const WaveSurferModule = await Promise.resolve().then(function () { return wavesurfer_esm; });
            WaveSurferLib = WaveSurferModule.default;
            
            // Load plugin loader for v7
            try {
                const LoaderModule = await Promise.resolve().then(function () { return wavesurferV7Loader; });
                PluginLoader = LoaderModule.default || LoaderModule.WaveSurferV7Loader;
                if (PluginLoader && typeof PluginLoader === 'function') {
                    PluginLoader = new PluginLoader();
                }
            } catch (loaderError) {
                console.warn('⚠️ Plugin loader not available, using basic WaveSurfer:', loaderError);
                PluginLoader = null;
            }
            
            console.log('🎵 WaveSurfer.js v7.9.5 loaded successfully (ES modules)');
            return WaveSurferLib;
            
        } catch (error) {
            console.error('❌ Failed to load WaveSurfer.js v7:', error);
            throw new Error('WaveSurfer.js v7 could not be loaded. Ensure wavesurfer files are available in ./js/wavesurfer-v7/ directory');
        }
    }

    /**
     * 🎵 WaveSurfer Component Class
     * 
     * Creates interactive audio waveform visualizations with full plugin support
     */
    class WaveSurfer extends EventTarget {
        static instances = new Map(); // Registry of all WaveSurfer instances
        
        constructor(config = {}) {
            super();
            
            // Generate unique ID
            this.id = config.id || `wavesurfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Default configuration
            this.config = {
                // Container and positioning
                attach: config.attach || 'body',
                x: config.x || 100,
                y: config.y || 100,
                width: config.width || 800,
                height: config.height || 120,
                
                // Audio source
                url: config.url || null,
                peaks: config.peaks || null,
                
                // Visual styling
                waveColor: config.waveColor || '#4A90E2',
                progressColor: config.progressColor || '#2ECC71',
                cursorColor: config.cursorColor || '#E74C3C',
                barWidth: config.barWidth || 2,
                barRadius: config.barRadius || 1,
                responsive: config.responsive !== false,
                interact: config.interact !== false,
                dragToSeek: config.dragToSeek !== false,
                hideScrollbar: config.hideScrollbar !== false,
                normalize: config.normalize !== false,
                backend: config.backend || 'WebAudio',
                mediaControls: config.mediaControls || false,
                
                // Visual styling
                style: {
                    backgroundColor: '#FFFFFF',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    overflow: 'hidden',
                    ...config.style
                },
                
                // Control buttons
                controls: {
                    enabled: config.controls?.enabled !== false,
                    play: config.controls?.play !== false,
                    pause: config.controls?.pause !== false,
                    stop: config.controls?.stop !== false,
                    mute: config.controls?.mute !== false,
                    volume: config.controls?.volume !== false,
                    download: config.controls?.download || false,
                    ...config.controls
                },
                
                // Regions support
                regions: {
                    enabled: config.regions?.enabled || false,
                    dragSelection: config.regions?.dragSelection !== false,
                    snapToGridPercentage: config.regions?.snapToGridPercentage || null,
                    ...config.regions
                },
                
                // Plugins configuration
                plugins: config.plugins || [],
                enabledPlugins: config.enabledPlugins || ['regions'], // Default plugins to load
                autoLoadPlugins: config.autoLoadPlugins !== false, // Auto-load recommended plugins
                
                // Plugin-specific configurations
                timeline: {
                    enabled: config.timeline?.enabled || false,
                    height: config.timeline?.height || 20,
                    ...config.timeline
                },
                
                minimap: {
                    enabled: config.minimap?.enabled || false,
                    height: config.minimap?.height || 50,
                    ...config.minimap
                },
                
                zoom: {
                    enabled: config.zoom?.enabled || false,
                    scale: config.zoom?.scale || 1,
                    ...config.zoom
                },
                
                hover: {
                    enabled: config.hover?.enabled || false,
                    formatTimeCallback: config.hover?.formatTimeCallback || null,
                    ...config.hover
                },
                
                spectrogram: {
                    enabled: config.spectrogram?.enabled || false,
                    height: config.spectrogram?.height || 200,
                    ...config.spectrogram
                },
                
                record: {
                    enabled: config.record?.enabled || false,
                    ...config.record
                },
                
                envelope: {
                    enabled: config.envelope?.enabled || false,
                    ...config.envelope
                },
                
                // Callbacks
                callbacks: {
                    onReady: config.callbacks?.onReady || (() => {}),
                    onPlay: config.callbacks?.onPlay || (() => {}),
                    onPause: config.callbacks?.onPause || (() => {}),
                    onFinish: config.callbacks?.onFinish || (() => {}),
                    onSeek: config.callbacks?.onSeek || (() => {}),
                    onTimeUpdate: config.callbacks?.onTimeUpdate || (() => {}),
                    onRegionCreate: config.callbacks?.onRegionCreate || (() => {}),
                    onRegionUpdate: config.callbacks?.onRegionUpdate || (() => {}),
                    onRegionRemove: config.callbacks?.onRegionRemove || (() => {}),
                    onError: config.callbacks?.onError || ((error) => console.error('WaveSurfer error:', error)),
                    ...config.callbacks
                }
            };
            
            // Internal state
            this.wavesurfer = null;
            this.isReady = false;
            this.isPlaying = false;
            this.currentTime = 0;
            this.regions = new Map();
            this.plugins = new Map();
            
            // Initialize
            this._init();
            
            // Register instance
            WaveSurfer.instances.set(this.id, this);
        }
        
        async _init() {
            try {
                // Load WaveSurfer.js library
                await loadWaveSurfer();
                
                // Create container
                this._createContainer();
                
                // Initialize WaveSurfer
                await this._initWaveSurfer();
                
                // Setup controls if enabled
                if (this.config.controls.enabled) {
                    this._createControls();
                }
                
                // Setup event handlers
                this._setupEventHandlers();
                
                // Load audio if URL provided
                if (this.config.url) {
                    await this.loadAudio(this.config.url);
                }
                
            } catch (error) {
                console.error('❌ WaveSurfer initialization failed:', error);
                this.config.callbacks.onError(error);
            }
        }
        
        _createContainer() {
            // Get parent element
            const parent = typeof this.config.attach === 'string' 
                ? document.querySelector(this.config.attach)
                : this.config.attach;
                
            if (!parent) {
                throw new Error(`Container not found: ${this.config.attach}`);
            }
            
            // Create main container
            this.container = document.createElement('div');
            this.container.className = 'squirrel-wavesurfer';
            this.container.id = this.id;
            
            // Apply styling
            Object.assign(this.container.style, {
                position: 'absolute',
                left: `${this.config.x}px`,
                top: `${this.config.y}px`,
                width: `${this.config.width}px`,
                height: `${this.config.height}px`,
                zIndex: '1000',
                ...this.config.style
            });
            
            // Create waveform container
            this.waveformContainer = document.createElement('div');
            this.waveformContainer.className = 'wavesurfer-waveform';
            this.waveformContainer.style.cssText = `
            width: 100%;
            height: ${this.config.controls.enabled ? 'calc(100% - 50px)' : '100%'};
            position: relative;
        `;
            
            this.container.appendChild(this.waveformContainer);
            parent.appendChild(this.container);
        }
        
        async _initWaveSurfer() {
            if (!WaveSurferLib) {
                throw new Error('WaveSurfer.js library not loaded');
            }
            
            // Load plugins automatically if enabled
            if (this.config.autoLoadPlugins && PluginLoader) {
                await this._loadRequiredPlugins();
            }
            
            // Prepare plugins array
            const plugins = [...(this.config.plugins || [])];
            
            // Add enabled plugins
            await this._addEnabledPlugins(plugins);
            
            // Prepare WaveSurfer options
            const options = {
                container: this.waveformContainer,
                waveColor: this.config.waveColor,
                progressColor: this.config.progressColor,
                cursorColor: this.config.cursorColor,
                barWidth: this.config.barWidth,
                barRadius: this.config.barRadius,
                responsive: this.config.responsive,
                interact: this.config.interact,
                dragToSeek: this.config.dragToSeek,
                hideScrollbar: this.config.hideScrollbar,
                normalize: this.config.normalize,
                backend: this.config.backend,
                mediaControls: this.config.mediaControls,
                plugins: plugins
            };
            
            // Initialize WaveSurfer instance
            this.wavesurfer = WaveSurferLib.create(options);
            
            console.log(`🎵 WaveSurfer instance "${this.id}" created`);
            console.log(`🔌 Plugins actifs: ${plugins.length}`);
        }
        
        async _loadRequiredPlugins() {
            // Determine which plugins to load based on configuration
            const pluginsToLoad = new Set();
            
            // Add plugins based on enabled features
            if (this.config.regions.enabled) pluginsToLoad.add('regions');
            if (this.config.timeline.enabled) pluginsToLoad.add('timeline');
            if (this.config.minimap.enabled) pluginsToLoad.add('minimap');
            if (this.config.zoom.enabled) pluginsToLoad.add('zoom');
            if (this.config.hover.enabled) pluginsToLoad.add('hover');
            if (this.config.spectrogram.enabled) pluginsToLoad.add('spectrogram');
            if (this.config.record.enabled) pluginsToLoad.add('record');
            if (this.config.envelope.enabled) pluginsToLoad.add('envelope');
            
            // Add explicitly enabled plugins
            this.config.enabledPlugins.forEach(name => pluginsToLoad.add(name));
            
            // Load all required plugins for v7
            for (const pluginName of pluginsToLoad) {
                try {
                    const pluginModule = await import(`../../js/wavesurfer-v7/plugins/${pluginName}.esm.js`);
                    this.plugins.set(pluginName, pluginModule.default);
                    console.log(`✅ Plugin ${pluginName} loaded for v7`);
                } catch (error) {
                    console.warn(`⚠️ Failed to load plugin ${pluginName}:`, error);
                }
            }
        }
        
        async _addEnabledPlugins(plugins) {
            // Add regions plugin
            if (this.config.regions.enabled && this.plugins.has('regions')) {
                const RegionsPlugin = this.plugins.get('regions');
                if (RegionsPlugin) {
                    plugins.push(RegionsPlugin.create({
                        dragSelection: this.config.regions.dragSelection
                    }));
                    console.log('🎯 Regions plugin ajouté (v7)');
                }
            }
            
            // Add timeline plugin
            if (this.config.timeline.enabled && this.plugins.has('timeline')) {
                const TimelinePlugin = this.plugins.get('timeline');
                if (TimelinePlugin) {
                    plugins.push(TimelinePlugin.create({
                        height: this.config.timeline.height
                    }));
                    console.log('⏰ Timeline plugin ajouté (v7)');
                }
            }
            
            // Add minimap plugin
            if (this.config.minimap.enabled && this.plugins.has('minimap')) {
                const MinimapPlugin = this.plugins.get('minimap');
                if (MinimapPlugin) {
                    plugins.push(MinimapPlugin.create({
                        height: this.config.minimap.height
                    }));
                    console.log('🗺️ Minimap plugin ajouté (v7)');
                }
            }
            
            // Add zoom plugin
            if (this.config.zoom.enabled && this.plugins.has('zoom')) {
                const ZoomPlugin = this.plugins.get('zoom');
                if (ZoomPlugin) {
                    plugins.push(ZoomPlugin.create({
                        scale: this.config.zoom.scale
                    }));
                    console.log('🔍 Zoom plugin ajouté (v7)');
                }
            }
            
            // Add hover plugin
            if (this.config.hover.enabled && this.plugins.has('hover')) {
                const HoverPlugin = this.plugins.get('hover');
                if (HoverPlugin) {
                    plugins.push(HoverPlugin.create({
                        formatTimeCallback: this.config.hover.formatTimeCallback
                    }));
                    console.log('👆 Hover plugin ajouté (v7)');
                }
            }
            
            // Add spectrogram plugin
            if (this.config.spectrogram.enabled && this.plugins.has('spectrogram')) {
                const SpectrogramPlugin = this.plugins.get('spectrogram');
                if (SpectrogramPlugin) {
                    plugins.push(SpectrogramPlugin.create({
                        height: this.config.spectrogram.height
                    }));
                    console.log('📊 Spectrogram plugin ajouté (v7)');
                }
            }
            
            // Add record plugin
            if (this.config.record.enabled && this.plugins.has('record')) {
                const RecordPlugin = this.plugins.get('record');
                if (RecordPlugin) {
                    plugins.push(RecordPlugin.create(this.config.record));
                    console.log('🎙️ Record plugin ajouté (v7)');
                }
            }
            
            // Add envelope plugin
            if (this.config.envelope.enabled && this.plugins.has('envelope')) {
                const EnvelopePlugin = this.plugins.get('envelope');
                if (EnvelopePlugin) {
                    plugins.push(EnvelopePlugin.create(this.config.envelope));
                    console.log('📈 Envelope plugin ajouté (v7)');
                }
            }
        }
        
        _createControls() {
            const controls = this.config.controls;
            
            // Create controls container
            this.controlsContainer = document.createElement('div');
            this.controlsContainer.className = 'wavesurfer-controls';
            this.controlsContainer.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-top: 1px solid rgba(255,255,255,0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 0 15px;
            border-radius: 0 0 8px 8px;
        `;
            
            // Play/Pause button
            if (controls.play || controls.pause) {
                this.playPauseBtn = this._createButton('▶️', 'Play/Pause', () => {
                    this.isPlaying ? this.pause() : this.play();
                });
                this.controlsContainer.appendChild(this.playPauseBtn);
            }
            
            // Stop button
            if (controls.stop) {
                this.stopBtn = this._createButton('⏹️', 'Stop', () => {
                    this.stop();
                });
                this.controlsContainer.appendChild(this.stopBtn);
            }
            
            // Time display
            this.timeDisplay = document.createElement('span');
            this.timeDisplay.className = 'time-display';
            this.timeDisplay.style.cssText = `
            color: white;
            font-family: 'Roboto Mono', monospace;
            font-size: 12px;
            margin: 0 10px;
            min-width: 80px;
            text-align: center;
        `;
            this.timeDisplay.textContent = '00:00 / 00:00';
            this.controlsContainer.appendChild(this.timeDisplay);
            
            // Volume control
            if (controls.volume) {
                this.volumeContainer = document.createElement('div');
                this.volumeContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 5px;
                margin-left: 15px;
            `;
                
                // Mute button
                if (controls.mute) {
                    this.muteBtn = this._createButton('🔊', 'Mute', () => {
                        this.toggleMute();
                    });
                    this.volumeContainer.appendChild(this.muteBtn);
                }
                
                // Volume slider
                this.volumeSlider = document.createElement('input');
                this.volumeSlider.type = 'range';
                this.volumeSlider.min = '0';
                this.volumeSlider.max = '100';
                this.volumeSlider.value = '100';
                this.volumeSlider.style.cssText = `
                width: 80px;
                height: 4px;
                background: rgba(255,255,255,0.3);
                outline: none;
                border-radius: 2px;
            `;
                
                this.volumeSlider.addEventListener('input', (e) => {
                    this.setVolume(parseInt(e.target.value) / 100);
                });
                
                this.volumeContainer.appendChild(this.volumeSlider);
                this.controlsContainer.appendChild(this.volumeContainer);
            }
            
            // Download button
            if (controls.download) {
                this.downloadBtn = this._createButton('💾', 'Download', () => {
                    this.downloadAudio();
                });
                this.controlsContainer.appendChild(this.downloadBtn);
            }
            
            this.container.appendChild(this.controlsContainer);
        }
        
        _createButton(text, title, onClick) {
            const button = document.createElement('button');
            button.textContent = text;
            button.title = title;
            button.style.cssText = `
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
            backdrop-filter: blur(10px);
        `;
            
            button.addEventListener('mouseenter', () => {
                button.style.background = 'rgba(255,255,255,0.3)';
                button.style.transform = 'scale(1.05)';
            });
            
            button.addEventListener('mouseleave', () => {
                button.style.background = 'rgba(255,255,255,0.2)';
                button.style.transform = 'scale(1)';
            });
            
            button.addEventListener('click', onClick);
            return button;
        }
        
        _setupEventHandlers() {
            if (!this.wavesurfer) return;
            
            // Ready event
            this.wavesurfer.on('ready', () => {
                this.isReady = true;
                this._updateTimeDisplay();
                console.log(`🎵 WaveSurfer "${this.id}" is ready`);
                this.config.callbacks.onReady(this);
            });
            
            // Play event
            this.wavesurfer.on('play', () => {
                this.isPlaying = true;
                if (this.playPauseBtn) {
                    this.playPauseBtn.textContent = '⏸️';
                }
                this.config.callbacks.onPlay(this);
            });
            
            // Pause event
            this.wavesurfer.on('pause', () => {
                this.isPlaying = false;
                if (this.playPauseBtn) {
                    this.playPauseBtn.textContent = '▶️';
                }
                this.config.callbacks.onPause(this);
            });
            
            // Finish event
            this.wavesurfer.on('finish', () => {
                this.isPlaying = false;
                if (this.playPauseBtn) {
                    this.playPauseBtn.textContent = '▶️';
                }
                this.config.callbacks.onFinish(this);
            });
            
            // Seek event
            this.wavesurfer.on('seeking', (currentTime) => {
                this.currentTime = currentTime;
                this._updateTimeDisplay();
                this.config.callbacks.onSeek(currentTime, this);
            });
            
            // Time update event
            this.wavesurfer.on('timeupdate', (currentTime) => {
                this.currentTime = currentTime;
                this._updateTimeDisplay();
                this.config.callbacks.onTimeUpdate(currentTime, this);
            });
            
            // Error handling
            this.wavesurfer.on('error', (error) => {
                console.error(`❌ WaveSurfer "${this.id}" error:`, error);
                this.config.callbacks.onError(error);
            });
            
            // Region events (if regions plugin is enabled)
            if (this.config.regions.enabled) {
                this._setupRegionEvents();
            }
        }
        
        _setupRegionEvents() {
            // Region creation
            this.wavesurfer.on('region-created', (region) => {
                this.regions.set(region.id, region);
                console.log(`🎯 Region created: ${region.id}`);
                this.config.callbacks.onRegionCreate(region, this);
            });
            
            // Region update
            this.wavesurfer.on('region-updated', (region) => {
                console.log(`🎯 Region updated: ${region.id}`);
                this.config.callbacks.onRegionUpdate(region, this);
            });
            
            // Region removal
            this.wavesurfer.on('region-removed', (region) => {
                this.regions.delete(region.id);
                console.log(`🎯 Region removed: ${region.id}`);
                this.config.callbacks.onRegionRemove(region, this);
            });
        }
        
        _updateTimeDisplay() {
            if (!this.timeDisplay || !this.wavesurfer) return;
            
            const current = this._formatTime(this.currentTime);
            const total = this._formatTime(this.wavesurfer.getDuration() || 0);
            this.timeDisplay.textContent = `${current} / ${total}`;
        }
        
        _formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        
        // Public API Methods
        
        async loadAudio(url, peaks = null) {
            if (!this.wavesurfer) {
                throw new Error('WaveSurfer not initialized');
            }
            
            try {
                if (peaks) {
                    await this.wavesurfer.load(url, peaks);
                } else {
                    await this.wavesurfer.load(url);
                }
                
                this.config.url = url;
                this.config.peaks = peaks;
                
                console.log(`🎵 Audio loaded: ${url}`);
                return this;
            } catch (error) {
                console.error('❌ Failed to load audio:', error);
                this.config.callbacks.onError(error);
                throw error;
            }
        }
        
        play() {
            if (this.wavesurfer && this.isReady) {
                this.wavesurfer.play();
            }
            return this;
        }
        
        pause() {
            if (this.wavesurfer && this.isReady) {
                this.wavesurfer.pause();
            }
            return this;
        }
        
        stop() {
            if (this.wavesurfer && this.isReady) {
                this.wavesurfer.stop();
            }
            return this;
        }
        
        seekTo(progress) {
            if (this.wavesurfer && this.isReady) {
                this.wavesurfer.seekTo(progress);
            }
            return this;
        }
        
        setVolume(volume) {
            if (this.wavesurfer && this.isReady) {
                this.wavesurfer.setVolume(volume);
                if (this.volumeSlider) {
                    this.volumeSlider.value = volume * 100;
                }
            }
            return this;
        }
        
        toggleMute() {
            if (this.wavesurfer && this.isReady) {
                const isMuted = this.wavesurfer.getMuted();
                this.wavesurfer.setMuted(!isMuted);
                
                if (this.muteBtn) {
                    this.muteBtn.textContent = isMuted ? '🔊' : '🔇';
                }
            }
            return this;
        }
        
        getCurrentTime() {
            return this.wavesurfer ? this.wavesurfer.getCurrentTime() : 0;
        }
        
        getDuration() {
            return this.wavesurfer ? this.wavesurfer.getDuration() : 0;
        }
        
        getPlaybackRate() {
            return this.wavesurfer ? this.wavesurfer.getPlaybackRate() : 1;
        }
        
        setPlaybackRate(rate) {
            if (this.wavesurfer && this.isReady) {
                this.wavesurfer.setPlaybackRate(rate);
            }
            return this;
        }
        
        // Region management (requires regions plugin)
        addRegion(options) {
            if (!this.config.regions.enabled || !this.wavesurfer) {
                console.warn('🎯 Regions not enabled or WaveSurfer not ready');
                return null;
            }
            
            try {
                // For WaveSurfer v7+, check if regions plugin is available
                const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
                const regionsPlugin = plugins.find(plugin => 
                    plugin.constructor.name === 'RegionsPlugin' || 
                    plugin.name === 'regions' ||
                    typeof plugin.addRegion === 'function'
                );
                
                if (regionsPlugin && typeof regionsPlugin.addRegion === 'function') {
                    const region = regionsPlugin.addRegion(options);
                    console.log(`🎯 Region created: ${options.start?.toFixed(2)}s - ${options.end?.toFixed(2)}s`);
                    return region;
                }
                
                // Fallback: try direct method if available
                if (this.wavesurfer.addRegion && typeof this.wavesurfer.addRegion === 'function') {
                    const region = this.wavesurfer.addRegion(options);
                    console.log(`🎯 Region created (fallback): ${options.start?.toFixed(2)}s - ${options.end?.toFixed(2)}s`);
                    return region;
                }
                
                console.warn('🎯 No regions functionality available - regions plugin may not be loaded');
                return null;
                
            } catch (error) {
                console.error('🎯 Error creating region:', error);
                return null;
            }
        }
        
        removeRegion(regionId) {
            const region = this.regions.get(regionId);
            if (region) {
                region.remove();
            }
            return this;
        }
        
        clearRegions() {
            if (this.wavesurfer && this.config.regions.enabled) {
                this.wavesurfer.clearRegions();
            }
            return this;
        }
        
        getRegions() {
            return Array.from(this.regions.values());
        }
        
        // Export/download functionality
        downloadAudio() {
            if (!this.config.url) {
                console.warn('No audio URL to download');
                return;
            }
            
            const link = document.createElement('a');
            link.href = this.config.url;
            link.download = this.config.url.split('/').pop() || 'audio.wav';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        
        exportImage() {
            if (this.wavesurfer && this.isReady) {
                return this.wavesurfer.exportImage();
            }
            return null;
        }
        
        // Positioning and styling
        setPosition(x, y) {
            this.config.x = x;
            this.config.y = y;
            
            if (this.container) {
                this.container.style.left = `${x}px`;
                this.container.style.top = `${y}px`;
            }
            return this;
        }
        
        setSize(width, height) {
            this.config.width = width;
            this.config.height = height;
            
            if (this.container) {
                this.container.style.width = `${width}px`;
                this.container.style.height = `${height}px`;
            }
            return this;
        }
        
        setColors(colors) {
            Object.assign(this.config, colors);
            
            if (this.wavesurfer && this.isReady) {
                if (colors.waveColor) this.wavesurfer.setOptions({ waveColor: colors.waveColor });
                if (colors.progressColor) this.wavesurfer.setOptions({ progressColor: colors.progressColor });
                if (colors.cursorColor) this.wavesurfer.setOptions({ cursorColor: colors.cursorColor });
            }
            return this;
        }
        
        // Cleanup
        destroy() {
            console.log(`🗑️ Destroying WaveSurfer instance "${this.id}"`);
            
            // Stop playback
            if (this.wavesurfer) {
                this.wavesurfer.stop();
                this.wavesurfer.destroy();
            }
            
            // Remove from DOM
            if (this.container && this.container.parentNode) {
                this.container.parentNode.removeChild(this.container);
            }
            
            // Remove from registry
            WaveSurfer.instances.delete(this.id);
            
            // Clear references
            this.wavesurfer = null;
            this.container = null;
            this.waveformContainer = null;
            this.controlsContainer = null;
            this.regions.clear();
        }
        
        // Static methods
        static getInstance(id) {
            return WaveSurfer.instances.get(id);
        }
        
        static getAllInstances() {
            return Array.from(WaveSurfer.instances.values());
        }
        
        static destroyAll() {
            WaveSurfer.instances.forEach(instance => instance.destroy());
            WaveSurfer.instances.clear();
        }
    }

    function t$8(t,e,i,s){return new(i||(i=Promise))((function(n,r){function o(t){try{h(s.next(t));}catch(t){r(t);}}function a(t){try{h(s.throw(t));}catch(t){r(t);}}function h(t){var e;t.done?n(t.value):(e=t.value,e instanceof i?e:new i((function(t){t(e);}))).then(o,a);}h((s=s.apply(t,e||[])).next());}))}"function"==typeof SuppressedError&&SuppressedError;let e$8 = class e{constructor(){this.listeners={};}on(t,e,i){if(this.listeners[t]||(this.listeners[t]=new Set),this.listeners[t].add(e),null==i?void 0:i.once){const i=()=>{this.un(t,i),this.un(t,e);};return this.on(t,i),i}return ()=>this.un(t,e)}un(t,e){var i;null===(i=this.listeners[t])||void 0===i||i.delete(e);}once(t,e){return this.on(t,e,{once:true})}unAll(){this.listeners={};}emit(t,...e){this.listeners[t]&&this.listeners[t].forEach((t=>t(...e)));}};const i$8={decode:function(e,i){return t$8(this,void 0,void 0,(function*(){const t=new AudioContext({sampleRate:i});return t.decodeAudioData(e).finally((()=>t.close()))}))},createBuffer:function(t,e){return "number"==typeof t[0]&&(t=[t]),function(t){const e=t[0];if(e.some((t=>t>1||t<-1))){const i=e.length;let s=0;for(let t=0;t<i;t++){const i=Math.abs(e[t]);i>s&&(s=i);}for(const e of t)for(let t=0;t<i;t++)e[t]/=s;}}(t),{duration:e,length:t[0].length,sampleRate:t[0].length/e,numberOfChannels:t.length,getChannelData:e=>null==t?void 0:t[e],copyFromChannel:AudioBuffer.prototype.copyFromChannel,copyToChannel:AudioBuffer.prototype.copyToChannel}}};function s$8(t,e){const i=e.xmlns?document.createElementNS(e.xmlns,t):document.createElement(t);for(const[t,n]of Object.entries(e))if("children"===t)for(const[t,n]of Object.entries(e))"string"==typeof n?i.appendChild(document.createTextNode(n)):i.appendChild(s$8(t,n));else "style"===t?Object.assign(i.style,n):"textContent"===t?i.textContent=n:i.setAttribute(t,n.toString());return i}function n$6(t,e,i){const n=s$8(t,e||{});return null==i||i.appendChild(n),n}var r$7=Object.freeze({__proto__:null,createElement:n$6,default:n$6});const o$4={fetchBlob:function(e,i,s){return t$8(this,void 0,void 0,(function*(){const n=yield fetch(e,s);if(n.status>=400)throw new Error(`Failed to fetch ${e}: ${n.status} (${n.statusText})`);return function(e,i){t$8(this,void 0,void 0,(function*(){if(!e.body||!e.headers)return;const s=e.body.getReader(),n=Number(e.headers.get("Content-Length"))||0;let r=0;const o=e=>t$8(this,void 0,void 0,(function*(){r+=(null==e?void 0:e.length)||0;const t=Math.round(r/n*100);i(t);})),a=()=>t$8(this,void 0,void 0,(function*(){let t;try{t=yield s.read();}catch(t){return}t.done||(o(t.value),yield a());}));a();}));}(n.clone(),i),n.blob()}))}};let a$2 = class a extends e$8{constructor(t){super(),this.isExternalMedia=false,t.media?(this.media=t.media,this.isExternalMedia=true):this.media=document.createElement("audio"),t.mediaControls&&(this.media.controls=true),t.autoplay&&(this.media.autoplay=true),null!=t.playbackRate&&this.onMediaEvent("canplay",(()=>{null!=t.playbackRate&&(this.media.playbackRate=t.playbackRate);}),{once:true});}onMediaEvent(t,e,i){return this.media.addEventListener(t,e,i),()=>this.media.removeEventListener(t,e,i)}getSrc(){return this.media.currentSrc||this.media.src||""}revokeSrc(){const t=this.getSrc();t.startsWith("blob:")&&URL.revokeObjectURL(t);}canPlayType(t){return ""!==this.media.canPlayType(t)}setSrc(t,e){const i=this.getSrc();if(t&&i===t)return;this.revokeSrc();const s=e instanceof Blob&&(this.canPlayType(e.type)||!t)?URL.createObjectURL(e):t;i&&(this.media.src="");try{this.media.src=s;}catch(e){this.media.src=t;}}destroy(){this.isExternalMedia||(this.media.pause(),this.media.remove(),this.revokeSrc(),this.media.src="",this.media.load());}setMediaElement(t){this.media=t;}play(){return t$8(this,void 0,void 0,(function*(){return this.media.play()}))}pause(){this.media.pause();}isPlaying(){return !this.media.paused&&!this.media.ended}setTime(t){this.media.currentTime=Math.max(0,Math.min(t,this.getDuration()));}getDuration(){return this.media.duration}getCurrentTime(){return this.media.currentTime}getVolume(){return this.media.volume}setVolume(t){this.media.volume=t;}getMuted(){return this.media.muted}setMuted(t){this.media.muted=t;}getPlaybackRate(){return this.media.playbackRate}isSeeking(){return this.media.seeking}setPlaybackRate(t,e){null!=e&&(this.media.preservesPitch=e),this.media.playbackRate=t;}getMediaElement(){return this.media}setSinkId(t){return this.media.setSinkId(t)}};let h$2 = class h extends e$8{constructor(t,e){super(),this.timeouts=[],this.isScrollable=false,this.audioData=null,this.resizeObserver=null,this.lastContainerWidth=0,this.isDragging=false,this.subscriptions=[],this.unsubscribeOnScroll=[],this.subscriptions=[],this.options=t;const i=this.parentFromOptionsContainer(t.container);this.parent=i;const[s,n]=this.initHtml();i.appendChild(s),this.container=s,this.scrollContainer=n.querySelector(".scroll"),this.wrapper=n.querySelector(".wrapper"),this.canvasWrapper=n.querySelector(".canvases"),this.progressWrapper=n.querySelector(".progress"),this.cursor=n.querySelector(".cursor"),e&&n.appendChild(e),this.initEvents();}parentFromOptionsContainer(t){let e;if("string"==typeof t?e=document.querySelector(t):t instanceof HTMLElement&&(e=t),!e)throw new Error("Container not found");return e}initEvents(){const t=t=>{const e=this.wrapper.getBoundingClientRect(),i=t.clientX-e.left,s=t.clientY-e.top;return [i/e.width,s/e.height]};if(this.wrapper.addEventListener("click",(e=>{const[i,s]=t(e);this.emit("click",i,s);})),this.wrapper.addEventListener("dblclick",(e=>{const[i,s]=t(e);this.emit("dblclick",i,s);})),true!==this.options.dragToSeek&&"object"!=typeof this.options.dragToSeek||this.initDrag(),this.scrollContainer.addEventListener("scroll",(()=>{const{scrollLeft:t,scrollWidth:e,clientWidth:i}=this.scrollContainer,s=t/e,n=(t+i)/e;this.emit("scroll",s,n,t,t+i);})),"function"==typeof ResizeObserver){const t=this.createDelay(100);this.resizeObserver=new ResizeObserver((()=>{t().then((()=>this.onContainerResize())).catch((()=>{}));})),this.resizeObserver.observe(this.scrollContainer);}}onContainerResize(){const t=this.parent.clientWidth;t===this.lastContainerWidth&&"auto"!==this.options.height||(this.lastContainerWidth=t,this.reRender());}initDrag(){this.subscriptions.push(function(t,e,i,s,n=3,r=0,o=100){if(!t)return ()=>{};const a=matchMedia("(pointer: coarse)").matches;let h=()=>{};const l=l=>{if(l.button!==r)return;l.preventDefault(),l.stopPropagation();let d=l.clientX,c=l.clientY,u=false;const p=Date.now(),m=s=>{if(s.preventDefault(),s.stopPropagation(),a&&Date.now()-p<o)return;const r=s.clientX,h=s.clientY,l=r-d,m=h-c;if(u||Math.abs(l)>n||Math.abs(m)>n){const s=t.getBoundingClientRect(),{left:n,top:o}=s;u||(null==i||i(d-n,c-o),u=true),e(l,m,r-n,h-o),d=r,c=h;}},f=e=>{if(u){const i=e.clientX,n=e.clientY,r=t.getBoundingClientRect(),{left:o,top:a}=r;null==s||s(i-o,n-a);}h();},g=t=>{t.relatedTarget&&t.relatedTarget!==document.documentElement||f(t);},v=t=>{u&&(t.stopPropagation(),t.preventDefault());},b=t=>{u&&t.preventDefault();};document.addEventListener("pointermove",m),document.addEventListener("pointerup",f),document.addEventListener("pointerout",g),document.addEventListener("pointercancel",g),document.addEventListener("touchmove",b,{passive:false}),document.addEventListener("click",v,{capture:true}),h=()=>{document.removeEventListener("pointermove",m),document.removeEventListener("pointerup",f),document.removeEventListener("pointerout",g),document.removeEventListener("pointercancel",g),document.removeEventListener("touchmove",b),setTimeout((()=>{document.removeEventListener("click",v,{capture:true});}),10);};};return t.addEventListener("pointerdown",l),()=>{h(),t.removeEventListener("pointerdown",l);}}(this.wrapper,((t,e,i)=>{this.emit("drag",Math.max(0,Math.min(1,i/this.wrapper.getBoundingClientRect().width)));}),(t=>{this.isDragging=true,this.emit("dragstart",Math.max(0,Math.min(1,t/this.wrapper.getBoundingClientRect().width)));}),(t=>{this.isDragging=false,this.emit("dragend",Math.max(0,Math.min(1,t/this.wrapper.getBoundingClientRect().width)));})));}getHeight(t,e){var i;const s=(null===(i=this.audioData)||void 0===i?void 0:i.numberOfChannels)||1;if(null==t)return 128;if(!isNaN(Number(t)))return Number(t);if("auto"===t){const t=this.parent.clientHeight||128;return (null==e?void 0:e.every((t=>!t.overlay)))?t/s:t}return 128}initHtml(){const t=document.createElement("div"),e=t.attachShadow({mode:"open"}),i=this.options.cspNonce&&"string"==typeof this.options.cspNonce?this.options.cspNonce.replace(/"/g,""):"";return e.innerHTML=`\n      <style${i?` nonce="${i}"`:""}>\n        :host {\n          user-select: none;\n          min-width: 1px;\n        }\n        :host audio {\n          display: block;\n          width: 100%;\n        }\n        :host .scroll {\n          overflow-x: auto;\n          overflow-y: hidden;\n          width: 100%;\n          position: relative;\n        }\n        :host .noScrollbar {\n          scrollbar-color: transparent;\n          scrollbar-width: none;\n        }\n        :host .noScrollbar::-webkit-scrollbar {\n          display: none;\n          -webkit-appearance: none;\n        }\n        :host .wrapper {\n          position: relative;\n          overflow: visible;\n          z-index: 2;\n        }\n        :host .canvases {\n          min-height: ${this.getHeight(this.options.height,this.options.splitChannels)}px;\n        }\n        :host .canvases > div {\n          position: relative;\n        }\n        :host canvas {\n          display: block;\n          position: absolute;\n          top: 0;\n          image-rendering: pixelated;\n        }\n        :host .progress {\n          pointer-events: none;\n          position: absolute;\n          z-index: 2;\n          top: 0;\n          left: 0;\n          width: 0;\n          height: 100%;\n          overflow: hidden;\n        }\n        :host .progress > div {\n          position: relative;\n        }\n        :host .cursor {\n          pointer-events: none;\n          position: absolute;\n          z-index: 5;\n          top: 0;\n          left: 0;\n          height: 100%;\n          border-radius: 2px;\n        }\n      </style>\n\n      <div class="scroll" part="scroll">\n        <div class="wrapper" part="wrapper">\n          <div class="canvases" part="canvases"></div>\n          <div class="progress" part="progress"></div>\n          <div class="cursor" part="cursor"></div>\n        </div>\n      </div>\n    `,[t,e]}setOptions(t){if(this.options.container!==t.container){const e=this.parentFromOptionsContainer(t.container);e.appendChild(this.container),this.parent=e;} true!==t.dragToSeek&&"object"!=typeof this.options.dragToSeek||this.initDrag(),this.options=t,this.reRender();}getWrapper(){return this.wrapper}getWidth(){return this.scrollContainer.clientWidth}getScroll(){return this.scrollContainer.scrollLeft}setScroll(t){this.scrollContainer.scrollLeft=t;}setScrollPercentage(t){const{scrollWidth:e}=this.scrollContainer,i=e*t;this.setScroll(i);}destroy(){var t,e;this.subscriptions.forEach((t=>t())),this.container.remove(),null===(t=this.resizeObserver)||void 0===t||t.disconnect(),null===(e=this.unsubscribeOnScroll)||void 0===e||e.forEach((t=>t())),this.unsubscribeOnScroll=[];}createDelay(t=10){let e,i;const s=()=>{e&&clearTimeout(e),i&&i();};return this.timeouts.push(s),()=>new Promise(((n,r)=>{s(),i=r,e=setTimeout((()=>{e=void 0,i=void 0,n();}),t);}))}convertColorValues(t){if(!Array.isArray(t))return t||"";if(t.length<2)return t[0]||"";const e=document.createElement("canvas"),i=e.getContext("2d"),s=e.height*(window.devicePixelRatio||1),n=i.createLinearGradient(0,0,0,s),r=1/(t.length-1);return t.forEach(((t,e)=>{const i=e*r;n.addColorStop(i,t);})),n}getPixelRatio(){return Math.max(1,window.devicePixelRatio||1)}renderBarWaveform(t,e,i,s){const n=t[0],r=t[1]||t[0],o=n.length,{width:a,height:h}=i.canvas,l=h/2,d=this.getPixelRatio(),c=e.barWidth?e.barWidth*d:1,u=e.barGap?e.barGap*d:e.barWidth?c/2:0,p=e.barRadius||0,m=a/(c+u)/o,f=p&&"roundRect"in i?"roundRect":"rect";i.beginPath();let g=0,v=0,b=0;for(let t=0;t<=o;t++){const o=Math.round(t*m);if(o>g){const t=Math.round(v*l*s),n=t+Math.round(b*l*s)||1;let r=l-t;"top"===e.barAlign?r=0:"bottom"===e.barAlign&&(r=h-n),i[f](g*(c+u),r,c,n,p),g=o,v=0,b=0;}const a=Math.abs(n[t]||0),d=Math.abs(r[t]||0);a>v&&(v=a),d>b&&(b=d);}i.fill(),i.closePath();}renderLineWaveform(t,e,i,s){const n=e=>{const n=t[e]||t[0],r=n.length,{height:o}=i.canvas,a=o/2,h=i.canvas.width/r;i.moveTo(0,a);let l=0,d=0;for(let t=0;t<=r;t++){const r=Math.round(t*h);if(r>l){const t=a+(Math.round(d*a*s)||1)*(0===e?-1:1);i.lineTo(l,t),l=r,d=0;}const o=Math.abs(n[t]||0);o>d&&(d=o);}i.lineTo(l,a);};i.beginPath(),n(0),n(1),i.fill(),i.closePath();}renderWaveform(t,e,i){if(i.fillStyle=this.convertColorValues(e.waveColor),e.renderFunction)return void e.renderFunction(t,i);let s=e.barHeight||1;if(e.normalize){const e=Array.from(t[0]).reduce(((t,e)=>Math.max(t,Math.abs(e))),0);s=e?1/e:1;}e.barWidth||e.barGap||e.barAlign?this.renderBarWaveform(t,e,i,s):this.renderLineWaveform(t,e,i,s);}renderSingleCanvas(t,e,i,s,n,r,o){const a=this.getPixelRatio(),h=document.createElement("canvas");h.width=Math.round(i*a),h.height=Math.round(s*a),h.style.width=`${i}px`,h.style.height=`${s}px`,h.style.left=`${Math.round(n)}px`,r.appendChild(h);const l=h.getContext("2d");if(this.renderWaveform(t,e,l),h.width>0&&h.height>0){const t=h.cloneNode(),i=t.getContext("2d");i.drawImage(h,0,0),i.globalCompositeOperation="source-in",i.fillStyle=this.convertColorValues(e.progressColor),i.fillRect(0,0,h.width,h.height),o.appendChild(t);}}renderMultiCanvas(t,e,i,s,n,r){const o=this.getPixelRatio(),{clientWidth:a}=this.scrollContainer,l=i/o;let d=Math.min(h.MAX_CANVAS_WIDTH,a,l),c={};if(0===d)return;if(e.barWidth||e.barGap){const t=e.barWidth||.5,i=t+(e.barGap||t/2);d%i!=0&&(d=Math.floor(d/i)*i);}const u=i=>{if(i<0||i>=p)return;if(c[i])return;c[i]=true;const o=i*d,a=Math.min(l-o,d);if(a<=0)return;const h=t.map((t=>{const e=Math.floor(o/l*t.length),i=Math.floor((o+a)/l*t.length);return t.slice(e,i)}));this.renderSingleCanvas(h,e,a,s,o,n,r);},p=Math.ceil(l/d);if(!this.isScrollable){for(let t=0;t<p;t++)u(t);return}const m=this.scrollContainer.scrollLeft/l,f=Math.floor(m*p);if(u(f-1),u(f),u(f+1),p>1){const t=this.on("scroll",(()=>{const{scrollLeft:t}=this.scrollContainer,e=Math.floor(t/l*p);Object.keys(c).length>h.MAX_NODES&&(n.innerHTML="",r.innerHTML="",c={}),u(e-1),u(e),u(e+1);}));this.unsubscribeOnScroll.push(t);}}renderChannel(t,e,i,s){var{overlay:n}=e,r=function(t,e){var i={};for(var s in t)Object.prototype.hasOwnProperty.call(t,s)&&e.indexOf(s)<0&&(i[s]=t[s]);if(null!=t&&"function"==typeof Object.getOwnPropertySymbols){var n=0;for(s=Object.getOwnPropertySymbols(t);n<s.length;n++)e.indexOf(s[n])<0&&Object.prototype.propertyIsEnumerable.call(t,s[n])&&(i[s[n]]=t[s[n]]);}return i}(e,["overlay"]);const o=document.createElement("div"),a=this.getHeight(r.height,r.splitChannels);o.style.height=`${a}px`,n&&s>0&&(o.style.marginTop=`-${a}px`),this.canvasWrapper.style.minHeight=`${a}px`,this.canvasWrapper.appendChild(o);const h=o.cloneNode();this.progressWrapper.appendChild(h),this.renderMultiCanvas(t,r,i,a,o,h);}render(e){return t$8(this,void 0,void 0,(function*(){var t;this.timeouts.forEach((t=>t())),this.timeouts=[],this.canvasWrapper.innerHTML="",this.progressWrapper.innerHTML="",null!=this.options.width&&(this.scrollContainer.style.width="number"==typeof this.options.width?`${this.options.width}px`:this.options.width);const i=this.getPixelRatio(),s=this.scrollContainer.clientWidth,n=Math.ceil(e.duration*(this.options.minPxPerSec||0));this.isScrollable=n>s;const r=this.options.fillParent&&!this.isScrollable,o=(r?s:n)*i;if(this.wrapper.style.width=r?"100%":`${n}px`,this.scrollContainer.style.overflowX=this.isScrollable?"auto":"hidden",this.scrollContainer.classList.toggle("noScrollbar",!!this.options.hideScrollbar),this.cursor.style.backgroundColor=`${this.options.cursorColor||this.options.progressColor}`,this.cursor.style.width=`${this.options.cursorWidth}px`,this.audioData=e,this.emit("render"),this.options.splitChannels)for(let i=0;i<e.numberOfChannels;i++){const s=Object.assign(Object.assign({},this.options),null===(t=this.options.splitChannels)||void 0===t?void 0:t[i]);this.renderChannel([e.getChannelData(i)],s,o,i);}else {const t=[e.getChannelData(0)];e.numberOfChannels>1&&t.push(e.getChannelData(1)),this.renderChannel(t,this.options,o,0);}Promise.resolve().then((()=>this.emit("rendered")));}))}reRender(){if(this.unsubscribeOnScroll.forEach((t=>t())),this.unsubscribeOnScroll=[],!this.audioData)return;const{scrollWidth:t}=this.scrollContainer,{right:e}=this.progressWrapper.getBoundingClientRect();if(this.render(this.audioData),this.isScrollable&&t!==this.scrollContainer.scrollWidth){const{right:t}=this.progressWrapper.getBoundingClientRect();let i=t-e;i*=2,i=i<0?Math.floor(i):Math.ceil(i),i/=2,this.scrollContainer.scrollLeft+=i;}}zoom(t){this.options.minPxPerSec=t,this.reRender();}scrollIntoView(t,e=false){const{scrollLeft:i,scrollWidth:s,clientWidth:n}=this.scrollContainer,r=t*s,o=i,a=i+n,h=n/2;if(this.isDragging){const t=30;r+t>a?this.scrollContainer.scrollLeft+=t:r-t<o&&(this.scrollContainer.scrollLeft-=t);}else {(r<o||r>a)&&(this.scrollContainer.scrollLeft=r-(this.options.autoCenter?h:0));const t=r-i-h;e&&this.options.autoCenter&&t>0&&(this.scrollContainer.scrollLeft+=Math.min(t,10));}{const t=this.scrollContainer.scrollLeft,e=t/s,i=(t+n)/s;this.emit("scroll",e,i,t,t+n);}}renderProgress(t,e){if(isNaN(t))return;const i=100*t;this.canvasWrapper.style.clipPath=`polygon(${i}% 0, 100% 0, 100% 100%, ${i}% 100%)`,this.progressWrapper.style.width=`${i}%`,this.cursor.style.left=`${i}%`,this.cursor.style.transform=`translateX(-${100===Math.round(i)?this.options.cursorWidth:0}px)`,this.isScrollable&&this.options.autoScroll&&this.scrollIntoView(t,e);}exportImage(e,i,s){return t$8(this,void 0,void 0,(function*(){const t=this.canvasWrapper.querySelectorAll("canvas");if(!t.length)throw new Error("No waveform data");if("dataURL"===s){const s=Array.from(t).map((t=>t.toDataURL(e,i)));return Promise.resolve(s)}return Promise.all(Array.from(t).map((t=>new Promise(((s,n)=>{t.toBlob((t=>{t?s(t):n(new Error("Could not export image"));}),e,i);})))))}))}};h$2.MAX_CANVAS_WIDTH=8e3,h$2.MAX_NODES=10;let l$2 = class l extends e$8{constructor(){super(...arguments),this.unsubscribe=()=>{};}start(){this.unsubscribe=this.on("tick",(()=>{requestAnimationFrame((()=>{this.emit("tick");}));})),this.emit("tick");}stop(){this.unsubscribe();}destroy(){this.unsubscribe();}};let d$1 = class d extends e$8{constructor(t=new AudioContext){super(),this.bufferNode=null,this.playStartTime=0,this.playedDuration=0,this._muted=false,this._playbackRate=1,this._duration=void 0,this.buffer=null,this.currentSrc="",this.paused=true,this.crossOrigin=null,this.seeking=false,this.autoplay=false,this.addEventListener=this.on,this.removeEventListener=this.un,this.audioContext=t,this.gainNode=this.audioContext.createGain(),this.gainNode.connect(this.audioContext.destination);}load(){return t$8(this,void 0,void 0,(function*(){}))}get src(){return this.currentSrc}set src(t){if(this.currentSrc=t,this._duration=void 0,!t)return this.buffer=null,void this.emit("emptied");fetch(t).then((e=>{if(e.status>=400)throw new Error(`Failed to fetch ${t}: ${e.status} (${e.statusText})`);return e.arrayBuffer()})).then((e=>this.currentSrc!==t?null:this.audioContext.decodeAudioData(e))).then((e=>{this.currentSrc===t&&(this.buffer=e,this.emit("loadedmetadata"),this.emit("canplay"),this.autoplay&&this.play());}));}_play(){var t;if(!this.paused)return;this.paused=false,null===(t=this.bufferNode)||void 0===t||t.disconnect(),this.bufferNode=this.audioContext.createBufferSource(),this.buffer&&(this.bufferNode.buffer=this.buffer),this.bufferNode.playbackRate.value=this._playbackRate,this.bufferNode.connect(this.gainNode);let e=this.playedDuration*this._playbackRate;(e>=this.duration||e<0)&&(e=0,this.playedDuration=0),this.bufferNode.start(this.audioContext.currentTime,e),this.playStartTime=this.audioContext.currentTime,this.bufferNode.onended=()=>{this.currentTime>=this.duration&&(this.pause(),this.emit("ended"));};}_pause(){var t;this.paused=true,null===(t=this.bufferNode)||void 0===t||t.stop(),this.playedDuration+=this.audioContext.currentTime-this.playStartTime;}play(){return t$8(this,void 0,void 0,(function*(){this.paused&&(this._play(),this.emit("play"));}))}pause(){this.paused||(this._pause(),this.emit("pause"));}stopAt(t){const e=t-this.currentTime,i=this.bufferNode;null==i||i.stop(this.audioContext.currentTime+e),null==i||i.addEventListener("ended",(()=>{i===this.bufferNode&&(this.bufferNode=null,this.pause());}),{once:true});}setSinkId(e){return t$8(this,void 0,void 0,(function*(){return this.audioContext.setSinkId(e)}))}get playbackRate(){return this._playbackRate}set playbackRate(t){this._playbackRate=t,this.bufferNode&&(this.bufferNode.playbackRate.value=t);}get currentTime(){return (this.paused?this.playedDuration:this.playedDuration+(this.audioContext.currentTime-this.playStartTime))*this._playbackRate}set currentTime(t){const e=!this.paused;e&&this._pause(),this.playedDuration=t/this._playbackRate,e&&this._play(),this.emit("seeking"),this.emit("timeupdate");}get duration(){var t,e;return null!==(t=this._duration)&&void 0!==t?t:(null===(e=this.buffer)||void 0===e?void 0:e.duration)||0}set duration(t){this._duration=t;}get volume(){return this.gainNode.gain.value}set volume(t){this.gainNode.gain.value=t,this.emit("volumechange");}get muted(){return this._muted}set muted(t){this._muted!==t&&(this._muted=t,this._muted?this.gainNode.disconnect():this.gainNode.connect(this.audioContext.destination));}canPlayType(t){return /^(audio|video)\//.test(t)}getGainNode(){return this.gainNode}getChannelData(){const t=[];if(!this.buffer)return t;const e=this.buffer.numberOfChannels;for(let i=0;i<e;i++)t.push(this.buffer.getChannelData(i));return t}};const c$1={waveColor:"#999",progressColor:"#555",cursorWidth:1,minPxPerSec:0,fillParent:true,interact:true,dragToSeek:false,autoScroll:true,autoCenter:true,sampleRate:8e3};let u$1 = class u extends a$2{static create(t){return new u(t)}constructor(t){const e=t.media||("WebAudio"===t.backend?new d$1:void 0);super({media:e,mediaControls:t.mediaControls,autoplay:t.autoplay,playbackRate:t.audioRate}),this.plugins=[],this.decodedData=null,this.stopAtPosition=null,this.subscriptions=[],this.mediaSubscriptions=[],this.abortController=null,this.options=Object.assign({},c$1,t),this.timer=new l$2;const i=e?void 0:this.getMediaElement();this.renderer=new h$2(this.options,i),this.initPlayerEvents(),this.initRendererEvents(),this.initTimerEvents(),this.initPlugins();const s=this.options.url||this.getSrc()||"";Promise.resolve().then((()=>{this.emit("init");const{peaks:t,duration:e}=this.options;(s||t&&e)&&this.load(s,t,e).catch((()=>null));}));}updateProgress(t=this.getCurrentTime()){return this.renderer.renderProgress(t/this.getDuration(),this.isPlaying()),t}initTimerEvents(){this.subscriptions.push(this.timer.on("tick",(()=>{if(!this.isSeeking()){const t=this.updateProgress();this.emit("timeupdate",t),this.emit("audioprocess",t),null!=this.stopAtPosition&&this.isPlaying()&&t>=this.stopAtPosition&&this.pause();}})));}initPlayerEvents(){this.isPlaying()&&(this.emit("play"),this.timer.start()),this.mediaSubscriptions.push(this.onMediaEvent("timeupdate",(()=>{const t=this.updateProgress();this.emit("timeupdate",t);})),this.onMediaEvent("play",(()=>{this.emit("play"),this.timer.start();})),this.onMediaEvent("pause",(()=>{this.emit("pause"),this.timer.stop(),this.stopAtPosition=null;})),this.onMediaEvent("emptied",(()=>{this.timer.stop(),this.stopAtPosition=null;})),this.onMediaEvent("ended",(()=>{this.emit("timeupdate",this.getDuration()),this.emit("finish"),this.stopAtPosition=null;})),this.onMediaEvent("seeking",(()=>{this.emit("seeking",this.getCurrentTime());})),this.onMediaEvent("error",(()=>{var t;this.emit("error",null!==(t=this.getMediaElement().error)&&void 0!==t?t:new Error("Media error")),this.stopAtPosition=null;})));}initRendererEvents(){this.subscriptions.push(this.renderer.on("click",((t,e)=>{this.options.interact&&(this.seekTo(t),this.emit("interaction",t*this.getDuration()),this.emit("click",t,e));})),this.renderer.on("dblclick",((t,e)=>{this.emit("dblclick",t,e);})),this.renderer.on("scroll",((t,e,i,s)=>{const n=this.getDuration();this.emit("scroll",t*n,e*n,i,s);})),this.renderer.on("render",(()=>{this.emit("redraw");})),this.renderer.on("rendered",(()=>{this.emit("redrawcomplete");})),this.renderer.on("dragstart",(t=>{this.emit("dragstart",t);})),this.renderer.on("dragend",(t=>{this.emit("dragend",t);})));{let t;this.subscriptions.push(this.renderer.on("drag",(e=>{if(!this.options.interact)return;let i;this.renderer.renderProgress(e),clearTimeout(t),this.isPlaying()?i=0:true===this.options.dragToSeek?i=200:"object"==typeof this.options.dragToSeek&&void 0!==this.options.dragToSeek&&(i=this.options.dragToSeek.debounceTime),t=setTimeout((()=>{this.seekTo(e);}),i),this.emit("interaction",e*this.getDuration()),this.emit("drag",e);})));}}initPlugins(){var t;(null===(t=this.options.plugins)||void 0===t?void 0:t.length)&&this.options.plugins.forEach((t=>{this.registerPlugin(t);}));}unsubscribePlayerEvents(){this.mediaSubscriptions.forEach((t=>t())),this.mediaSubscriptions=[];}setOptions(t){this.options=Object.assign({},this.options,t),t.duration&&!t.peaks&&(this.decodedData=i$8.createBuffer(this.exportPeaks(),t.duration)),t.peaks&&t.duration&&(this.decodedData=i$8.createBuffer(t.peaks,t.duration)),this.renderer.setOptions(this.options),t.audioRate&&this.setPlaybackRate(t.audioRate),null!=t.mediaControls&&(this.getMediaElement().controls=t.mediaControls);}registerPlugin(t){return t._init(this),this.plugins.push(t),this.subscriptions.push(t.once("destroy",(()=>{this.plugins=this.plugins.filter((e=>e!==t));}))),t}getWrapper(){return this.renderer.getWrapper()}getWidth(){return this.renderer.getWidth()}getScroll(){return this.renderer.getScroll()}setScroll(t){return this.renderer.setScroll(t)}setScrollTime(t){const e=t/this.getDuration();this.renderer.setScrollPercentage(e);}getActivePlugins(){return this.plugins}loadAudio(e,s,n,r){return t$8(this,void 0,void 0,(function*(){var t;if(this.emit("load",e),!this.options.media&&this.isPlaying()&&this.pause(),this.decodedData=null,this.stopAtPosition=null,!s&&!n){const i=this.options.fetchParams||{};window.AbortController&&!i.signal&&(this.abortController=new AbortController,i.signal=null===(t=this.abortController)||void 0===t?void 0:t.signal);const n=t=>this.emit("loading",t);s=yield o$4.fetchBlob(e,n,i);const r=this.options.blobMimeType;r&&(s=new Blob([s],{type:r}));}this.setSrc(e,s);const a=yield new Promise((t=>{const e=r||this.getDuration();e?t(e):this.mediaSubscriptions.push(this.onMediaEvent("loadedmetadata",(()=>t(this.getDuration())),{once:true}));}));if(!e&&!s){const t=this.getMediaElement();t instanceof d$1&&(t.duration=a);}if(n)this.decodedData=i$8.createBuffer(n,a||0);else if(s){const t=yield s.arrayBuffer();this.decodedData=yield i$8.decode(t,this.options.sampleRate);}this.decodedData&&(this.emit("decode",this.getDuration()),this.renderer.render(this.decodedData)),this.emit("ready",this.getDuration());}))}load(e,i,s){return t$8(this,void 0,void 0,(function*(){try{return yield this.loadAudio(e,void 0,i,s)}catch(t){throw this.emit("error",t),t}}))}loadBlob(e,i,s){return t$8(this,void 0,void 0,(function*(){try{return yield this.loadAudio("",e,i,s)}catch(t){throw this.emit("error",t),t}}))}zoom(t){if(!this.decodedData)throw new Error("No audio loaded");this.renderer.zoom(t),this.emit("zoom",t);}getDecodedData(){return this.decodedData}exportPeaks({channels:t=2,maxLength:e=8e3,precision:i=1e4}={}){if(!this.decodedData)throw new Error("The audio has not been decoded yet");const s=Math.min(t,this.decodedData.numberOfChannels),n=[];for(let t=0;t<s;t++){const s=this.decodedData.getChannelData(t),r=[],o=s.length/e;for(let t=0;t<e;t++){const e=s.slice(Math.floor(t*o),Math.ceil((t+1)*o));let n=0;for(let t=0;t<e.length;t++){const i=e[t];Math.abs(i)>Math.abs(n)&&(n=i);}r.push(Math.round(n*i)/i);}n.push(r);}return n}getDuration(){let t=super.getDuration()||0;return 0!==t&&t!==1/0||!this.decodedData||(t=this.decodedData.duration),t}toggleInteraction(t){this.options.interact=t;}setTime(t){this.stopAtPosition=null,super.setTime(t),this.updateProgress(t),this.emit("timeupdate",t);}seekTo(t){const e=this.getDuration()*t;this.setTime(e);}play(e,i){const s=Object.create(null,{play:{get:()=>super.play}});return t$8(this,void 0,void 0,(function*(){null!=e&&this.setTime(e);const t=yield s.play.call(this);return null!=i&&(this.media instanceof d$1?this.media.stopAt(i):this.stopAtPosition=i),t}))}playPause(){return t$8(this,void 0,void 0,(function*(){return this.isPlaying()?this.pause():this.play()}))}stop(){this.pause(),this.setTime(0);}skip(t){this.setTime(this.getCurrentTime()+t);}empty(){this.load("",[[0]],.001);}setMediaElement(t){this.unsubscribePlayerEvents(),super.setMediaElement(t),this.initPlayerEvents();}exportImage(){return t$8(this,arguments,void 0,(function*(t="image/png",e=1,i="dataURL"){return this.renderer.exportImage(t,e,i)}))}destroy(){var t;this.emit("destroy"),null===(t=this.abortController)||void 0===t||t.abort(),this.plugins.forEach((t=>t.destroy())),this.subscriptions.forEach((t=>t())),this.unsubscribePlayerEvents(),this.timer.destroy(),this.renderer.destroy(),super.destroy();}};u$1.BasePlugin=class extends e$8{constructor(t){super(),this.subscriptions=[],this.options=t;}onInit(){}_init(t){this.wavesurfer=t,this.onInit();}destroy(){this.emit("destroy"),this.subscriptions.forEach((t=>t()));}},u$1.dom=r$7;

    var wavesurfer_esm = /*#__PURE__*/Object.freeze({
        __proto__: null,
        default: u$1
    });

    let t$7 = class t{constructor(){this.listeners={};}on(t,e,i){if(this.listeners[t]||(this.listeners[t]=new Set),this.listeners[t].add(e),null==i?void 0:i.once){const i=()=>{this.un(t,i),this.un(t,e);};return this.on(t,i),i}return ()=>this.un(t,e)}un(t,e){var i;null===(i=this.listeners[t])||void 0===i||i.delete(e);}once(t,e){return this.on(t,e,{once:true})}unAll(){this.listeners={};}emit(t,...e){this.listeners[t]&&this.listeners[t].forEach((t=>t(...e)));}};let e$7 = class e extends t$7{constructor(t){super(),this.subscriptions=[],this.options=t;}onInit(){}_init(t){this.wavesurfer=t,this.onInit();}destroy(){this.emit("destroy"),this.subscriptions.forEach((t=>t()));}};function i$7(t,e,i,n,s=3,r=0,o=100){if(!t)return ()=>{};const a=matchMedia("(pointer: coarse)").matches;let h=()=>{};const l=l=>{if(l.button!==r)return;l.preventDefault(),l.stopPropagation();let d=l.clientX,c=l.clientY,u=false;const v=Date.now(),g=n=>{if(n.preventDefault(),n.stopPropagation(),a&&Date.now()-v<o)return;const r=n.clientX,h=n.clientY,l=r-d,g=h-c;if(u||Math.abs(l)>s||Math.abs(g)>s){const n=t.getBoundingClientRect(),{left:s,top:o}=n;u||(null==i||i(d-s,c-o),u=true),e(l,g,r-s,h-o),d=r,c=h;}},p=e=>{if(u){const i=e.clientX,s=e.clientY,r=t.getBoundingClientRect(),{left:o,top:a}=r;null==n||n(i-o,s-a);}h();},m=t=>{t.relatedTarget&&t.relatedTarget!==document.documentElement||p(t);},f=t=>{u&&(t.stopPropagation(),t.preventDefault());},b=t=>{u&&t.preventDefault();};document.addEventListener("pointermove",g),document.addEventListener("pointerup",p),document.addEventListener("pointerout",m),document.addEventListener("pointercancel",m),document.addEventListener("touchmove",b,{passive:false}),document.addEventListener("click",f,{capture:true}),h=()=>{document.removeEventListener("pointermove",g),document.removeEventListener("pointerup",p),document.removeEventListener("pointerout",m),document.removeEventListener("pointercancel",m),document.removeEventListener("touchmove",b),setTimeout((()=>{document.removeEventListener("click",f,{capture:true});}),10);};};return t.addEventListener("pointerdown",l),()=>{h(),t.removeEventListener("pointerdown",l);}}function n$5(t,e){const i=e.xmlns?document.createElementNS(e.xmlns,t):document.createElement(t);for(const[t,s]of Object.entries(e))if("children"===t)for(const[t,s]of Object.entries(e))"string"==typeof s?i.appendChild(document.createTextNode(s)):i.appendChild(n$5(t,s));else "style"===t?Object.assign(i.style,s):"textContent"===t?i.textContent=s:i.setAttribute(t,s.toString());return i}function s$7(t,e,i){const s=n$5(t,e||{});return null==i||i.appendChild(s),s}let r$6 = class r extends t$7{constructor(t,e,i=0){var n,s,r,o,a,h,l,d,c,u;super(),this.totalDuration=e,this.numberOfChannels=i,this.minLength=0,this.maxLength=1/0,this.contentEditable=false,this.subscriptions=[],this.subscriptions=[],this.id=t.id||`region-${Math.random().toString(32).slice(2)}`,this.start=this.clampPosition(t.start),this.end=this.clampPosition(null!==(n=t.end)&&void 0!==n?n:t.start),this.drag=null===(s=t.drag)||void 0===s||s,this.resize=null===(r=t.resize)||void 0===r||r,this.resizeStart=null===(o=t.resizeStart)||void 0===o||o,this.resizeEnd=null===(a=t.resizeEnd)||void 0===a||a,this.color=null!==(h=t.color)&&void 0!==h?h:"rgba(0, 0, 0, 0.1)",this.minLength=null!==(l=t.minLength)&&void 0!==l?l:this.minLength,this.maxLength=null!==(d=t.maxLength)&&void 0!==d?d:this.maxLength,this.channelIdx=null!==(c=t.channelIdx)&&void 0!==c?c:-1,this.contentEditable=null!==(u=t.contentEditable)&&void 0!==u?u:this.contentEditable,this.element=this.initElement(),this.setContent(t.content),this.setPart(),this.renderPosition(),this.initMouseEvents();}clampPosition(t){return Math.max(0,Math.min(this.totalDuration,t))}setPart(){const t=this.start===this.end;this.element.setAttribute("part",`${t?"marker":"region"} ${this.id}`);}addResizeHandles(t){const e={position:"absolute",zIndex:"2",width:"6px",height:"100%",top:"0",cursor:"ew-resize",wordBreak:"keep-all"},n=s$7("div",{part:"region-handle region-handle-left",style:Object.assign(Object.assign({},e),{left:"0",borderLeft:"2px solid rgba(0, 0, 0, 0.5)",borderRadius:"2px 0 0 2px"})},t),r=s$7("div",{part:"region-handle region-handle-right",style:Object.assign(Object.assign({},e),{right:"0",borderRight:"2px solid rgba(0, 0, 0, 0.5)",borderRadius:"0 2px 2px 0"})},t);this.subscriptions.push(i$7(n,(t=>this.onResize(t,"start")),(()=>null),(()=>this.onEndResizing()),1),i$7(r,(t=>this.onResize(t,"end")),(()=>null),(()=>this.onEndResizing()),1));}removeResizeHandles(t){const e=t.querySelector('[part*="region-handle-left"]'),i=t.querySelector('[part*="region-handle-right"]');e&&t.removeChild(e),i&&t.removeChild(i);}initElement(){const t=this.start===this.end;let e=0,i=100;this.channelIdx>=0&&this.channelIdx<this.numberOfChannels&&(i=100/this.numberOfChannels,e=i*this.channelIdx);const n=s$7("div",{style:{position:"absolute",top:`${e}%`,height:`${i}%`,backgroundColor:t?"none":this.color,borderLeft:t?"2px solid "+this.color:"none",borderRadius:"2px",boxSizing:"border-box",transition:"background-color 0.2s ease",cursor:this.drag?"grab":"default",pointerEvents:"all"}});return !t&&this.resize&&this.addResizeHandles(n),n}renderPosition(){const t=this.start/this.totalDuration,e=(this.totalDuration-this.end)/this.totalDuration;this.element.style.left=100*t+"%",this.element.style.right=100*e+"%";}toggleCursor(t){var e;this.drag&&(null===(e=this.element)||void 0===e?void 0:e.style)&&(this.element.style.cursor=t?"grabbing":"grab");}initMouseEvents(){const{element:t}=this;t&&(t.addEventListener("click",(t=>this.emit("click",t))),t.addEventListener("mouseenter",(t=>this.emit("over",t))),t.addEventListener("mouseleave",(t=>this.emit("leave",t))),t.addEventListener("dblclick",(t=>this.emit("dblclick",t))),t.addEventListener("pointerdown",(()=>this.toggleCursor(true))),t.addEventListener("pointerup",(()=>this.toggleCursor(false))),this.subscriptions.push(i$7(t,(t=>this.onMove(t)),(()=>this.toggleCursor(true)),(()=>{this.toggleCursor(false),this.drag&&this.emit("update-end");}))),this.contentEditable&&this.content&&(this.content.addEventListener("click",(t=>this.onContentClick(t))),this.content.addEventListener("blur",(()=>this.onContentBlur()))));}_onUpdate(t,e){if(!this.element.parentElement)return;const{width:i}=this.element.parentElement.getBoundingClientRect(),n=t/i*this.totalDuration,s=e&&"start"!==e?this.start:this.start+n,r=e&&"end"!==e?this.end:this.end+n,o=r-s;s>=0&&r<=this.totalDuration&&s<=r&&o>=this.minLength&&o<=this.maxLength&&(this.start=s,this.end=r,this.renderPosition(),this.emit("update",e));}onMove(t){this.drag&&this._onUpdate(t);}onResize(t,e){this.resize&&(this.resizeStart||"start"!==e)&&(this.resizeEnd||"end"!==e)&&this._onUpdate(t,e);}onEndResizing(){this.resize&&this.emit("update-end");}onContentClick(t){t.stopPropagation();t.target.focus(),this.emit("click",t);}onContentBlur(){this.emit("update-end");}_setTotalDuration(t){this.totalDuration=t,this.renderPosition();}play(t){this.emit("play",t&&this.end!==this.start?this.end:void 0);}getContent(t=false){var e;return t?this.content||void 0:this.element instanceof HTMLElement?(null===(e=this.content)||void 0===e?void 0:e.innerHTML)||void 0:""}setContent(t){var e;if(null===(e=this.content)||void 0===e||e.remove(),t){if("string"==typeof t){const e=this.start===this.end;this.content=s$7("div",{style:{padding:`0.2em ${e?.2:.4}em`,display:"inline-block"},textContent:t});}else this.content=t;this.contentEditable&&(this.content.contentEditable="true"),this.content.setAttribute("part","region-content"),this.element.appendChild(this.content),this.emit("content-changed");}else this.content=void 0;}setOptions(t){var e,i;if(t.color&&(this.color=t.color,this.element.style.backgroundColor=this.color),void 0!==t.drag&&(this.drag=t.drag,this.element.style.cursor=this.drag?"grab":"default"),void 0!==t.start||void 0!==t.end){const n=this.start===this.end;this.start=this.clampPosition(null!==(e=t.start)&&void 0!==e?e:this.start),this.end=this.clampPosition(null!==(i=t.end)&&void 0!==i?i:n?this.start:this.end),this.renderPosition(),this.setPart();}if(t.content&&this.setContent(t.content),t.id&&(this.id=t.id,this.setPart()),void 0!==t.resize&&t.resize!==this.resize){const e=this.start===this.end;this.resize=t.resize,this.resize&&!e?this.addResizeHandles(this.element):this.removeResizeHandles(this.element);} void 0!==t.resizeStart&&(this.resizeStart=t.resizeStart),void 0!==t.resizeEnd&&(this.resizeEnd=t.resizeEnd);}remove(){this.emit("remove"),this.subscriptions.forEach((t=>t())),this.element.remove(),this.element=null;}};let o$3 = class o extends e$7{constructor(t){super(t),this.regions=[],this.regionsContainer=this.initRegionsContainer();}static create(t){return new o(t)}onInit(){if(!this.wavesurfer)throw Error("WaveSurfer is not initialized");this.wavesurfer.getWrapper().appendChild(this.regionsContainer);let t=[];this.subscriptions.push(this.wavesurfer.on("timeupdate",(e=>{const i=this.regions.filter((t=>t.start<=e&&(t.end===t.start?t.start+.05:t.end)>=e));i.forEach((e=>{t.includes(e)||this.emit("region-in",e);})),t.forEach((t=>{i.includes(t)||this.emit("region-out",t);})),t=i;})));}initRegionsContainer(){return s$7("div",{style:{position:"absolute",top:"0",left:"0",width:"100%",height:"100%",zIndex:"5",pointerEvents:"none"}})}getRegions(){return this.regions}avoidOverlapping(t){t.content&&setTimeout((()=>{const e=t.content,i=e.getBoundingClientRect(),n=this.regions.map((e=>{if(e===t||!e.content)return 0;const n=e.content.getBoundingClientRect();return i.left<n.left+n.width&&n.left<i.left+i.width?n.height:0})).reduce(((t,e)=>t+e),0);e.style.marginTop=`${n}px`;}),10);}adjustScroll(t){var e,i;const n=null===(i=null===(e=this.wavesurfer)||void 0===e?void 0:e.getWrapper())||void 0===i?void 0:i.parentElement;if(!n)return;const{clientWidth:s,scrollWidth:r}=n;if(r<=s)return;const o=n.getBoundingClientRect(),a=t.element.getBoundingClientRect(),h=a.left-o.left,l=a.right-o.left;h<0?n.scrollLeft+=h:l>s&&(n.scrollLeft+=l-s);}virtualAppend(t,e,i){const n=()=>{if(!this.wavesurfer)return;const n=this.wavesurfer.getWidth(),s=this.wavesurfer.getScroll(),r=e.clientWidth,o=this.wavesurfer.getDuration(),a=Math.round(t.start/o*r),h=a+(Math.round((t.end-t.start)/o*r)||1)>s&&a<s+n;h&&!i.parentElement?e.appendChild(i):!h&&i.parentElement&&i.remove();};setTimeout((()=>{if(!this.wavesurfer)return;n();const e=this.wavesurfer.on("scroll",n);this.subscriptions.push(t.once("remove",e),e);}),0);}saveRegion(t){this.virtualAppend(t,this.regionsContainer,t.element),this.avoidOverlapping(t),this.regions.push(t);const e=[t.on("update",(e=>{e||this.adjustScroll(t),this.emit("region-update",t,e);})),t.on("update-end",(()=>{this.avoidOverlapping(t),this.emit("region-updated",t);})),t.on("play",(e=>{var i;null===(i=this.wavesurfer)||void 0===i||i.play(t.start,e);})),t.on("click",(e=>{this.emit("region-clicked",t,e);})),t.on("dblclick",(e=>{this.emit("region-double-clicked",t,e);})),t.on("content-changed",(()=>{this.emit("region-content-changed",t);})),t.once("remove",(()=>{e.forEach((t=>t())),this.regions=this.regions.filter((e=>e!==t)),this.emit("region-removed",t);}))];this.subscriptions.push(...e),this.emit("region-created",t);}addRegion(t){var e,i;if(!this.wavesurfer)throw Error("WaveSurfer is not initialized");const n=this.wavesurfer.getDuration(),s=null===(i=null===(e=this.wavesurfer)||void 0===e?void 0:e.getDecodedData())||void 0===i?void 0:i.numberOfChannels,o=new r$6(t,n,s);return this.emit("region-initialized",o),n?this.saveRegion(o):this.subscriptions.push(this.wavesurfer.once("ready",(t=>{o._setTotalDuration(t),this.saveRegion(o);}))),o}enableDragSelection(t,e=3){var n;const s=null===(n=this.wavesurfer)||void 0===n?void 0:n.getWrapper();if(!(s&&s instanceof HTMLElement))return ()=>{};let o=null,a=0;return i$7(s,((t,e,i)=>{o&&o._onUpdate(t,i>a?"end":"start");}),(e=>{var i,n;if(a=e,!this.wavesurfer)return;const s=this.wavesurfer.getDuration(),h=null===(n=null===(i=this.wavesurfer)||void 0===i?void 0:i.getDecodedData())||void 0===n?void 0:n.numberOfChannels,{width:l}=this.wavesurfer.getWrapper().getBoundingClientRect(),d=e/l*s,c=(e+5)/l*s;o=new r$6(Object.assign(Object.assign({},t),{start:d,end:c}),s,h),this.emit("region-initialized",o),this.regionsContainer.appendChild(o.element);}),(()=>{o&&(this.saveRegion(o),o=null);}),e)}clearRegions(){this.regions.slice().forEach((t=>t.remove())),this.regions=[];}destroy(){this.clearRegions(),super.destroy(),this.regionsContainer.remove();}};

    let t$6 = class t{constructor(){this.listeners={};}on(t,e,i){if(this.listeners[t]||(this.listeners[t]=new Set),this.listeners[t].add(e),null==i?void 0:i.once){const i=()=>{this.un(t,i),this.un(t,e);};return this.on(t,i),i}return ()=>this.un(t,e)}un(t,e){var i;null===(i=this.listeners[t])||void 0===i||i.delete(e);}once(t,e){return this.on(t,e,{once:true})}unAll(){this.listeners={};}emit(t,...e){this.listeners[t]&&this.listeners[t].forEach((t=>t(...e)));}};let e$6 = class e extends t$6{constructor(t){super(),this.subscriptions=[],this.options=t;}onInit(){}_init(t){this.wavesurfer=t,this.onInit();}destroy(){this.emit("destroy"),this.subscriptions.forEach((t=>t()));}};function i$6(t,e){const n=e.xmlns?document.createElementNS(e.xmlns,t):document.createElement(t);for(const[t,s]of Object.entries(e))if("children"===t)for(const[t,s]of Object.entries(e))"string"==typeof s?n.appendChild(document.createTextNode(s)):n.appendChild(i$6(t,s));else "style"===t?Object.assign(n.style,s):"textContent"===t?n.textContent=s:n.setAttribute(t,s.toString());return n}function n$4(t,e,n){return i$6(t,e||{})}const s$6={height:20,timeOffset:0,formatTimeCallback:t=>{if(t/60>1){return `${Math.floor(t/60)}:${`${(t=Math.round(t%60))<10?"0":""}${t}`}`}return `${Math.round(1e3*t)/1e3}`}};let r$5 = class r extends e$6{constructor(t){super(t||{}),this.options=Object.assign({},s$6,t),this.timelineWrapper=this.initTimelineWrapper();}static create(t){return new r(t)}onInit(){var t;if(!this.wavesurfer)throw Error("WaveSurfer is not initialized");let e=this.wavesurfer.getWrapper();if(this.options.container instanceof HTMLElement)e=this.options.container;else if("string"==typeof this.options.container){const t=document.querySelector(this.options.container);if(!t)throw Error(`No Timeline container found matching ${this.options.container}`);e=t;}this.options.insertPosition?(e.firstElementChild||e).insertAdjacentElement(this.options.insertPosition,this.timelineWrapper):e.appendChild(this.timelineWrapper),this.subscriptions.push(this.wavesurfer.on("redraw",(()=>this.initTimeline()))),((null===(t=this.wavesurfer)||void 0===t?void 0:t.getDuration())||this.options.duration)&&this.initTimeline();}destroy(){this.timelineWrapper.remove(),super.destroy();}initTimelineWrapper(){return n$4("div",{part:"timeline-wrapper",style:{pointerEvents:"none"}})}defaultTimeInterval(t){return t>=25?1:5*t>=25?5:15*t>=25?15:60*Math.ceil(.5/t)}defaultPrimaryLabelInterval(t){return t>=25?10:5*t>=25?6:4}defaultSecondaryLabelInterval(t){return t>=25?5:2}virtualAppend(t,e,i){let n=false;const s=(s,r)=>{if(!this.wavesurfer)return;const o=i.clientWidth,l=t>s&&t+o<r;l!==n&&(n=l,l?e.appendChild(i):i.remove());};if(!this.wavesurfer)return;const r=this.wavesurfer.getScroll(),o=r+this.wavesurfer.getWidth();s(r,o),this.subscriptions.push(this.wavesurfer.on("scroll",((t,e,i,n)=>{s(i,n);})));}initTimeline(){var t,e,i,s,r,o,l,a;const h=null!==(i=null!==(e=null===(t=this.wavesurfer)||void 0===t?void 0:t.getDuration())&&void 0!==e?e:this.options.duration)&&void 0!==i?i:0,p=((null===(s=this.wavesurfer)||void 0===s?void 0:s.getWrapper().scrollWidth)||this.timelineWrapper.scrollWidth)/h,u=null!==(r=this.options.timeInterval)&&void 0!==r?r:this.defaultTimeInterval(p),c=null!==(o=this.options.primaryLabelInterval)&&void 0!==o?o:this.defaultPrimaryLabelInterval(p),d=this.options.primaryLabelSpacing,f=null!==(l=this.options.secondaryLabelInterval)&&void 0!==l?l:this.defaultSecondaryLabelInterval(p),v=this.options.secondaryLabelSpacing,m="beforebegin"===this.options.insertPosition,y=n$4("div",{style:Object.assign({height:`${this.options.height}px`,overflow:"hidden",fontSize:this.options.height/2+"px",whiteSpace:"nowrap"},m?{position:"absolute",top:"0",left:"0",right:"0",zIndex:"2"}:{position:"relative"})});y.setAttribute("part","timeline"),"string"==typeof this.options.style?y.setAttribute("style",y.getAttribute("style")+this.options.style):"object"==typeof this.options.style&&Object.assign(y.style,this.options.style);const b=n$4("div",{style:{width:"0",height:"50%",display:"flex",flexDirection:"column",justifyContent:m?"flex-start":"flex-end",top:m?"0":"auto",bottom:m?"auto":"0",overflow:"visible",borderLeft:"1px solid currentColor",opacity:`${null!==(a=this.options.secondaryLabelOpacity)&&void 0!==a?a:.25}`,position:"absolute",zIndex:"1"}});for(let t=0,e=0;t<h;t+=u,e++){const i=b.cloneNode(),n=Math.round(100*t)%Math.round(100*c)==0||d&&e%d==0,s=Math.round(100*t)%Math.round(100*f)==0||v&&e%v==0;(n||s)&&(i.style.height="100%",i.style.textIndent="3px",i.textContent=this.options.formatTimeCallback(t),n&&(i.style.opacity="1"));const r=n?"primary":s?"secondary":"tick";i.setAttribute("part",`timeline-notch timeline-notch-${r}`);const o=Math.round(100*(t+this.options.timeOffset))/100*p;i.style.left=`${o}px`,this.virtualAppend(o,y,i);}this.timelineWrapper.innerHTML="",this.timelineWrapper.appendChild(y),this.emit("ready");}};

    let t$5 = class t{constructor(){this.listeners={};}on(t,e,i){if(this.listeners[t]||(this.listeners[t]=new Set),this.listeners[t].add(e),null==i?void 0:i.once){const i=()=>{this.un(t,i),this.un(t,e);};return this.on(t,i),i}return ()=>this.un(t,e)}un(t,e){var i;null===(i=this.listeners[t])||void 0===i||i.delete(e);}once(t,e){return this.on(t,e,{once:true})}unAll(){this.listeners={};}emit(t,...e){this.listeners[t]&&this.listeners[t].forEach((t=>t(...e)));}};let e$5 = class e extends t$5{constructor(t){super(),this.subscriptions=[],this.options=t;}onInit(){}_init(t){this.wavesurfer=t,this.onInit();}destroy(){this.emit("destroy"),this.subscriptions.forEach((t=>t()));}};function i$5(t,e,i,s){return new(i||(i=Promise))((function(n,r){function o(t){try{h(s.next(t));}catch(t){r(t);}}function a(t){try{h(s.throw(t));}catch(t){r(t);}}function h(t){var e;t.done?n(t.value):(e=t.value,e instanceof i?e:new i((function(t){t(e);}))).then(o,a);}h((s=s.apply(t,e||[])).next());}))}"function"==typeof SuppressedError&&SuppressedError;const s$5={decode:function(t,e){return i$5(this,void 0,void 0,(function*(){const i=new AudioContext({sampleRate:e});return i.decodeAudioData(t).finally((()=>i.close()))}))},createBuffer:function(t,e){return "number"==typeof t[0]&&(t=[t]),function(t){const e=t[0];if(e.some((t=>t>1||t<-1))){const i=e.length;let s=0;for(let t=0;t<i;t++){const i=Math.abs(e[t]);i>s&&(s=i);}for(const e of t)for(let t=0;t<i;t++)e[t]/=s;}}(t),{duration:e,length:t[0].length,sampleRate:t[0].length/e,numberOfChannels:t.length,getChannelData:e=>null==t?void 0:t[e],copyFromChannel:AudioBuffer.prototype.copyFromChannel,copyToChannel:AudioBuffer.prototype.copyToChannel}}};function n$3(t,e){const i=e.xmlns?document.createElementNS(e.xmlns,t):document.createElement(t);for(const[t,s]of Object.entries(e))if("children"===t)for(const[t,s]of Object.entries(e))"string"==typeof s?i.appendChild(document.createTextNode(s)):i.appendChild(n$3(t,s));else "style"===t?Object.assign(i.style,s):"textContent"===t?i.textContent=s:i.setAttribute(t,s.toString());return i}function r$4(t,e,i){const s=n$3(t,e||{});return null==i||i.appendChild(s),s}var o$2=Object.freeze({__proto__:null,createElement:r$4,default:r$4});const a$1={fetchBlob:function(t,e,s){return i$5(this,void 0,void 0,(function*(){const n=yield fetch(t,s);if(n.status>=400)throw new Error(`Failed to fetch ${t}: ${n.status} (${n.statusText})`);return function(t,e){i$5(this,void 0,void 0,(function*(){if(!t.body||!t.headers)return;const s=t.body.getReader(),n=Number(t.headers.get("Content-Length"))||0;let r=0;const o=t=>i$5(this,void 0,void 0,(function*(){r+=(null==t?void 0:t.length)||0;const i=Math.round(r/n*100);e(i);})),a=()=>i$5(this,void 0,void 0,(function*(){let t;try{t=yield s.read();}catch(t){return}t.done||(o(t.value),yield a());}));a();}));}(n.clone(),e),n.blob()}))}};let h$1 = class h extends t$5{constructor(t){super(),this.isExternalMedia=false,t.media?(this.media=t.media,this.isExternalMedia=true):this.media=document.createElement("audio"),t.mediaControls&&(this.media.controls=true),t.autoplay&&(this.media.autoplay=true),null!=t.playbackRate&&this.onMediaEvent("canplay",(()=>{null!=t.playbackRate&&(this.media.playbackRate=t.playbackRate);}),{once:true});}onMediaEvent(t,e,i){return this.media.addEventListener(t,e,i),()=>this.media.removeEventListener(t,e,i)}getSrc(){return this.media.currentSrc||this.media.src||""}revokeSrc(){const t=this.getSrc();t.startsWith("blob:")&&URL.revokeObjectURL(t);}canPlayType(t){return ""!==this.media.canPlayType(t)}setSrc(t,e){const i=this.getSrc();if(t&&i===t)return;this.revokeSrc();const s=e instanceof Blob&&(this.canPlayType(e.type)||!t)?URL.createObjectURL(e):t;i&&(this.media.src="");try{this.media.src=s;}catch(e){this.media.src=t;}}destroy(){this.isExternalMedia||(this.media.pause(),this.media.remove(),this.revokeSrc(),this.media.src="",this.media.load());}setMediaElement(t){this.media=t;}play(){return i$5(this,void 0,void 0,(function*(){return this.media.play()}))}pause(){this.media.pause();}isPlaying(){return !this.media.paused&&!this.media.ended}setTime(t){this.media.currentTime=Math.max(0,Math.min(t,this.getDuration()));}getDuration(){return this.media.duration}getCurrentTime(){return this.media.currentTime}getVolume(){return this.media.volume}setVolume(t){this.media.volume=t;}getMuted(){return this.media.muted}setMuted(t){this.media.muted=t;}getPlaybackRate(){return this.media.playbackRate}isSeeking(){return this.media.seeking}setPlaybackRate(t,e){null!=e&&(this.media.preservesPitch=e),this.media.playbackRate=t;}getMediaElement(){return this.media}setSinkId(t){return this.media.setSinkId(t)}};let l$1 = class l extends t$5{constructor(t,e){super(),this.timeouts=[],this.isScrollable=false,this.audioData=null,this.resizeObserver=null,this.lastContainerWidth=0,this.isDragging=false,this.subscriptions=[],this.unsubscribeOnScroll=[],this.subscriptions=[],this.options=t;const i=this.parentFromOptionsContainer(t.container);this.parent=i;const[s,n]=this.initHtml();i.appendChild(s),this.container=s,this.scrollContainer=n.querySelector(".scroll"),this.wrapper=n.querySelector(".wrapper"),this.canvasWrapper=n.querySelector(".canvases"),this.progressWrapper=n.querySelector(".progress"),this.cursor=n.querySelector(".cursor"),e&&n.appendChild(e),this.initEvents();}parentFromOptionsContainer(t){let e;if("string"==typeof t?e=document.querySelector(t):t instanceof HTMLElement&&(e=t),!e)throw new Error("Container not found");return e}initEvents(){const t=t=>{const e=this.wrapper.getBoundingClientRect(),i=t.clientX-e.left,s=t.clientY-e.top;return [i/e.width,s/e.height]};if(this.wrapper.addEventListener("click",(e=>{const[i,s]=t(e);this.emit("click",i,s);})),this.wrapper.addEventListener("dblclick",(e=>{const[i,s]=t(e);this.emit("dblclick",i,s);})),true!==this.options.dragToSeek&&"object"!=typeof this.options.dragToSeek||this.initDrag(),this.scrollContainer.addEventListener("scroll",(()=>{const{scrollLeft:t,scrollWidth:e,clientWidth:i}=this.scrollContainer,s=t/e,n=(t+i)/e;this.emit("scroll",s,n,t,t+i);})),"function"==typeof ResizeObserver){const t=this.createDelay(100);this.resizeObserver=new ResizeObserver((()=>{t().then((()=>this.onContainerResize())).catch((()=>{}));})),this.resizeObserver.observe(this.scrollContainer);}}onContainerResize(){const t=this.parent.clientWidth;t===this.lastContainerWidth&&"auto"!==this.options.height||(this.lastContainerWidth=t,this.reRender());}initDrag(){this.subscriptions.push(function(t,e,i,s,n=3,r=0,o=100){if(!t)return ()=>{};const a=matchMedia("(pointer: coarse)").matches;let h=()=>{};const l=l=>{if(l.button!==r)return;l.preventDefault(),l.stopPropagation();let d=l.clientX,c=l.clientY,u=false;const p=Date.now(),m=s=>{if(s.preventDefault(),s.stopPropagation(),a&&Date.now()-p<o)return;const r=s.clientX,h=s.clientY,l=r-d,m=h-c;if(u||Math.abs(l)>n||Math.abs(m)>n){const s=t.getBoundingClientRect(),{left:n,top:o}=s;u||(null==i||i(d-n,c-o),u=true),e(l,m,r-n,h-o),d=r,c=h;}},f=e=>{if(u){const i=e.clientX,n=e.clientY,r=t.getBoundingClientRect(),{left:o,top:a}=r;null==s||s(i-o,n-a);}h();},v=t=>{t.relatedTarget&&t.relatedTarget!==document.documentElement||f(t);},g=t=>{u&&(t.stopPropagation(),t.preventDefault());},b=t=>{u&&t.preventDefault();};document.addEventListener("pointermove",m),document.addEventListener("pointerup",f),document.addEventListener("pointerout",v),document.addEventListener("pointercancel",v),document.addEventListener("touchmove",b,{passive:false}),document.addEventListener("click",g,{capture:true}),h=()=>{document.removeEventListener("pointermove",m),document.removeEventListener("pointerup",f),document.removeEventListener("pointerout",v),document.removeEventListener("pointercancel",v),document.removeEventListener("touchmove",b),setTimeout((()=>{document.removeEventListener("click",g,{capture:true});}),10);};};return t.addEventListener("pointerdown",l),()=>{h(),t.removeEventListener("pointerdown",l);}}(this.wrapper,((t,e,i)=>{this.emit("drag",Math.max(0,Math.min(1,i/this.wrapper.getBoundingClientRect().width)));}),(t=>{this.isDragging=true,this.emit("dragstart",Math.max(0,Math.min(1,t/this.wrapper.getBoundingClientRect().width)));}),(t=>{this.isDragging=false,this.emit("dragend",Math.max(0,Math.min(1,t/this.wrapper.getBoundingClientRect().width)));})));}getHeight(t,e){var i;const s=(null===(i=this.audioData)||void 0===i?void 0:i.numberOfChannels)||1;if(null==t)return 128;if(!isNaN(Number(t)))return Number(t);if("auto"===t){const t=this.parent.clientHeight||128;return (null==e?void 0:e.every((t=>!t.overlay)))?t/s:t}return 128}initHtml(){const t=document.createElement("div"),e=t.attachShadow({mode:"open"}),i=this.options.cspNonce&&"string"==typeof this.options.cspNonce?this.options.cspNonce.replace(/"/g,""):"";return e.innerHTML=`\n      <style${i?` nonce="${i}"`:""}>\n        :host {\n          user-select: none;\n          min-width: 1px;\n        }\n        :host audio {\n          display: block;\n          width: 100%;\n        }\n        :host .scroll {\n          overflow-x: auto;\n          overflow-y: hidden;\n          width: 100%;\n          position: relative;\n        }\n        :host .noScrollbar {\n          scrollbar-color: transparent;\n          scrollbar-width: none;\n        }\n        :host .noScrollbar::-webkit-scrollbar {\n          display: none;\n          -webkit-appearance: none;\n        }\n        :host .wrapper {\n          position: relative;\n          overflow: visible;\n          z-index: 2;\n        }\n        :host .canvases {\n          min-height: ${this.getHeight(this.options.height,this.options.splitChannels)}px;\n        }\n        :host .canvases > div {\n          position: relative;\n        }\n        :host canvas {\n          display: block;\n          position: absolute;\n          top: 0;\n          image-rendering: pixelated;\n        }\n        :host .progress {\n          pointer-events: none;\n          position: absolute;\n          z-index: 2;\n          top: 0;\n          left: 0;\n          width: 0;\n          height: 100%;\n          overflow: hidden;\n        }\n        :host .progress > div {\n          position: relative;\n        }\n        :host .cursor {\n          pointer-events: none;\n          position: absolute;\n          z-index: 5;\n          top: 0;\n          left: 0;\n          height: 100%;\n          border-radius: 2px;\n        }\n      </style>\n\n      <div class="scroll" part="scroll">\n        <div class="wrapper" part="wrapper">\n          <div class="canvases" part="canvases"></div>\n          <div class="progress" part="progress"></div>\n          <div class="cursor" part="cursor"></div>\n        </div>\n      </div>\n    `,[t,e]}setOptions(t){if(this.options.container!==t.container){const e=this.parentFromOptionsContainer(t.container);e.appendChild(this.container),this.parent=e;} true!==t.dragToSeek&&"object"!=typeof this.options.dragToSeek||this.initDrag(),this.options=t,this.reRender();}getWrapper(){return this.wrapper}getWidth(){return this.scrollContainer.clientWidth}getScroll(){return this.scrollContainer.scrollLeft}setScroll(t){this.scrollContainer.scrollLeft=t;}setScrollPercentage(t){const{scrollWidth:e}=this.scrollContainer,i=e*t;this.setScroll(i);}destroy(){var t,e;this.subscriptions.forEach((t=>t())),this.container.remove(),null===(t=this.resizeObserver)||void 0===t||t.disconnect(),null===(e=this.unsubscribeOnScroll)||void 0===e||e.forEach((t=>t())),this.unsubscribeOnScroll=[];}createDelay(t=10){let e,i;const s=()=>{e&&clearTimeout(e),i&&i();};return this.timeouts.push(s),()=>new Promise(((n,r)=>{s(),i=r,e=setTimeout((()=>{e=void 0,i=void 0,n();}),t);}))}convertColorValues(t){if(!Array.isArray(t))return t||"";if(t.length<2)return t[0]||"";const e=document.createElement("canvas"),i=e.getContext("2d"),s=e.height*(window.devicePixelRatio||1),n=i.createLinearGradient(0,0,0,s),r=1/(t.length-1);return t.forEach(((t,e)=>{const i=e*r;n.addColorStop(i,t);})),n}getPixelRatio(){return Math.max(1,window.devicePixelRatio||1)}renderBarWaveform(t,e,i,s){const n=t[0],r=t[1]||t[0],o=n.length,{width:a,height:h}=i.canvas,l=h/2,d=this.getPixelRatio(),c=e.barWidth?e.barWidth*d:1,u=e.barGap?e.barGap*d:e.barWidth?c/2:0,p=e.barRadius||0,m=a/(c+u)/o,f=p&&"roundRect"in i?"roundRect":"rect";i.beginPath();let v=0,g=0,b=0;for(let t=0;t<=o;t++){const o=Math.round(t*m);if(o>v){const t=Math.round(g*l*s),n=t+Math.round(b*l*s)||1;let r=l-t;"top"===e.barAlign?r=0:"bottom"===e.barAlign&&(r=h-n),i[f](v*(c+u),r,c,n,p),v=o,g=0,b=0;}const a=Math.abs(n[t]||0),d=Math.abs(r[t]||0);a>g&&(g=a),d>b&&(b=d);}i.fill(),i.closePath();}renderLineWaveform(t,e,i,s){const n=e=>{const n=t[e]||t[0],r=n.length,{height:o}=i.canvas,a=o/2,h=i.canvas.width/r;i.moveTo(0,a);let l=0,d=0;for(let t=0;t<=r;t++){const r=Math.round(t*h);if(r>l){const t=a+(Math.round(d*a*s)||1)*(0===e?-1:1);i.lineTo(l,t),l=r,d=0;}const o=Math.abs(n[t]||0);o>d&&(d=o);}i.lineTo(l,a);};i.beginPath(),n(0),n(1),i.fill(),i.closePath();}renderWaveform(t,e,i){if(i.fillStyle=this.convertColorValues(e.waveColor),e.renderFunction)return void e.renderFunction(t,i);let s=e.barHeight||1;if(e.normalize){const e=Array.from(t[0]).reduce(((t,e)=>Math.max(t,Math.abs(e))),0);s=e?1/e:1;}e.barWidth||e.barGap||e.barAlign?this.renderBarWaveform(t,e,i,s):this.renderLineWaveform(t,e,i,s);}renderSingleCanvas(t,e,i,s,n,r,o){const a=this.getPixelRatio(),h=document.createElement("canvas");h.width=Math.round(i*a),h.height=Math.round(s*a),h.style.width=`${i}px`,h.style.height=`${s}px`,h.style.left=`${Math.round(n)}px`,r.appendChild(h);const l=h.getContext("2d");if(this.renderWaveform(t,e,l),h.width>0&&h.height>0){const t=h.cloneNode(),i=t.getContext("2d");i.drawImage(h,0,0),i.globalCompositeOperation="source-in",i.fillStyle=this.convertColorValues(e.progressColor),i.fillRect(0,0,h.width,h.height),o.appendChild(t);}}renderMultiCanvas(t,e,i,s,n,r){const o=this.getPixelRatio(),{clientWidth:a}=this.scrollContainer,h=i/o;let d=Math.min(l.MAX_CANVAS_WIDTH,a,h),c={};if(0===d)return;if(e.barWidth||e.barGap){const t=e.barWidth||.5,i=t+(e.barGap||t/2);d%i!=0&&(d=Math.floor(d/i)*i);}const u=i=>{if(i<0||i>=p)return;if(c[i])return;c[i]=true;const o=i*d,a=Math.min(h-o,d);if(a<=0)return;const l=t.map((t=>{const e=Math.floor(o/h*t.length),i=Math.floor((o+a)/h*t.length);return t.slice(e,i)}));this.renderSingleCanvas(l,e,a,s,o,n,r);},p=Math.ceil(h/d);if(!this.isScrollable){for(let t=0;t<p;t++)u(t);return}const m=this.scrollContainer.scrollLeft/h,f=Math.floor(m*p);if(u(f-1),u(f),u(f+1),p>1){const t=this.on("scroll",(()=>{const{scrollLeft:t}=this.scrollContainer,e=Math.floor(t/h*p);Object.keys(c).length>l.MAX_NODES&&(n.innerHTML="",r.innerHTML="",c={}),u(e-1),u(e),u(e+1);}));this.unsubscribeOnScroll.push(t);}}renderChannel(t,e,i,s){var{overlay:n}=e,r=function(t,e){var i={};for(var s in t)Object.prototype.hasOwnProperty.call(t,s)&&e.indexOf(s)<0&&(i[s]=t[s]);if(null!=t&&"function"==typeof Object.getOwnPropertySymbols){var n=0;for(s=Object.getOwnPropertySymbols(t);n<s.length;n++)e.indexOf(s[n])<0&&Object.prototype.propertyIsEnumerable.call(t,s[n])&&(i[s[n]]=t[s[n]]);}return i}(e,["overlay"]);const o=document.createElement("div"),a=this.getHeight(r.height,r.splitChannels);o.style.height=`${a}px`,n&&s>0&&(o.style.marginTop=`-${a}px`),this.canvasWrapper.style.minHeight=`${a}px`,this.canvasWrapper.appendChild(o);const h=o.cloneNode();this.progressWrapper.appendChild(h),this.renderMultiCanvas(t,r,i,a,o,h);}render(t){return i$5(this,void 0,void 0,(function*(){var e;this.timeouts.forEach((t=>t())),this.timeouts=[],this.canvasWrapper.innerHTML="",this.progressWrapper.innerHTML="",null!=this.options.width&&(this.scrollContainer.style.width="number"==typeof this.options.width?`${this.options.width}px`:this.options.width);const i=this.getPixelRatio(),s=this.scrollContainer.clientWidth,n=Math.ceil(t.duration*(this.options.minPxPerSec||0));this.isScrollable=n>s;const r=this.options.fillParent&&!this.isScrollable,o=(r?s:n)*i;if(this.wrapper.style.width=r?"100%":`${n}px`,this.scrollContainer.style.overflowX=this.isScrollable?"auto":"hidden",this.scrollContainer.classList.toggle("noScrollbar",!!this.options.hideScrollbar),this.cursor.style.backgroundColor=`${this.options.cursorColor||this.options.progressColor}`,this.cursor.style.width=`${this.options.cursorWidth}px`,this.audioData=t,this.emit("render"),this.options.splitChannels)for(let i=0;i<t.numberOfChannels;i++){const s=Object.assign(Object.assign({},this.options),null===(e=this.options.splitChannels)||void 0===e?void 0:e[i]);this.renderChannel([t.getChannelData(i)],s,o,i);}else {const e=[t.getChannelData(0)];t.numberOfChannels>1&&e.push(t.getChannelData(1)),this.renderChannel(e,this.options,o,0);}Promise.resolve().then((()=>this.emit("rendered")));}))}reRender(){if(this.unsubscribeOnScroll.forEach((t=>t())),this.unsubscribeOnScroll=[],!this.audioData)return;const{scrollWidth:t}=this.scrollContainer,{right:e}=this.progressWrapper.getBoundingClientRect();if(this.render(this.audioData),this.isScrollable&&t!==this.scrollContainer.scrollWidth){const{right:t}=this.progressWrapper.getBoundingClientRect();let i=t-e;i*=2,i=i<0?Math.floor(i):Math.ceil(i),i/=2,this.scrollContainer.scrollLeft+=i;}}zoom(t){this.options.minPxPerSec=t,this.reRender();}scrollIntoView(t,e=false){const{scrollLeft:i,scrollWidth:s,clientWidth:n}=this.scrollContainer,r=t*s,o=i,a=i+n,h=n/2;if(this.isDragging){const t=30;r+t>a?this.scrollContainer.scrollLeft+=t:r-t<o&&(this.scrollContainer.scrollLeft-=t);}else {(r<o||r>a)&&(this.scrollContainer.scrollLeft=r-(this.options.autoCenter?h:0));const t=r-i-h;e&&this.options.autoCenter&&t>0&&(this.scrollContainer.scrollLeft+=Math.min(t,10));}{const t=this.scrollContainer.scrollLeft,e=t/s,i=(t+n)/s;this.emit("scroll",e,i,t,t+n);}}renderProgress(t,e){if(isNaN(t))return;const i=100*t;this.canvasWrapper.style.clipPath=`polygon(${i}% 0, 100% 0, 100% 100%, ${i}% 100%)`,this.progressWrapper.style.width=`${i}%`,this.cursor.style.left=`${i}%`,this.cursor.style.transform=`translateX(-${100===Math.round(i)?this.options.cursorWidth:0}px)`,this.isScrollable&&this.options.autoScroll&&this.scrollIntoView(t,e);}exportImage(t,e,s){return i$5(this,void 0,void 0,(function*(){const i=this.canvasWrapper.querySelectorAll("canvas");if(!i.length)throw new Error("No waveform data");if("dataURL"===s){const s=Array.from(i).map((i=>i.toDataURL(t,e)));return Promise.resolve(s)}return Promise.all(Array.from(i).map((i=>new Promise(((s,n)=>{i.toBlob((t=>{t?s(t):n(new Error("Could not export image"));}),t,e);})))))}))}};l$1.MAX_CANVAS_WIDTH=8e3,l$1.MAX_NODES=10;class d extends t$5{constructor(){super(...arguments),this.unsubscribe=()=>{};}start(){this.unsubscribe=this.on("tick",(()=>{requestAnimationFrame((()=>{this.emit("tick");}));})),this.emit("tick");}stop(){this.unsubscribe();}destroy(){this.unsubscribe();}}class c extends t$5{constructor(t=new AudioContext){super(),this.bufferNode=null,this.playStartTime=0,this.playedDuration=0,this._muted=false,this._playbackRate=1,this._duration=void 0,this.buffer=null,this.currentSrc="",this.paused=true,this.crossOrigin=null,this.seeking=false,this.autoplay=false,this.addEventListener=this.on,this.removeEventListener=this.un,this.audioContext=t,this.gainNode=this.audioContext.createGain(),this.gainNode.connect(this.audioContext.destination);}load(){return i$5(this,void 0,void 0,(function*(){}))}get src(){return this.currentSrc}set src(t){if(this.currentSrc=t,this._duration=void 0,!t)return this.buffer=null,void this.emit("emptied");fetch(t).then((e=>{if(e.status>=400)throw new Error(`Failed to fetch ${t}: ${e.status} (${e.statusText})`);return e.arrayBuffer()})).then((e=>this.currentSrc!==t?null:this.audioContext.decodeAudioData(e))).then((e=>{this.currentSrc===t&&(this.buffer=e,this.emit("loadedmetadata"),this.emit("canplay"),this.autoplay&&this.play());}));}_play(){var t;if(!this.paused)return;this.paused=false,null===(t=this.bufferNode)||void 0===t||t.disconnect(),this.bufferNode=this.audioContext.createBufferSource(),this.buffer&&(this.bufferNode.buffer=this.buffer),this.bufferNode.playbackRate.value=this._playbackRate,this.bufferNode.connect(this.gainNode);let e=this.playedDuration*this._playbackRate;(e>=this.duration||e<0)&&(e=0,this.playedDuration=0),this.bufferNode.start(this.audioContext.currentTime,e),this.playStartTime=this.audioContext.currentTime,this.bufferNode.onended=()=>{this.currentTime>=this.duration&&(this.pause(),this.emit("ended"));};}_pause(){var t;this.paused=true,null===(t=this.bufferNode)||void 0===t||t.stop(),this.playedDuration+=this.audioContext.currentTime-this.playStartTime;}play(){return i$5(this,void 0,void 0,(function*(){this.paused&&(this._play(),this.emit("play"));}))}pause(){this.paused||(this._pause(),this.emit("pause"));}stopAt(t){const e=t-this.currentTime,i=this.bufferNode;null==i||i.stop(this.audioContext.currentTime+e),null==i||i.addEventListener("ended",(()=>{i===this.bufferNode&&(this.bufferNode=null,this.pause());}),{once:true});}setSinkId(t){return i$5(this,void 0,void 0,(function*(){return this.audioContext.setSinkId(t)}))}get playbackRate(){return this._playbackRate}set playbackRate(t){this._playbackRate=t,this.bufferNode&&(this.bufferNode.playbackRate.value=t);}get currentTime(){return (this.paused?this.playedDuration:this.playedDuration+(this.audioContext.currentTime-this.playStartTime))*this._playbackRate}set currentTime(t){const e=!this.paused;e&&this._pause(),this.playedDuration=t/this._playbackRate,e&&this._play(),this.emit("seeking"),this.emit("timeupdate");}get duration(){var t,e;return null!==(t=this._duration)&&void 0!==t?t:(null===(e=this.buffer)||void 0===e?void 0:e.duration)||0}set duration(t){this._duration=t;}get volume(){return this.gainNode.gain.value}set volume(t){this.gainNode.gain.value=t,this.emit("volumechange");}get muted(){return this._muted}set muted(t){this._muted!==t&&(this._muted=t,this._muted?this.gainNode.disconnect():this.gainNode.connect(this.audioContext.destination));}canPlayType(t){return /^(audio|video)\//.test(t)}getGainNode(){return this.gainNode}getChannelData(){const t=[];if(!this.buffer)return t;const e=this.buffer.numberOfChannels;for(let i=0;i<e;i++)t.push(this.buffer.getChannelData(i));return t}}const u={waveColor:"#999",progressColor:"#555",cursorWidth:1,minPxPerSec:0,fillParent:true,interact:true,dragToSeek:false,autoScroll:true,autoCenter:true,sampleRate:8e3};class p extends h$1{static create(t){return new p(t)}constructor(t){const e=t.media||("WebAudio"===t.backend?new c:void 0);super({media:e,mediaControls:t.mediaControls,autoplay:t.autoplay,playbackRate:t.audioRate}),this.plugins=[],this.decodedData=null,this.stopAtPosition=null,this.subscriptions=[],this.mediaSubscriptions=[],this.abortController=null,this.options=Object.assign({},u,t),this.timer=new d;const i=e?void 0:this.getMediaElement();this.renderer=new l$1(this.options,i),this.initPlayerEvents(),this.initRendererEvents(),this.initTimerEvents(),this.initPlugins();const s=this.options.url||this.getSrc()||"";Promise.resolve().then((()=>{this.emit("init");const{peaks:t,duration:e}=this.options;(s||t&&e)&&this.load(s,t,e).catch((()=>null));}));}updateProgress(t=this.getCurrentTime()){return this.renderer.renderProgress(t/this.getDuration(),this.isPlaying()),t}initTimerEvents(){this.subscriptions.push(this.timer.on("tick",(()=>{if(!this.isSeeking()){const t=this.updateProgress();this.emit("timeupdate",t),this.emit("audioprocess",t),null!=this.stopAtPosition&&this.isPlaying()&&t>=this.stopAtPosition&&this.pause();}})));}initPlayerEvents(){this.isPlaying()&&(this.emit("play"),this.timer.start()),this.mediaSubscriptions.push(this.onMediaEvent("timeupdate",(()=>{const t=this.updateProgress();this.emit("timeupdate",t);})),this.onMediaEvent("play",(()=>{this.emit("play"),this.timer.start();})),this.onMediaEvent("pause",(()=>{this.emit("pause"),this.timer.stop(),this.stopAtPosition=null;})),this.onMediaEvent("emptied",(()=>{this.timer.stop(),this.stopAtPosition=null;})),this.onMediaEvent("ended",(()=>{this.emit("timeupdate",this.getDuration()),this.emit("finish"),this.stopAtPosition=null;})),this.onMediaEvent("seeking",(()=>{this.emit("seeking",this.getCurrentTime());})),this.onMediaEvent("error",(()=>{var t;this.emit("error",null!==(t=this.getMediaElement().error)&&void 0!==t?t:new Error("Media error")),this.stopAtPosition=null;})));}initRendererEvents(){this.subscriptions.push(this.renderer.on("click",((t,e)=>{this.options.interact&&(this.seekTo(t),this.emit("interaction",t*this.getDuration()),this.emit("click",t,e));})),this.renderer.on("dblclick",((t,e)=>{this.emit("dblclick",t,e);})),this.renderer.on("scroll",((t,e,i,s)=>{const n=this.getDuration();this.emit("scroll",t*n,e*n,i,s);})),this.renderer.on("render",(()=>{this.emit("redraw");})),this.renderer.on("rendered",(()=>{this.emit("redrawcomplete");})),this.renderer.on("dragstart",(t=>{this.emit("dragstart",t);})),this.renderer.on("dragend",(t=>{this.emit("dragend",t);})));{let t;this.subscriptions.push(this.renderer.on("drag",(e=>{if(!this.options.interact)return;let i;this.renderer.renderProgress(e),clearTimeout(t),this.isPlaying()?i=0:true===this.options.dragToSeek?i=200:"object"==typeof this.options.dragToSeek&&void 0!==this.options.dragToSeek&&(i=this.options.dragToSeek.debounceTime),t=setTimeout((()=>{this.seekTo(e);}),i),this.emit("interaction",e*this.getDuration()),this.emit("drag",e);})));}}initPlugins(){var t;(null===(t=this.options.plugins)||void 0===t?void 0:t.length)&&this.options.plugins.forEach((t=>{this.registerPlugin(t);}));}unsubscribePlayerEvents(){this.mediaSubscriptions.forEach((t=>t())),this.mediaSubscriptions=[];}setOptions(t){this.options=Object.assign({},this.options,t),t.duration&&!t.peaks&&(this.decodedData=s$5.createBuffer(this.exportPeaks(),t.duration)),t.peaks&&t.duration&&(this.decodedData=s$5.createBuffer(t.peaks,t.duration)),this.renderer.setOptions(this.options),t.audioRate&&this.setPlaybackRate(t.audioRate),null!=t.mediaControls&&(this.getMediaElement().controls=t.mediaControls);}registerPlugin(t){return t._init(this),this.plugins.push(t),this.subscriptions.push(t.once("destroy",(()=>{this.plugins=this.plugins.filter((e=>e!==t));}))),t}getWrapper(){return this.renderer.getWrapper()}getWidth(){return this.renderer.getWidth()}getScroll(){return this.renderer.getScroll()}setScroll(t){return this.renderer.setScroll(t)}setScrollTime(t){const e=t/this.getDuration();this.renderer.setScrollPercentage(e);}getActivePlugins(){return this.plugins}loadAudio(t,e,n,r){return i$5(this,void 0,void 0,(function*(){var i;if(this.emit("load",t),!this.options.media&&this.isPlaying()&&this.pause(),this.decodedData=null,this.stopAtPosition=null,!e&&!n){const s=this.options.fetchParams||{};window.AbortController&&!s.signal&&(this.abortController=new AbortController,s.signal=null===(i=this.abortController)||void 0===i?void 0:i.signal);const n=t=>this.emit("loading",t);e=yield a$1.fetchBlob(t,n,s);const r=this.options.blobMimeType;r&&(e=new Blob([e],{type:r}));}this.setSrc(t,e);const o=yield new Promise((t=>{const e=r||this.getDuration();e?t(e):this.mediaSubscriptions.push(this.onMediaEvent("loadedmetadata",(()=>t(this.getDuration())),{once:true}));}));if(!t&&!e){const t=this.getMediaElement();t instanceof c&&(t.duration=o);}if(n)this.decodedData=s$5.createBuffer(n,o||0);else if(e){const t=yield e.arrayBuffer();this.decodedData=yield s$5.decode(t,this.options.sampleRate);}this.decodedData&&(this.emit("decode",this.getDuration()),this.renderer.render(this.decodedData)),this.emit("ready",this.getDuration());}))}load(t,e,s){return i$5(this,void 0,void 0,(function*(){try{return yield this.loadAudio(t,void 0,e,s)}catch(t){throw this.emit("error",t),t}}))}loadBlob(t,e,s){return i$5(this,void 0,void 0,(function*(){try{return yield this.loadAudio("",t,e,s)}catch(t){throw this.emit("error",t),t}}))}zoom(t){if(!this.decodedData)throw new Error("No audio loaded");this.renderer.zoom(t),this.emit("zoom",t);}getDecodedData(){return this.decodedData}exportPeaks({channels:t=2,maxLength:e=8e3,precision:i=1e4}={}){if(!this.decodedData)throw new Error("The audio has not been decoded yet");const s=Math.min(t,this.decodedData.numberOfChannels),n=[];for(let t=0;t<s;t++){const s=this.decodedData.getChannelData(t),r=[],o=s.length/e;for(let t=0;t<e;t++){const e=s.slice(Math.floor(t*o),Math.ceil((t+1)*o));let n=0;for(let t=0;t<e.length;t++){const i=e[t];Math.abs(i)>Math.abs(n)&&(n=i);}r.push(Math.round(n*i)/i);}n.push(r);}return n}getDuration(){let t=super.getDuration()||0;return 0!==t&&t!==1/0||!this.decodedData||(t=this.decodedData.duration),t}toggleInteraction(t){this.options.interact=t;}setTime(t){this.stopAtPosition=null,super.setTime(t),this.updateProgress(t),this.emit("timeupdate",t);}seekTo(t){const e=this.getDuration()*t;this.setTime(e);}play(t,e){const s=Object.create(null,{play:{get:()=>super.play}});return i$5(this,void 0,void 0,(function*(){null!=t&&this.setTime(t);const i=yield s.play.call(this);return null!=e&&(this.media instanceof c?this.media.stopAt(e):this.stopAtPosition=e),i}))}playPause(){return i$5(this,void 0,void 0,(function*(){return this.isPlaying()?this.pause():this.play()}))}stop(){this.pause(),this.setTime(0);}skip(t){this.setTime(this.getCurrentTime()+t);}empty(){this.load("",[[0]],.001);}setMediaElement(t){this.unsubscribePlayerEvents(),super.setMediaElement(t),this.initPlayerEvents();}exportImage(){return i$5(this,arguments,void 0,(function*(t="image/png",e=1,i="dataURL"){return this.renderer.exportImage(t,e,i)}))}destroy(){var t;this.emit("destroy"),null===(t=this.abortController)||void 0===t||t.abort(),this.plugins.forEach((t=>t.destroy())),this.subscriptions.forEach((t=>t())),this.unsubscribePlayerEvents(),this.timer.destroy(),this.renderer.destroy(),super.destroy();}}p.BasePlugin=e$5,p.dom=o$2;const m={height:50,overlayColor:"rgba(100, 100, 100, 0.1)",insertPosition:"afterend"};class f extends e$5{constructor(t){super(t),this.miniWavesurfer=null,this.container=null,this.options=Object.assign({},m,t),this.minimapWrapper=this.initMinimapWrapper(),this.overlay=this.initOverlay();}static create(t){return new f(t)}onInit(){var t,e;if(!this.wavesurfer)throw Error("WaveSurfer is not initialized");this.options.container?("string"==typeof this.options.container?this.container=document.querySelector(this.options.container):this.options.container instanceof HTMLElement&&(this.container=this.options.container),null===(t=this.container)||void 0===t||t.appendChild(this.minimapWrapper)):(this.container=this.wavesurfer.getWrapper().parentElement,null===(e=this.container)||void 0===e||e.insertAdjacentElement(this.options.insertPosition,this.minimapWrapper)),this.initWaveSurferEvents(),Promise.resolve().then((()=>{this.initMinimap();}));}initMinimapWrapper(){return r$4("div",{part:"minimap",style:{position:"relative"}})}initOverlay(){return r$4("div",{part:"minimap-overlay",style:{position:"absolute",zIndex:"2",left:"0",top:"0",bottom:"0",transition:"left 100ms ease-out",pointerEvents:"none",backgroundColor:this.options.overlayColor}},this.minimapWrapper)}initMinimap(){if(this.miniWavesurfer&&(this.miniWavesurfer.destroy(),this.miniWavesurfer=null),!this.wavesurfer)return;const t=this.wavesurfer.getDecodedData(),e=this.wavesurfer.getMediaElement();if(!t||!e)return;const i=[];for(let e=0;e<t.numberOfChannels;e++)i.push(t.getChannelData(e));this.miniWavesurfer=p.create(Object.assign(Object.assign({},this.options),{container:this.minimapWrapper,minPxPerSec:0,fillParent:true,media:e,peaks:i,duration:t.duration})),this.subscriptions.push(this.miniWavesurfer.on("audioprocess",(t=>{this.emit("audioprocess",t);})),this.miniWavesurfer.on("click",((t,e)=>{this.emit("click",t,e);})),this.miniWavesurfer.on("dblclick",((t,e)=>{this.emit("dblclick",t,e);})),this.miniWavesurfer.on("decode",(t=>{this.emit("decode",t);})),this.miniWavesurfer.on("destroy",(()=>{this.emit("destroy");})),this.miniWavesurfer.on("drag",(t=>{this.emit("drag",t);})),this.miniWavesurfer.on("dragend",(t=>{this.emit("dragend",t);})),this.miniWavesurfer.on("dragstart",(t=>{this.emit("dragstart",t);})),this.miniWavesurfer.on("interaction",(()=>{this.emit("interaction");})),this.miniWavesurfer.on("init",(()=>{this.emit("init");})),this.miniWavesurfer.on("ready",(()=>{this.emit("ready");})),this.miniWavesurfer.on("redraw",(()=>{this.emit("redraw");})),this.miniWavesurfer.on("redrawcomplete",(()=>{this.emit("redrawcomplete");})),this.miniWavesurfer.on("seeking",(t=>{this.emit("seeking",t);})),this.miniWavesurfer.on("timeupdate",(t=>{this.emit("timeupdate",t);})));}getOverlayWidth(){var t;const e=(null===(t=this.wavesurfer)||void 0===t?void 0:t.getWrapper().clientWidth)||1;return Math.round(this.minimapWrapper.clientWidth/e*100)}onRedraw(){const t=this.getOverlayWidth();this.overlay.style.width=`${t}%`;}onScroll(t){if(!this.wavesurfer)return;const e=this.wavesurfer.getDuration();this.overlay.style.left=t/e*100+"%";}initWaveSurferEvents(){this.wavesurfer&&this.subscriptions.push(this.wavesurfer.on("decode",(()=>{this.initMinimap();})),this.wavesurfer.on("scroll",(t=>{this.onScroll(t);})),this.wavesurfer.on("redraw",(()=>{this.onRedraw();})));}destroy(){var t;null===(t=this.miniWavesurfer)||void 0===t||t.destroy(),this.minimapWrapper.remove(),super.destroy();}}

    let t$4 = class t{constructor(){this.listeners={};}on(t,e,s){if(this.listeners[t]||(this.listeners[t]=new Set),this.listeners[t].add(e),null==s?void 0:s.once){const s=()=>{this.un(t,s),this.un(t,e);};return this.on(t,s),s}return ()=>this.un(t,e)}un(t,e){var s;null===(s=this.listeners[t])||void 0===s||s.delete(e);}once(t,e){return this.on(t,e,{once:true})}unAll(){this.listeners={};}emit(t,...e){this.listeners[t]&&this.listeners[t].forEach((t=>t(...e)));}};let e$4 = class e extends t$4{constructor(t){super(),this.subscriptions=[],this.options=t;}onInit(){}_init(t){this.wavesurfer=t,this.onInit();}destroy(){this.emit("destroy"),this.subscriptions.forEach((t=>t()));}};const s$4={scale:.5,deltaThreshold:5,exponentialZooming:false,iterations:20};let i$4 = class i extends e$4{constructor(t){super(t||{}),this.wrapper=void 0,this.container=null,this.accumulatedDelta=0,this.pointerTime=0,this.oldX=0,this.endZoom=0,this.startZoom=0,this.onWheel=t=>{if(this.wavesurfer&&this.container&&!(Math.abs(t.deltaX)>=Math.abs(t.deltaY))&&(t.preventDefault(),this.accumulatedDelta+=-t.deltaY,0===this.startZoom&&this.options.exponentialZooming&&(this.startZoom=this.wavesurfer.getWrapper().clientWidth/this.wavesurfer.getDuration()),0===this.options.deltaThreshold||Math.abs(this.accumulatedDelta)>=this.options.deltaThreshold)){const e=this.wavesurfer.getDuration(),s=0===this.wavesurfer.options.minPxPerSec?this.wavesurfer.getWrapper().scrollWidth/e:this.wavesurfer.options.minPxPerSec,i=t.clientX-this.container.getBoundingClientRect().left,o=this.container.clientWidth,n=this.wavesurfer.getScroll();i===this.oldX&&0!==this.oldX||(this.pointerTime=(n+i)/s),this.oldX=i;const r=this.calculateNewZoom(s,this.accumulatedDelta),h=o/r*(i/o);r*e<o?(this.wavesurfer.zoom(o/e),this.container.scrollLeft=0):(this.wavesurfer.zoom(r),this.container.scrollLeft=(this.pointerTime-h)*r),this.accumulatedDelta=0;}},this.calculateNewZoom=(t,e)=>{let s;if(this.options.exponentialZooming){const i=e>0?Math.pow(this.endZoom/this.startZoom,1/(this.options.iterations-1)):Math.pow(this.startZoom/this.endZoom,1/(this.options.iterations-1));s=Math.max(0,t*i);}else s=Math.max(0,t+e*this.options.scale);return Math.min(s,this.options.maxZoom)},this.options=Object.assign({},s$4,t);}static create(t){return new i(t)}onInit(){var t;this.wrapper=null===(t=this.wavesurfer)||void 0===t?void 0:t.getWrapper(),this.wrapper&&(this.container=this.wrapper.parentElement,this.container.addEventListener("wheel",this.onWheel),void 0===this.options.maxZoom&&(this.options.maxZoom=this.container.clientWidth),this.endZoom=this.options.maxZoom);}destroy(){this.wrapper&&this.wrapper.removeEventListener("wheel",this.onWheel),super.destroy();}};

    let t$3 = class t{constructor(){this.listeners={};}on(t,e,s){if(this.listeners[t]||(this.listeners[t]=new Set),this.listeners[t].add(e),null==s?void 0:s.once){const s=()=>{this.un(t,s),this.un(t,e);};return this.on(t,s),s}return ()=>this.un(t,e)}un(t,e){var s;null===(s=this.listeners[t])||void 0===s||s.delete(e);}once(t,e){return this.on(t,e,{once:true})}unAll(){this.listeners={};}emit(t,...e){this.listeners[t]&&this.listeners[t].forEach((t=>t(...e)));}};let e$3 = class e extends t$3{constructor(t){super(),this.subscriptions=[],this.options=t;}onInit(){}_init(t){this.wavesurfer=t,this.onInit();}destroy(){this.emit("destroy"),this.subscriptions.forEach((t=>t()));}};function s$3(t,e){const i=e.xmlns?document.createElementNS(e.xmlns,t):document.createElement(t);for(const[t,n]of Object.entries(e))if("children"===t)for(const[t,n]of Object.entries(e))"string"==typeof n?i.appendChild(document.createTextNode(n)):i.appendChild(s$3(t,n));else "style"===t?Object.assign(i.style,n):"textContent"===t?i.textContent=n:i.setAttribute(t,n.toString());return i}function i$3(t,e,i){const n=s$3(t,e||{});return null==i||i.appendChild(n),n}const n$2={lineWidth:1,labelSize:11,formatTimeCallback:t=>`${Math.floor(t/60)}:${`0${Math.floor(t)%60}`.slice(-2)}`};let r$3 = class r extends e$3{constructor(t){super(t||{}),this.unsubscribe=()=>{},this.onPointerMove=t=>{if(!this.wavesurfer)return;const e=this.wavesurfer.getWrapper().getBoundingClientRect(),{width:s}=e,i=t.clientX-e.left,n=Math.min(1,Math.max(0,i/s)),r=Math.min(s-this.options.lineWidth-1,i);this.wrapper.style.transform=`translateX(${r}px)`,this.wrapper.style.opacity="1";const o=this.wavesurfer.getDuration()||0;this.label.textContent=this.options.formatTimeCallback(o*n);const a=this.label.offsetWidth;this.label.style.transform=r+a>s?`translateX(-${a+this.options.lineWidth}px)`:"",this.emit("hover",n);},this.onPointerLeave=()=>{this.wrapper.style.opacity="0";},this.options=Object.assign({},n$2,t),this.wrapper=i$3("div",{part:"hover"}),this.label=i$3("span",{part:"hover-label"},this.wrapper);}static create(t){return new r(t)}addUnits(t){return `${t}${"number"==typeof t?"px":""}`}onInit(){if(!this.wavesurfer)throw Error("WaveSurfer is not initialized");const t=this.wavesurfer.options,e=this.options.lineColor||t.cursorColor||t.progressColor;Object.assign(this.wrapper.style,{position:"absolute",zIndex:10,left:0,top:0,height:"100%",pointerEvents:"none",borderLeft:`${this.addUnits(this.options.lineWidth)} solid ${e}`,opacity:"0",transition:"opacity .1s ease-in"}),Object.assign(this.label.style,{display:"block",backgroundColor:this.options.labelBackground,color:this.options.labelColor,fontSize:`${this.addUnits(this.options.labelSize)}`,transition:"transform .1s ease-in",padding:"2px 3px"});const s=this.wavesurfer.getWrapper();s.appendChild(this.wrapper),s.addEventListener("pointermove",this.onPointerMove),s.addEventListener("pointerleave",this.onPointerLeave),s.addEventListener("wheel",this.onPointerMove),this.unsubscribe=()=>{s.removeEventListener("pointermove",this.onPointerMove),s.removeEventListener("pointerleave",this.onPointerLeave),s.removeEventListener("wheel",this.onPointerLeave);};}destroy(){super.destroy(),this.unsubscribe(),this.wrapper.remove();}};

    function t$2(t,e,s,r){return new(s||(s=Promise))((function(i,a){function n(t){try{o(r.next(t));}catch(t){a(t);}}function h(t){try{o(r.throw(t));}catch(t){a(t);}}function o(t){var e;t.done?i(t.value):(e=t.value,e instanceof s?e:new s((function(t){t(e);}))).then(n,h);}o((r=r.apply(t,[])).next());}))}"function"==typeof SuppressedError&&SuppressedError;let e$2 = class e{constructor(){this.listeners={};}on(t,e,s){if(this.listeners[t]||(this.listeners[t]=new Set),this.listeners[t].add(e),null==s?void 0:s.once){const s=()=>{this.un(t,s),this.un(t,e);};return this.on(t,s),s}return ()=>this.un(t,e)}un(t,e){var s;null===(s=this.listeners[t])||void 0===s||s.delete(e);}once(t,e){return this.on(t,e,{once:true})}unAll(){this.listeners={};}emit(t,...e){this.listeners[t]&&this.listeners[t].forEach((t=>t(...e)));}};let s$2 = class s extends e$2{constructor(t){super(),this.subscriptions=[],this.options=t;}onInit(){}_init(t){this.wavesurfer=t,this.onInit();}destroy(){this.emit("destroy"),this.subscriptions.forEach((t=>t()));}};function r$2(t,e){const s=e.xmlns?document.createElementNS(e.xmlns,t):document.createElement(t);for(const[t,i]of Object.entries(e))if("children"===t)for(const[t,i]of Object.entries(e))"string"==typeof i?s.appendChild(document.createTextNode(i)):s.appendChild(r$2(t,i));else "style"===t?Object.assign(s.style,i):"textContent"===t?s.textContent=i:s.setAttribute(t,i.toString());return s}function i$2(t,e,s){const i=r$2(t,e||{});return null==s||s.appendChild(i),i}function a(t,e,s,r){switch(this.bufferSize=t,this.sampleRate=e,this.bandwidth=2/t*(e/2),this.sinTable=new Float32Array(t),this.cosTable=new Float32Array(t),this.windowValues=new Float32Array(t),this.reverseTable=new Uint32Array(t),this.peakBand=0,this.peak=0,s){case "bartlett":for(i=0;i<t;i++)this.windowValues[i]=2/(t-1)*((t-1)/2-Math.abs(i-(t-1)/2));break;case "bartlettHann":for(i=0;i<t;i++)this.windowValues[i]=.62-.48*Math.abs(i/(t-1)-.5)-.38*Math.cos(2*Math.PI*i/(t-1));break;case "blackman":for(r=r||.16,i=0;i<t;i++)this.windowValues[i]=(1-r)/2-.5*Math.cos(2*Math.PI*i/(t-1))+r/2*Math.cos(4*Math.PI*i/(t-1));break;case "cosine":for(i=0;i<t;i++)this.windowValues[i]=Math.cos(Math.PI*i/(t-1)-Math.PI/2);break;case "gauss":for(r=r||.25,i=0;i<t;i++)this.windowValues[i]=Math.pow(Math.E,-0.5*Math.pow((i-(t-1)/2)/(r*(t-1)/2),2));break;case "hamming":for(i=0;i<t;i++)this.windowValues[i]=.54-.46*Math.cos(2*Math.PI*i/(t-1));break;case "hann":case void 0:for(i=0;i<t;i++)this.windowValues[i]=.5*(1-Math.cos(2*Math.PI*i/(t-1)));break;case "lanczoz":for(i=0;i<t;i++)this.windowValues[i]=Math.sin(Math.PI*(2*i/(t-1)-1))/(Math.PI*(2*i/(t-1)-1));break;case "rectangular":for(i=0;i<t;i++)this.windowValues[i]=1;break;case "triangular":for(i=0;i<t;i++)this.windowValues[i]=2/t*(t/2-Math.abs(i-(t-1)/2));break;default:throw Error("No such window function '"+s+"'")}for(var i,a=1,n=t>>1;a<t;){for(i=0;i<a;i++)this.reverseTable[i+a]=this.reverseTable[i]+n;a<<=1,n>>=1;}for(i=0;i<t;i++)this.sinTable[i]=Math.sin(-Math.PI/i),this.cosTable[i]=Math.cos(-Math.PI/i);this.calculateSpectrum=function(t){var e,s,r,i=this.bufferSize,a=this.cosTable,n=this.sinTable,h=this.reverseTable,o=new Float32Array(i),l=new Float32Array(i),c=2/this.bufferSize,u=Math.sqrt,f=new Float32Array(i/2),p=Math.floor(Math.log(i)/Math.LN2);if(Math.pow(2,p)!==i)throw "Invalid buffer size, must be a power of 2.";if(i!==t.length)throw "Supplied buffer is not the same size as defined FFT. FFT Size: "+i+" Buffer Size: "+t.length;for(var d,w,g,b,M,m,y,v,T=1,k=0;k<i;k++)o[k]=t[h[k]]*this.windowValues[h[k]],l[k]=0;for(;T<i;){d=a[T],w=n[T],g=1,b=0;for(var z=0;z<T;z++){for(k=z;k<i;)m=g*o[M=k+T]-b*l[M],y=g*l[M]+b*o[M],o[M]=o[k]-m,l[M]=l[k]-y,o[k]+=m,l[k]+=y,k+=T<<1;g=(v=g)*d-b*w,b=v*w+b*d;}T<<=1;}k=0;for(var F=i/2;k<F;k++)(r=c*u((e=o[k])*e+(s=l[k])*s))>this.peak&&(this.peakBand=k,this.peak=r),f[k]=r;return f};}const n$1=1e3*Math.log(10)/107.939;class h extends s$2{static create(t){return new h(t||{})}constructor(t){var e,s;if(super(t),this.frequenciesDataUrl=t.frequenciesDataUrl,this.container="string"==typeof t.container?document.querySelector(t.container):t.container,t.colorMap&&"string"!=typeof t.colorMap){if(t.colorMap.length<256)throw new Error("Colormap must contain 256 elements");for(let e=0;e<t.colorMap.length;e++){if(4!==t.colorMap[e].length)throw new Error("ColorMap entries must contain 4 values")}this.colorMap=t.colorMap;}else switch(this.colorMap=t.colorMap||"roseus",this.colorMap){case "gray":this.colorMap=[];for(let t=0;t<256;t++){const e=(255-t)/256;this.colorMap.push([e,e,e,1]);}break;case "igray":this.colorMap=[];for(let t=0;t<256;t++){const e=t/256;this.colorMap.push([e,e,e,1]);}break;case "roseus":this.colorMap=[[.004528,.004341,.004307,1],[.005625,.006156,.00601,1],[.006628,.008293,.008161,1],[.007551,.010738,.01079,1],[.008382,.013482,.013941,1],[.009111,.01652,.017662,1],[.009727,.019846,.022009,1],[.010223,.023452,.027035,1],[.010593,.027331,.032799,1],[.010833,.031475,.039361,1],[.010941,.035875,.046415,1],[.010918,.04052,.053597,1],[.010768,.045158,.060914,1],[.010492,.049708,.068367,1],[.010098,.054171,.075954,1],[.009594,.058549,.083672,1],[.008989,.06284,.091521,1],[.008297,.067046,.099499,1],[.00753,.071165,.107603,1],[.006704,.075196,.11583,1],[.005838,.07914,.124178,1],[.004949,.082994,.132643,1],[.004062,.086758,.141223,1],[.003198,.09043,.149913,1],[.002382,.09401,.158711,1],[.001643,.097494,.167612,1],[.001009,.100883,.176612,1],[514e-6,.104174,.185704,1],[187e-6,.107366,.194886,1],[66e-6,.110457,.204151,1],[186e-6,.113445,.213496,1],[587e-6,.116329,.222914,1],[.001309,.119106,.232397,1],[.002394,.121776,.241942,1],[.003886,.124336,.251542,1],[.005831,.126784,.261189,1],[.008276,.12912,.270876,1],[.011268,.131342,.280598,1],[.014859,.133447,.290345,1],[.0191,.135435,.300111,1],[.024043,.137305,.309888,1],[.029742,.139054,.319669,1],[.036252,.140683,.329441,1],[.043507,.142189,.339203,1],[.050922,.143571,.348942,1],[.058432,.144831,.358649,1],[.066041,.145965,.368319,1],[.073744,.146974,.377938,1],[.081541,.147858,.387501,1],[.089431,.148616,.396998,1],[.097411,.149248,.406419,1],[.105479,.149754,.415755,1],[.113634,.150134,.424998,1],[.121873,.150389,.434139,1],[.130192,.150521,.443167,1],[.138591,.150528,.452075,1],[.147065,.150413,.460852,1],[.155614,.150175,.469493,1],[.164232,.149818,.477985,1],[.172917,.149343,.486322,1],[.181666,.148751,.494494,1],[.190476,.148046,.502493,1],[.199344,.147229,.510313,1],[.208267,.146302,.517944,1],[.217242,.145267,.52538,1],[.226264,.144131,.532613,1],[.235331,.142894,.539635,1],[.24444,.141559,.546442,1],[.253587,.140131,.553026,1],[.262769,.138615,.559381,1],[.271981,.137016,.5655,1],[.281222,.135335,.571381,1],[.290487,.133581,.577017,1],[.299774,.131757,.582404,1],[.30908,.129867,.587538,1],[.318399,.12792,.592415,1],[.32773,.125921,.597032,1],[.337069,.123877,.601385,1],[.346413,.121793,.605474,1],[.355758,.119678,.609295,1],[.365102,.11754,.612846,1],[.374443,.115386,.616127,1],[.383774,.113226,.619138,1],[.393096,.111066,.621876,1],[.402404,.108918,.624343,1],[.411694,.106794,.62654,1],[.420967,.104698,.628466,1],[.430217,.102645,.630123,1],[.439442,.100647,.631513,1],[.448637,.098717,.632638,1],[.457805,.096861,.633499,1],[.46694,.095095,.6341,1],[.47604,.093433,.634443,1],[.485102,.091885,.634532,1],[.494125,.090466,.63437,1],[.503104,.08919,.633962,1],[.512041,.088067,.633311,1],[.520931,.087108,.63242,1],[.529773,.086329,.631297,1],[.538564,.085738,.629944,1],[.547302,.085346,.628367,1],[.555986,.085162,.626572,1],[.564615,.08519,.624563,1],[.573187,.085439,.622345,1],[.581698,.085913,.619926,1],[.590149,.086615,.617311,1],[.598538,.087543,.614503,1],[.606862,.0887,.611511,1],[.61512,.090084,.608343,1],[.623312,.09169,.605001,1],[.631438,.093511,.601489,1],[.639492,.095546,.597821,1],[.647476,.097787,.593999,1],[.655389,.100226,.590028,1],[.66323,.102856,.585914,1],[.670995,.105669,.581667,1],[.678686,.108658,.577291,1],[.686302,.111813,.57279,1],[.69384,.115129,.568175,1],[.7013,.118597,.563449,1],[.708682,.122209,.558616,1],[.715984,.125959,.553687,1],[.723206,.12984,.548666,1],[.730346,.133846,.543558,1],[.737406,.13797,.538366,1],[.744382,.142209,.533101,1],[.751274,.146556,.527767,1],[.758082,.151008,.522369,1],[.764805,.155559,.516912,1],[.771443,.160206,.511402,1],[.777995,.164946,.505845,1],[.784459,.169774,.500246,1],[.790836,.174689,.494607,1],[.797125,.179688,.488935,1],[.803325,.184767,.483238,1],[.809435,.189925,.477518,1],[.815455,.19516,.471781,1],[.821384,.200471,.466028,1],[.827222,.205854,.460267,1],[.832968,.211308,.454505,1],[.838621,.216834,.448738,1],[.844181,.222428,.442979,1],[.849647,.22809,.43723,1],[.855019,.233819,.431491,1],[.860295,.239613,.425771,1],[.865475,.245471,.420074,1],[.870558,.251393,.414403,1],[.875545,.25738,.408759,1],[.880433,.263427,.403152,1],[.885223,.269535,.397585,1],[.889913,.275705,.392058,1],[.894503,.281934,.386578,1],[.898993,.288222,.381152,1],[.903381,.294569,.375781,1],[.907667,.300974,.370469,1],[.911849,.307435,.365223,1],[.915928,.313953,.360048,1],[.919902,.320527,.354948,1],[.923771,.327155,.349928,1],[.927533,.333838,.344994,1],[.931188,.340576,.340149,1],[.934736,.347366,.335403,1],[.938175,.354207,.330762,1],[.941504,.361101,.326229,1],[.944723,.368045,.321814,1],[.947831,.375039,.317523,1],[.950826,.382083,.313364,1],[.953709,.389175,.309345,1],[.956478,.396314,.305477,1],[.959133,.403499,.301766,1],[.961671,.410731,.298221,1],[.964093,.418008,.294853,1],[.966399,.425327,.291676,1],[.968586,.43269,.288696,1],[.970654,.440095,.285926,1],[.972603,.44754,.28338,1],[.974431,.455025,.281067,1],[.976139,.462547,.279003,1],[.977725,.470107,.277198,1],[.979188,.477703,.275666,1],[.980529,.485332,.274422,1],[.981747,.492995,.273476,1],[.98284,.50069,.272842,1],[.983808,.508415,.272532,1],[.984653,.516168,.27256,1],[.985373,.523948,.272937,1],[.985966,.531754,.273673,1],[.986436,.539582,.274779,1],[.98678,.547434,.276264,1],[.986998,.555305,.278135,1],[.987091,.563195,.280401,1],[.987061,.5711,.283066,1],[.986907,.579019,.286137,1],[.986629,.58695,.289615,1],[.986229,.594891,.293503,1],[.985709,.602839,.297802,1],[.985069,.610792,.302512,1],[.98431,.618748,.307632,1],[.983435,.626704,.313159,1],[.982445,.634657,.319089,1],[.981341,.642606,.32542,1],[.98013,.650546,.332144,1],[.978812,.658475,.339257,1],[.977392,.666391,.346753,1],[.97587,.67429,.354625,1],[.974252,.68217,.362865,1],[.972545,.690026,.371466,1],[.97075,.697856,.380419,1],[.968873,.705658,.389718,1],[.966921,.713426,.399353,1],[.964901,.721157,.409313,1],[.962815,.728851,.419594,1],[.960677,.7365,.430181,1],[.95849,.744103,.44107,1],[.956263,.751656,.452248,1],[.954009,.759153,.463702,1],[.951732,.766595,.475429,1],[.949445,.773974,.487414,1],[.947158,.781289,.499647,1],[.944885,.788535,.512116,1],[.942634,.795709,.524811,1],[.940423,.802807,.537717,1],[.938261,.809825,.550825,1],[.936163,.81676,.564121,1],[.934146,.823608,.577591,1],[.932224,.830366,.59122,1],[.930412,.837031,.604997,1],[.928727,.843599,.618904,1],[.927187,.850066,.632926,1],[.925809,.856432,.647047,1],[.92461,.862691,.661249,1],[.923607,.868843,.675517,1],[.92282,.874884,.689832,1],[.922265,.880812,.704174,1],[.921962,.886626,.718523,1],[.92193,.892323,.732859,1],[.922183,.897903,.747163,1],[.922741,.903364,.76141,1],[.92362,.908706,.77558,1],[.924837,.913928,.789648,1],[.926405,.919031,.80359,1],[.92834,.924015,.817381,1],[.930655,.928881,.830995,1],[.93336,.933631,.844405,1],[.936466,.938267,.857583,1],[.939982,.942791,.870499,1],[.943914,.947207,.883122,1],[.948267,.951519,.895421,1],[.953044,.955732,.907359,1],[.958246,.959852,.918901,1],[.963869,.963887,.930004,1],[.969909,.967845,.940623,1],[.976355,.971737,.950704,1],[.983195,.97558,.960181,1],[.990402,.979395,.968966,1],[.99793,.983217,.97692,1]];break;default:throw Error("No such colormap '"+this.colorMap+"'")}this.fftSamples=t.fftSamples||512,this.height=t.height||200,this.noverlap=t.noverlap||null,this.windowFunc=t.windowFunc||"hann",this.alpha=t.alpha,this.frequencyMin=t.frequencyMin||0,this.frequencyMax=t.frequencyMax||0,this.gainDB=null!==(e=t.gainDB)&&void 0!==e?e:20,this.rangeDB=null!==(s=t.rangeDB)&&void 0!==s?s:80,this.scale=t.scale||"mel",this.numMelFilters=this.fftSamples/2,this.numLogFilters=this.fftSamples/2,this.numBarkFilters=this.fftSamples/2,this.numErbFilters=this.fftSamples/2,this.createWrapper(),this.createCanvas();}onInit(){this.container=this.container||this.wavesurfer.getWrapper(),this.container.appendChild(this.wrapper),this.wavesurfer.options.fillParent&&Object.assign(this.wrapper.style,{width:"100%",overflowX:"hidden",overflowY:"hidden"}),this.subscriptions.push(this.wavesurfer.on("redraw",(()=>this.render())));}destroy(){this.unAll(),this.wavesurfer.un("ready",this._onReady),this.wavesurfer.un("redraw",this._onRender),this.wavesurfer=null,this.util=null,this.options=null,this.wrapper&&(this.wrapper.remove(),this.wrapper=null),super.destroy();}loadFrequenciesData(e){return t$2(this,void 0,void 0,(function*(){const t=yield fetch(e);if(!t.ok)throw new Error("Unable to fetch frequencies data");const s=yield t.json();this.drawSpectrogram(s);}))}createWrapper(){this.wrapper=i$2("div",{style:{display:"block",position:"relative",userSelect:"none"}}),this.options.labels&&(this.labelsEl=i$2("canvas",{part:"spec-labels",style:{position:"absolute",zIndex:9,width:"55px",height:"100%"}},this.wrapper)),this.wrapper.addEventListener("click",this._onWrapperClick);}createCanvas(){this.canvas=i$2("canvas",{style:{position:"absolute",left:0,top:0,width:"100%",height:"100%",zIndex:4}},this.wrapper),this.spectrCc=this.canvas.getContext("2d");}render(){var t;if(this.frequenciesDataUrl)this.loadFrequenciesData(this.frequenciesDataUrl);else {const e=null===(t=this.wavesurfer)||void 0===t?void 0:t.getDecodedData();e&&this.drawSpectrogram(this.getFrequencies(e));}}drawSpectrogram(t){isNaN(t[0][0])||(t=[t]),this.wrapper.style.height=this.height*t.length+"px",this.canvas.width=this.getWidth(),this.canvas.height=this.height*t.length;const e=this.spectrCc,s=this.height,r=this.getWidth(),i=this.buffer.sampleRate/2,a=this.frequencyMin,n=this.frequencyMax;if(e){if(n>i){const i=this.colorMap[this.colorMap.length-1];e.fillStyle=`rgba(${i[0]}, ${i[1]}, ${i[2]}, ${i[3]})`,e.fillRect(0,0,r,s*t.length);}for(let h=0;h<t.length;h++){const o=this.resample(t[h]),l=o[0].length,c=new ImageData(r,l);for(let t=0;t<o.length;t++)for(let e=0;e<o[t].length;e++){const s=this.colorMap[o[t][e]],i=4*((l-e-1)*r+t);c.data[i]=255*s[0],c.data[i+1]=255*s[1],c.data[i+2]=255*s[2],c.data[i+3]=255*s[3];}const u=this.hzToScale(a)/this.hzToScale(i),f=this.hzToScale(n)/this.hzToScale(i),p=Math.min(1,f);createImageBitmap(c,0,Math.round(l*(1-p)),r,Math.round(l*(p-u))).then((t=>{e.drawImage(t,0,s*(h+1-p/f),r,s*p/f);}));}this.options.labels&&this.loadLabels(this.options.labelsBackground,"12px","12px","",this.options.labelsColor,this.options.labelsHzColor||this.options.labelsColor,"center","#specLabels",t.length),this.emit("ready");}}createFilterBank(t,e,s,r){const i=s(0),a=s(e/2),n=Array.from({length:t},(()=>Array(this.fftSamples/2+1).fill(0))),h=e/this.fftSamples;for(let e=0;e<t;e++){let s=r(i+e/t*(a-i)),o=Math.floor(s/h),l=o*h,c=(s-l)/((o+1)*h-l);n[e][o]=1-c,n[e][o+1]=c;}return n}hzToMel(t){return 2595*Math.log10(1+t/700)}melToHz(t){return 700*(Math.pow(10,t/2595)-1)}createMelFilterBank(t,e){return this.createFilterBank(t,e,this.hzToMel,this.melToHz)}hzToLog(t){return Math.log10(Math.max(1,t))}logToHz(t){return Math.pow(10,t)}createLogFilterBank(t,e){return this.createFilterBank(t,e,this.hzToLog,this.logToHz)}hzToBark(t){let e=26.81*t/(1960+t)-.53;return e<2&&(e+=.15*(2-e)),e>20.1&&(e+=.22*(e-20.1)),e}barkToHz(t){return t<2&&(t=(t-.3)/.85),t>20.1&&(t=(t+4.422)/1.22),(t+.53)/(26.28-t)*1960}createBarkFilterBank(t,e){return this.createFilterBank(t,e,this.hzToBark,this.barkToHz)}hzToErb(t){return n$1*Math.log10(1+.00437*t)}erbToHz(t){return (Math.pow(10,t/n$1)-1)/.00437}createErbFilterBank(t,e){return this.createFilterBank(t,e,this.hzToErb,this.erbToHz)}hzToScale(t){switch(this.scale){case "mel":return this.hzToMel(t);case "logarithmic":return this.hzToLog(t);case "bark":return this.hzToBark(t);case "erb":return this.hzToErb(t)}return t}scaleToHz(t){switch(this.scale){case "mel":return this.melToHz(t);case "logarithmic":return this.logToHz(t);case "bark":return this.barkToHz(t);case "erb":return this.erbToHz(t)}return t}applyFilterBank(t,e){const s=e.length,r=Float32Array.from({length:s},(()=>0));for(let i=0;i<s;i++)for(let s=0;s<t.length;s++)r[i]+=t[s]*e[i][s];return r}getWidth(){return this.wavesurfer.getWrapper().offsetWidth}getFrequencies(t){var e,s;const r=this.fftSamples,i=(null!==(e=this.options.splitChannels)&&void 0!==e?e:null===(s=this.wavesurfer)||void 0===s?void 0:s.options.splitChannels)?t.numberOfChannels:1;if(this.frequencyMax=this.frequencyMax||t.sampleRate/2,!t)return;this.buffer=t;const n=t.sampleRate,h=[];let o=this.noverlap;if(!o){const e=t.length/this.canvas.width;o=Math.max(0,Math.round(r-e));}const l=new a(r,n,this.windowFunc,this.alpha);let c;switch(this.scale){case "mel":c=this.createFilterBank(this.numMelFilters,n,this.hzToMel,this.melToHz);break;case "logarithmic":c=this.createFilterBank(this.numLogFilters,n,this.hzToLog,this.logToHz);break;case "bark":c=this.createFilterBank(this.numBarkFilters,n,this.hzToBark,this.barkToHz);break;case "erb":c=this.createFilterBank(this.numErbFilters,n,this.hzToErb,this.erbToHz);}for(let e=0;e<i;e++){const s=t.getChannelData(e),i=[];let a=0;for(;a+r<s.length;){const t=s.slice(a,a+r),e=new Uint8Array(r/2);let n=l.calculateSpectrum(t);c&&(n=this.applyFilterBank(n,c));for(let t=0;t<r/2;t++){const s=n[t]>1e-12?n[t]:1e-12,r=20*Math.log10(s);r<-this.gainDB-this.rangeDB?e[t]=0:r>-this.gainDB?e[t]=255:e[t]=(r+this.gainDB)/this.rangeDB*255+256;}i.push(e),a+=r-o;}h.push(i);}return h}freqType(t){return t>=1e3?(t/1e3).toFixed(1):Math.round(t)}unitType(t){return t>=1e3?"kHz":"Hz"}getLabelFrequency(t,e){const s=this.hzToScale(this.frequencyMin),r=this.hzToScale(this.frequencyMax);return this.scaleToHz(s+t/e*(r-s))}loadLabels(t,e,s,r,i,a,n,h,o){t=t||"rgba(68,68,68,0)",e=e||"12px",s=s||"12px",r=r||"Helvetica",i=i||"#fff",a=a||"#fff",n=n||"center";const l=this.height||512,c=l/256*5;this.frequencyMin;this.frequencyMax;const u=this.labelsEl.getContext("2d"),f=window.devicePixelRatio;if(this.labelsEl.height=this.height*o*f,this.labelsEl.width=55*f,u.scale(f,f),u)for(let h=0;h<o;h++){let o;for(u.fillStyle=t,u.fillRect(0,h*l,55,(1+h)*l),u.fill(),o=0;o<=c;o++){u.textAlign=n,u.textBaseline="middle";const t=this.getLabelFrequency(o,c),f=this.freqType(t),p=this.unitType(t),d=16;let w=(1+h)*l-o/c*l;w=Math.min(Math.max(w,h*l+10),(1+h)*l-10),u.fillStyle=a,u.font=s+" "+r,u.fillText(p,d+24,w),u.fillStyle=i,u.font=e+" "+r,u.fillText(f,d,w);}}}resample(t){const e=this.getWidth(),s=[],r=1/t.length,i=1/e;let a;for(a=0;a<e;a++){const e=new Array(t[0].length);let n;for(n=0;n<t.length;n++){const s=n*r,h=s+r,o=a*i,l=o+i,c=Math.max(0,Math.min(h,l)-Math.max(s,o));let u;if(c>0)for(u=0;u<t[0].length;u++)null==e[u]&&(e[u]=0),e[u]+=c/i*t[n][u];}const h=new Uint8Array(t[0].length);let o;for(o=0;o<t[0].length;o++)h[o]=e[o];s.push(h);}return s}}

    function t$1(t,i,e,s){return new(e||(e=Promise))((function(o,r){function n(t){try{d(s.next(t));}catch(t){r(t);}}function a(t){try{d(s.throw(t));}catch(t){r(t);}}function d(t){var i;t.done?o(t.value):(i=t.value,i instanceof e?i:new e((function(t){t(i);}))).then(n,a);}d((s=s.apply(t,[])).next());}))}"function"==typeof SuppressedError&&SuppressedError;let i$1 = class i{constructor(){this.listeners={};}on(t,i,e){if(this.listeners[t]||(this.listeners[t]=new Set),this.listeners[t].add(i),null==e?void 0:e.once){const e=()=>{this.un(t,e),this.un(t,i);};return this.on(t,e),e}return ()=>this.un(t,i)}un(t,i){var e;null===(e=this.listeners[t])||void 0===e||e.delete(i);}once(t,i){return this.on(t,i,{once:true})}unAll(){this.listeners={};}emit(t,...i){this.listeners[t]&&this.listeners[t].forEach((t=>t(...i)));}};let e$1 = class e extends i$1{constructor(t){super(),this.subscriptions=[],this.options=t;}onInit(){}_init(t){this.wavesurfer=t,this.onInit();}destroy(){this.emit("destroy"),this.subscriptions.forEach((t=>t()));}};let s$1 = class s extends i$1{constructor(){super(...arguments),this.unsubscribe=()=>{};}start(){this.unsubscribe=this.on("tick",(()=>{requestAnimationFrame((()=>{this.emit("tick");}));})),this.emit("tick");}stop(){this.unsubscribe();}destroy(){this.unsubscribe();}};const o$1=["audio/webm","audio/wav","audio/mpeg","audio/mp4","audio/mp3"];let r$1 = class r extends e$1{constructor(t){var i,e,o,r,n,a;super(Object.assign(Object.assign({},t),{audioBitsPerSecond:null!==(i=t.audioBitsPerSecond)&&void 0!==i?i:128e3,scrollingWaveform:null!==(e=t.scrollingWaveform)&&void 0!==e&&e,scrollingWaveformWindow:null!==(o=t.scrollingWaveformWindow)&&void 0!==o?o:5,continuousWaveform:null!==(r=t.continuousWaveform)&&void 0!==r&&r,renderRecordedAudio:null===(n=t.renderRecordedAudio)||void 0===n||n,mediaRecorderTimeslice:null!==(a=t.mediaRecorderTimeslice)&&void 0!==a?a:void 0})),this.stream=null,this.mediaRecorder=null,this.dataWindow=null,this.isWaveformPaused=false,this.lastStartTime=0,this.lastDuration=0,this.duration=0,this.timer=new s$1,this.subscriptions.push(this.timer.on("tick",(()=>{const t=performance.now()-this.lastStartTime;this.duration=this.isPaused()?this.duration:this.lastDuration+t,this.emit("record-progress",this.duration);})));}static create(t){return new r(t||{})}renderMicStream(t){var i;const e=new AudioContext,s=e.createMediaStreamSource(t),o=e.createAnalyser();s.connect(o),this.options.continuousWaveform&&(o.fftSize=32);const r=o.frequencyBinCount,n=new Float32Array(r);let a=0;this.wavesurfer&&(null!==(i=this.originalOptions)&&void 0!==i||(this.originalOptions=Object.assign({},this.wavesurfer.options)),this.wavesurfer.options.interact=false,this.options.scrollingWaveform&&(this.wavesurfer.options.cursorWidth=0));const d=setInterval((()=>{var t,i,s,d;if(!this.isWaveformPaused){if(o.getFloatTimeDomainData(n),this.options.scrollingWaveform){const t=Math.floor((this.options.scrollingWaveformWindow||0)*e.sampleRate),i=Math.min(t,this.dataWindow?this.dataWindow.length+r:r),s=new Float32Array(t);if(this.dataWindow){const e=Math.max(0,t-this.dataWindow.length);s.set(this.dataWindow.slice(-i+r),e);}s.set(n,t-r),this.dataWindow=s;}else if(this.options.continuousWaveform){if(!this.dataWindow){const e=this.options.continuousWaveformDuration?Math.round(100*this.options.continuousWaveformDuration):(null!==(i=null===(t=this.wavesurfer)||void 0===t?void 0:t.getWidth())&&void 0!==i?i:0)*window.devicePixelRatio;this.dataWindow=new Float32Array(e);}let e=0;for(let t=0;t<r;t++){const i=Math.abs(n[t]);i>e&&(e=i);}if(a+1>this.dataWindow.length){const t=new Float32Array(2*this.dataWindow.length);t.set(this.dataWindow,0),this.dataWindow=t;}this.dataWindow[a]=e,a++;}else this.dataWindow=n;if(this.wavesurfer){const t=(null!==(d=null===(s=this.dataWindow)||void 0===s?void 0:s.length)&&void 0!==d?d:0)/100;this.wavesurfer.load("",[this.dataWindow],this.options.scrollingWaveform?this.options.scrollingWaveformWindow:t).then((()=>{this.wavesurfer&&this.options.continuousWaveform&&(this.wavesurfer.setTime(this.getDuration()/1e3),this.wavesurfer.options.minPxPerSec||this.wavesurfer.setOptions({minPxPerSec:this.wavesurfer.getWidth()/this.wavesurfer.getDuration()}));})).catch((t=>{console.error("Error rendering real-time recording data:",t);}));}}}),10);return {onDestroy:()=>{clearInterval(d),null==s||s.disconnect(),null==e||e.close();},onEnd:()=>{this.isWaveformPaused=true,clearInterval(d),this.stopMic();}}}startMic(i){return t$1(this,void 0,void 0,(function*(){let t;try{t=yield navigator.mediaDevices.getUserMedia({audio:null==i||i});}catch(t){throw new Error("Error accessing the microphone: "+t.message)}const{onDestroy:e,onEnd:s}=this.renderMicStream(t);return this.subscriptions.push(this.once("destroy",e)),this.subscriptions.push(this.once("record-end",s)),this.stream=t,t}))}stopMic(){this.stream&&(this.stream.getTracks().forEach((t=>t.stop())),this.stream=null,this.mediaRecorder=null);}startRecording(i){return t$1(this,void 0,void 0,(function*(){const t=this.stream||(yield this.startMic(i));this.dataWindow=null;const e=this.mediaRecorder||new MediaRecorder(t,{mimeType:this.options.mimeType||o$1.find((t=>MediaRecorder.isTypeSupported(t))),audioBitsPerSecond:this.options.audioBitsPerSecond});this.mediaRecorder=e,this.stopRecording();const s=[];e.ondataavailable=t=>{t.data.size>0&&s.push(t.data),this.emit("record-data-available",t.data);};const r=t=>{var i;const o=new Blob(s,{type:e.mimeType});this.emit(t,o),this.options.renderRecordedAudio&&(this.applyOriginalOptionsIfNeeded(),null===(i=this.wavesurfer)||void 0===i||i.load(URL.createObjectURL(o)));};e.onpause=()=>r("record-pause"),e.onstop=()=>r("record-end"),e.start(this.options.mediaRecorderTimeslice),this.lastStartTime=performance.now(),this.lastDuration=0,this.duration=0,this.isWaveformPaused=false,this.timer.start(),this.emit("record-start");}))}getDuration(){return this.duration}isRecording(){var t;return "recording"===(null===(t=this.mediaRecorder)||void 0===t?void 0:t.state)}isPaused(){var t;return "paused"===(null===(t=this.mediaRecorder)||void 0===t?void 0:t.state)}isActive(){var t;return "inactive"!==(null===(t=this.mediaRecorder)||void 0===t?void 0:t.state)}stopRecording(){var t;this.isActive()&&(null===(t=this.mediaRecorder)||void 0===t||t.stop(),this.timer.stop());}pauseRecording(){var t,i;this.isRecording()&&(this.isWaveformPaused=true,null===(t=this.mediaRecorder)||void 0===t||t.requestData(),null===(i=this.mediaRecorder)||void 0===i||i.pause(),this.timer.stop(),this.lastDuration=this.duration);}resumeRecording(){var t;this.isPaused()&&(this.isWaveformPaused=false,null===(t=this.mediaRecorder)||void 0===t||t.resume(),this.timer.start(),this.lastStartTime=performance.now(),this.emit("record-resume"));}static getAvailableAudioDevices(){return t$1(this,void 0,void 0,(function*(){return navigator.mediaDevices.enumerateDevices().then((t=>t.filter((t=>"audioinput"===t.kind))))}))}destroy(){this.applyOriginalOptionsIfNeeded(),super.destroy(),this.stopRecording(),this.stopMic();}applyOriginalOptionsIfNeeded(){this.wavesurfer&&this.originalOptions&&(this.wavesurfer.setOptions(this.originalOptions),delete this.originalOptions);}};

    class t{constructor(){this.listeners={};}on(t,e,i){if(this.listeners[t]||(this.listeners[t]=new Set),this.listeners[t].add(e),null==i?void 0:i.once){const i=()=>{this.un(t,i),this.un(t,e);};return this.on(t,i),i}return ()=>this.un(t,e)}un(t,e){var i;null===(i=this.listeners[t])||void 0===i||i.delete(e);}once(t,e){return this.on(t,e,{once:true})}unAll(){this.listeners={};}emit(t,...e){this.listeners[t]&&this.listeners[t].forEach((t=>t(...e)));}}class e extends t{constructor(t){super(),this.subscriptions=[],this.options=t;}onInit(){}_init(t){this.wavesurfer=t,this.onInit();}destroy(){this.emit("destroy"),this.subscriptions.forEach((t=>t()));}}function i(t,e,i,o,n=3,s=0,r=100){if(!t)return ()=>{};const l=matchMedia("(pointer: coarse)").matches;let a=()=>{};const h=h=>{if(h.button!==s)return;h.preventDefault(),h.stopPropagation();let u=h.clientX,c=h.clientY,d=false;const p=Date.now(),m=o=>{if(o.preventDefault(),o.stopPropagation(),l&&Date.now()-p<r)return;const s=o.clientX,a=o.clientY,h=s-u,m=a-c;if(d||Math.abs(h)>n||Math.abs(m)>n){const o=t.getBoundingClientRect(),{left:n,top:r}=o;d||(null==i||i(u-n,c-r),d=true),e(h,m,s-n,a-r),u=s,c=a;}},v=e=>{if(d){const i=e.clientX,n=e.clientY,s=t.getBoundingClientRect(),{left:r,top:l}=s;null==o||o(i-r,n-l);}a();},g=t=>{t.relatedTarget&&t.relatedTarget!==document.documentElement||v(t);},f=t=>{d&&(t.stopPropagation(),t.preventDefault());},y=t=>{d&&t.preventDefault();};document.addEventListener("pointermove",m),document.addEventListener("pointerup",v),document.addEventListener("pointerout",g),document.addEventListener("pointercancel",g),document.addEventListener("touchmove",y,{passive:false}),document.addEventListener("click",f,{capture:true}),a=()=>{document.removeEventListener("pointermove",m),document.removeEventListener("pointerup",v),document.removeEventListener("pointerout",g),document.removeEventListener("pointercancel",g),document.removeEventListener("touchmove",y),setTimeout((()=>{document.removeEventListener("click",f,{capture:true});}),10);};};return t.addEventListener("pointerdown",h),()=>{a(),t.removeEventListener("pointerdown",h);}}function o(t,e){const i=e.xmlns?document.createElementNS(e.xmlns,t):document.createElement(t);for(const[t,n]of Object.entries(e))if("children"===t)for(const[t,n]of Object.entries(e))"string"==typeof n?i.appendChild(document.createTextNode(n)):i.appendChild(o(t,n));else "style"===t?Object.assign(i.style,n):"textContent"===t?i.textContent=n:i.setAttribute(t,n.toString());return i}function n(t,e,i){const n=o(t,e||{});return null==i||i.appendChild(n),n}const s={points:[],lineWidth:4,lineColor:"rgba(0, 0, 255, 0.5)",dragPointSize:10,dragPointFill:"rgba(255, 255, 255, 0.8)",dragPointStroke:"rgba(255, 255, 255, 0.8)"};class r extends t{constructor(t,e){super(),this.subscriptions=[],this.subscriptions=[],this.options=t,this.polyPoints=new Map;const o=e.clientWidth,s=e.clientHeight,r=n("svg",{xmlns:"http://www.w3.org/2000/svg",width:"100%",height:"100%",viewBox:`0 0 ${o} ${s}`,preserveAspectRatio:"none",style:{position:"absolute",left:"0",top:"0",zIndex:"4"},part:"envelope"},e);this.svg=r;const l=n("polyline",{xmlns:"http://www.w3.org/2000/svg",points:`0,${s} ${o},${s}`,stroke:t.lineColor,"stroke-width":t.lineWidth,fill:"none",part:"polyline",style:t.dragLine?{cursor:"row-resize",pointerEvents:"stroke"}:{}},r);t.dragLine&&this.subscriptions.push(i(l,((t,e)=>{const{height:i}=r.viewBox.baseVal,{points:o}=l;for(let t=1;t<o.numberOfItems-1;t++){const n=o.getItem(t);n.y=Math.min(i,Math.max(0,n.y+e));}const n=r.querySelectorAll("ellipse");Array.from(n).forEach((t=>{const o=Math.min(i,Math.max(0,Number(t.getAttribute("cy"))+e));t.setAttribute("cy",o.toString());})),this.emit("line-move",e/i);}))),r.addEventListener("dblclick",(t=>{const e=r.getBoundingClientRect(),i=t.clientX-e.left,o=t.clientY-e.top;this.emit("point-create",i/e.width,o/e.height);}));{let t;const e=()=>clearTimeout(t);r.addEventListener("touchstart",(i=>{1===i.touches.length?t=window.setTimeout((()=>{i.preventDefault();const t=r.getBoundingClientRect(),e=i.touches[0].clientX-t.left,o=i.touches[0].clientY-t.top;this.emit("point-create",e/t.width,o/t.height);}),500):e();})),r.addEventListener("touchmove",e),r.addEventListener("touchend",e);}}makeDraggable(t,e){this.subscriptions.push(i(t,e,(()=>t.style.cursor="grabbing"),(()=>t.style.cursor="grab"),1));}createCircle(t,e){const i=this.options.dragPointSize/2;return n("ellipse",{xmlns:"http://www.w3.org/2000/svg",cx:t,cy:e,rx:i,ry:i,fill:this.options.dragPointFill,stroke:this.options.dragPointStroke,"stroke-width":"2",style:{cursor:"grab",pointerEvents:"all"},part:"envelope-circle"},this.svg)}removePolyPoint(t){const e=this.polyPoints.get(t);if(!e)return;const{polyPoint:i,circle:o}=e,{points:n}=this.svg.querySelector("polyline"),s=Array.from(n).findIndex((t=>t.x===i.x&&t.y===i.y));n.removeItem(s),o.remove(),this.polyPoints.delete(t);}addPolyPoint(t,e,i){const{svg:o}=this,{width:n,height:s}=o.viewBox.baseVal,r=t*n,l=s-e*s,a=this.options.dragPointSize/2,h=o.createSVGPoint();h.x=t*n,h.y=s-e*s;const u=this.createCircle(r,l),{points:c}=o.querySelector("polyline"),d=Array.from(c).findIndex((t=>t.x>=r));c.insertItemBefore(h,Math.max(d,1)),this.polyPoints.set(i,{polyPoint:h,circle:u}),this.makeDraggable(u,((t,e)=>{const o=h.x+t,r=h.y+e;if(o<-a||r<-a||o>n+a||r>s+a)return void this.emit("point-dragout",i);const l=Array.from(c).find((t=>t.x>h.x)),d=Array.from(c).findLast((t=>t.x<h.x));l&&o>=l.x||d&&o<=d.x||(h.x=o,h.y=r,u.setAttribute("cx",o.toString()),u.setAttribute("cy",r.toString()),this.emit("point-move",i,o/n,r/s));}));}update(){const{svg:t}=this,e=t.viewBox.baseVal.width/t.clientWidth,i=t.viewBox.baseVal.height/t.clientHeight;t.querySelectorAll("ellipse").forEach((t=>{const o=this.options.dragPointSize/2,n=o*e,s=o*i;t.setAttribute("rx",n.toString()),t.setAttribute("ry",s.toString());}));}destroy(){this.subscriptions.forEach((t=>t())),this.polyPoints.clear(),this.svg.remove();}}class l extends e{constructor(t){super(t),this.polyline=null,this.throttleTimeout=null,this.volume=1,this.points=t.points||[],this.options=Object.assign({},s,t),this.options.lineColor=this.options.lineColor||s.lineColor,this.options.dragPointFill=this.options.dragPointFill||s.dragPointFill,this.options.dragPointStroke=this.options.dragPointStroke||s.dragPointStroke,this.options.dragPointSize=this.options.dragPointSize||s.dragPointSize;}static create(t){return new l(t)}addPoint(t){var e;t.id||(t.id=Math.random().toString(36).slice(2));const i=this.points.findLastIndex((e=>e.time<t.time));this.points.splice(i+1,0,t),this.emitPoints();const o=null===(e=this.wavesurfer)||void 0===e?void 0:e.getDuration();o&&this.addPolyPoint(t,o);}removePoint(t){var e;const i=this.points.indexOf(t);i>-1&&(this.points.splice(i,1),null===(e=this.polyline)||void 0===e||e.removePolyPoint(t),this.emitPoints());}getPoints(){return this.points}setPoints(t){this.points.slice().forEach((t=>this.removePoint(t))),t.forEach((t=>this.addPoint(t)));}destroy(){var t;null===(t=this.polyline)||void 0===t||t.destroy(),super.destroy();}getCurrentVolume(){return this.volume}setVolume(t){var e;this.volume=t,null===(e=this.wavesurfer)||void 0===e||e.setVolume(t);}onInit(){var t;if(!this.wavesurfer)throw Error("WaveSurfer is not initialized");const{options:e}=this;e.volume=null!==(t=e.volume)&&void 0!==t?t:this.wavesurfer.getVolume(),this.setVolume(e.volume),this.subscriptions.push(this.wavesurfer.on("decode",(t=>{this.initPolyline(),this.points.forEach((e=>{this.addPolyPoint(e,t);}));})),this.wavesurfer.on("redraw",(()=>{var t;null===(t=this.polyline)||void 0===t||t.update();})),this.wavesurfer.on("timeupdate",(t=>{this.onTimeUpdate(t);})));}emitPoints(){this.throttleTimeout&&clearTimeout(this.throttleTimeout),this.throttleTimeout=setTimeout((()=>{this.emit("points-change",this.points);}),200);}initPolyline(){if(this.polyline&&this.polyline.destroy(),!this.wavesurfer)return;const t=this.wavesurfer.getWrapper();this.polyline=new r(this.options,t),this.subscriptions.push(this.polyline.on("point-move",((t,e,i)=>{var o;const n=(null===(o=this.wavesurfer)||void 0===o?void 0:o.getDuration())||0;t.time=e*n,t.volume=1-i,this.emitPoints();})),this.polyline.on("point-dragout",(t=>{this.removePoint(t);})),this.polyline.on("point-create",((t,e)=>{var i;this.addPoint({time:t*((null===(i=this.wavesurfer)||void 0===i?void 0:i.getDuration())||0),volume:1-e});})),this.polyline.on("line-move",(t=>{var e;this.points.forEach((e=>{e.volume=Math.min(1,Math.max(0,e.volume-t));})),this.emitPoints(),this.onTimeUpdate((null===(e=this.wavesurfer)||void 0===e?void 0:e.getCurrentTime())||0);})));}addPolyPoint(t,e){var i;null===(i=this.polyline)||void 0===i||i.addPolyPoint(t.time/e,t.volume,t);}onTimeUpdate(t){if(!this.wavesurfer)return;let e=this.points.find((e=>e.time>t));e||(e={time:this.wavesurfer.getDuration()||0,volume:0});let i=this.points.findLast((e=>e.time<=t));i||(i={time:0,volume:0});const o=e.time-i.time,n=e.volume-i.volume,s=i.volume+(t-i.time)*(n/o),r=Math.min(1,Math.max(0,s)),l=Math.round(100*r)/100;l!==this.getCurrentVolume()&&(this.setVolume(l),this.emit("volume-change",l));}}

    /**
     * 🚀 SQUIRREL APPLICATION - OPTIMIZED ES6 MODULE ENTRY POINT
     * Version optimisée avec chargement conditionnel et gestion d'erreurs
     */

    class SquirrelApp {
        constructor() {
            this.version = '1.0.0';
            this.modules = new Map();
            this.initialized = false;
        }

        async init() {
            try {
                // Phase 1: Core essentials
                await this.loadCoreModules();
                
                // Phase 2: Framework (lazy)
                await this.loadFrameworkModules();
                
                // Phase 3: Application (on demand)
                await this.loadApplicationModules();
                
                this.initialized = true;
                
                // Rendre la version disponible globalement
                window.SQUIRREL_VERSION = this.version;
                window.squirrel = this;
                
            } catch (error) {
                console.error('❌ Squirrel initialization failed:', error);
                this.handleInitError(error);
            }
        }

        async loadCoreModules() {
            const coreModules = [
                { name: 'utils', path: '../native/utils.js' }
            ];

            await this.loadModulesParallel(coreModules);
        }

        async loadFrameworkModules() {
            const frameworkModules = [
                { name: 'core', path: '../a/a.js' },
                { name: 'apis', path: '../a/apis.js', optional: true },
                { name: 'particles', path: '../a/particles/all.js', optional: true }
            ];

            await this.loadModulesParallel(frameworkModules);
        }

        async loadApplicationModules() {
            // Chargement conditionnel selon les besoins
            if (this.shouldLoadApplication()) {
                await this.loadModule('application', '../application/index.js', true);
            }
        }

        async loadModulesParallel(modules) {
            const promises = modules.map(module => 
                this.loadModule(module.name, module.path, module.optional)
            );
            
            const results = await Promise.allSettled(promises);
            
            // Log des résultats
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const isOptional = modules[index].optional;
                    if (isOptional) {
                        console.info(`ℹ️ Optional module ${modules[index].name} not loaded:`, result.reason.message);
                    } else {
                        console.warn(`⚠️ Module ${modules[index].name} failed to load:`, result.reason);
                    }
                }
            });
        }

        async loadModule(name, path, optional = false) {
            try {
                const module = await import(path);
                this.modules.set(name, module);
                return module;
            } catch (error) {
                if (optional) {
                    console.info(`ℹ️ Optional module ${name} not available:`, error.message);
                } else {
                    console.warn(`⚠️ Failed to load ${name}:`, error.message);
                    console.error('Full error:', error);
                }
                // Continuer sans ce module si non-critique
                return null;
            }
        }

        shouldLoadApplication() {
            // Ne pas charger l'application en mode debug core uniquement
            if (window.location.search.includes('debug=core')) {
                return false;
            }
            
            // Ne pas charger si on est dans un contexte de test spécifique
            if (window.location.pathname.includes('test-') && 
                !window.location.search.includes('app=true')) {
                return false;
            }
            
            // Ne pas charger si explicitement désactivé
            if (window.location.search.includes('app=false')) {
                return false;
            }
            
            // ARCHITECTURE SQUIRREL: Par défaut, charger l'application systématiquement
            return true;
        }

        handleInitError(error) {
            // Mode dégradé avec interface d'erreur
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #ff4444;
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            z-index: 10000;
            font-family: Arial, sans-serif;
        `;
            
            errorDiv.innerHTML = `
            <h2>❌ Erreur d'initialisation Squirrel</h2>
            <p>${error.message}</p>
            <button onclick="location.reload()" style="
                background: white;
                color: #ff4444;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 10px;
            ">Recharger</button>
        `;
            
            document.body.appendChild(errorDiv);
        }

        // API publique
        getModule(name) {
            return this.modules.get(name);
        }

        isReady() {
            return this.initialized;
        }

        getVersion() {
            return this.version;
        }

        listModules() {
            return Array.from(this.modules.keys());
        }
    }

    // Instance globale
    const squirrel = new SquirrelApp();

    // Auto-init selon l'état du DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => squirrel.init());
    } else {
        squirrel.init();
    }

    // Exposer les composants dans le scope global pour éviter les imports manuels
    window.Module = Module;
    window.Slider = Slider;
    window.Matrix = Matrix;
    window.SquirrelWaveSurfer = WaveSurfer; // Nom différent pour éviter le conflit
    window.WaveSurferComponent = WaveSurfer; // Alias plus explicite

    // Exposer WaveSurfer et ses plugins globalement (avec préfixes pour éviter les conflits)
    window.WaveSurfer = u$1; // Core WaveSurfer
    window.WaveSurferRegions = o$3;
    window.WaveSurferTimeline = r$5;
    window.WaveSurferMinimap = f;
    window.WaveSurferZoom = i$4;
    window.WaveSurferHover = r$3;
    window.WaveSurferSpectrogram = h;
    window.WaveSurferRecord = r$1;
    window.WaveSurferEnvelope = l;

    // Alias groupés pour faciliter l'utilisation
    window.WaveSurferPlugins = {
        Regions: o$3,
        Timeline: r$5,
        Minimap: f,
        Zoom: i$4,
        Hover: r$3,
        Spectrogram: h,
        Record: r$1,
        Envelope: l
    };

    /**
     * WaveSurfer.js v7.9.5 ES6 Module Loader for Tauri
     * Compatible with modern ES6 imports and Tauri's server environment
     */

    class WaveSurferV7Loader {
        constructor() {
            this.loadedPlugins = new Set();
            this.pluginCache = new Map();
            this.baseUrl = './js/wavesurfer-v7/';
        }

        /**
         * Load WaveSurfer.js main library
         */
        async loadWaveSurfer() {
            try {
                const module = await import(`${this.baseUrl}core/wavesurfer.esm.js`);
                window.WaveSurfer = module.default;
                console.log('✅ WaveSurfer.js v7.9.5 loaded successfully');
                return module.default;
            } catch (error) {
                console.error('❌ Failed to load WaveSurfer.js:', error);
                throw error;
            }
        }

        /**
         * Load a specific plugin
         */
        async loadPlugin(pluginName) {
            if (this.loadedPlugins.has(pluginName)) {
                return this.pluginCache.get(pluginName);
            }

            try {
                const module = await import(`${this.baseUrl}${pluginName}.esm.js`);
                this.loadedPlugins.add(pluginName);
                this.pluginCache.set(pluginName, module.default);
                console.log(`✅ Plugin ${pluginName} loaded successfully`);
                return module.default;
            } catch (error) {
                console.error(`❌ Failed to load plugin ${pluginName}:`, error);
                throw error;
            }
        }

        /**
         * Load multiple plugins
         */
        async loadPlugins(pluginNames = []) {
            const results = {};
            
            for (const pluginName of pluginNames) {
                try {
                    results[pluginName] = await this.loadPlugin(pluginName);
                } catch (error) {
                    console.warn(`⚠️ Could not load plugin ${pluginName}:`, error);
                    results[pluginName] = null;
                }
            }
            
            return results;
        }

        /**
         * Initialize WaveSurfer with plugins
         */
        async initialize(requiredPlugins = []) {
            try {
                // Load main library
                const WaveSurfer = await this.loadWaveSurfer();
                
                // Load plugins if requested
                if (requiredPlugins.length > 0) {
                    const plugins = await this.loadPlugins(requiredPlugins);
                    
                    // Attach plugins to WaveSurfer
                    Object.entries(plugins).forEach(([name, plugin]) => {
                        if (plugin) {
                            WaveSurfer.registerPlugin(plugin);
                            console.log(`🔌 Plugin ${name} registered`);
                        }
                    });
                }
                
                console.log('🚀 WaveSurfer.js v7.9.5 fully initialized with plugins');
                return WaveSurfer;
                
            } catch (error) {
                console.error('❌ Failed to initialize WaveSurfer:', error);
                throw error;
            }
        }

        /**
         * Get available plugins
         */
        getAvailablePlugins() {
            return [
                'regions',
                'timeline', 
                'minimap',
                'zoom',
                'hover',
                'spectrogram',
                'record',
                'envelope'
            ];
        }

        /**
         * Check if plugin is loaded
         */
        isPluginLoaded(pluginName) {
            return this.loadedPlugins.has(pluginName);
        }

        /**
         * Get loaded plugins
         */
        getLoadedPlugins() {
            return Array.from(this.loadedPlugins);
        }
    }

    // Global instance for compatibility
    window.WaveSurferV7Loader = new WaveSurferV7Loader();

    var wavesurferV7Loader = /*#__PURE__*/Object.freeze({
        __proto__: null,
        default: WaveSurferV7Loader
    });

    return squirrel;

})();
//# sourceMappingURL=bundle.js.map
