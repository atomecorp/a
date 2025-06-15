// Module Builder Component for Squirrel.js
// Permet de créer des modules/nodes avec inputs/outputs connectables
// Chaque élément est skinable avec un ID unique

class ModuleBuilder {
  constructor() {
    this.modules = new Map();
    this.connections = new Map();
    this.draggedConnector = null;
    this.selectedConnector = null; // Pour la connexion par clic
    this.connectionCallbacks = {
      onConnect: [],
      onDisconnect: [],
      onConnectionAttempt: []
    };
  }

  // Créer un nouveau module
  create(config) {
    const moduleId = config.id || `module_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Configuration par défaut
    const defaultConfig = {
      id: moduleId,
      name: 'Module',
      position: { x: 100, y: 100 },
      size: { width: 200, height: 150 },
      inputs: [],
      outputs: [],
      content: null,
      styling: {},
      draggable: true,
      resizable: false,
      template: null,
      callbacks: {}
    };

    const moduleConfig = { ...defaultConfig, ...config };
    
    // Créer le conteneur principal du module
    const moduleContainer = this._createModuleContainer(moduleConfig);
    
    // Créer le header
    const header = this._createModuleHeader(moduleConfig);
    
    // Créer la zone de contenu
    const contentArea = this._createContentArea(moduleConfig);
    
    // Créer les connecteurs
    const connectorsContainer = this._createConnectors(moduleConfig);
    
    // Assembler le module
    moduleContainer.appendChild(header);
    moduleContainer.appendChild(contentArea);
    moduleContainer.appendChild(connectorsContainer);
    
    // Ajouter les fonctionnalités
    this._addDragFunctionality(moduleContainer, moduleConfig);
    this._addConnectorFunctionality(moduleContainer, moduleConfig);
    
    // Stocker le module
    const moduleInstance = {
      id: moduleId,
      config: moduleConfig,
      element: moduleContainer,
      inputs: new Map(),
      outputs: new Map(),
      connections: new Set()
    };
    
    this.modules.set(moduleId, moduleInstance);
    
    // Callbacks
    if (moduleConfig.callbacks.onCreate) {
      moduleConfig.callbacks.onCreate(moduleInstance);
    }
    
    return moduleInstance;
  }

  // Créer le conteneur principal
  _createModuleContainer(config) {
    const container = $('div', {
      id: `${config.id}_container`,
      css: {
        position: 'absolute',
        left: `${config.position.x}px`,
        top: `${config.position.y}px`,
        width: `${config.size.width}px`,
        minHeight: `${config.size.height}px`,
        backgroundColor: '#f0f0f0',
        border: '2px solid #ccc',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        fontFamily: 'Arial, sans-serif',
        cursor: config.draggable ? 'move' : 'default',
        zIndex: '1000',
        ...config.styling.container
      }
    });
    
    return container;
  }

  // Créer le header du module
  _createModuleHeader(config) {
    const header = $('div', {
      id: `${config.id}_header`,
      css: {
        padding: '8px 12px',
        backgroundColor: '#e0e0e0',
        borderBottom: '1px solid #ccc',
        borderRadius: '6px 6px 0 0',
        fontWeight: 'bold',
        fontSize: '14px',
        userSelect: 'none',
        ...config.styling.header
      },
      text: config.name
    });
    
    return header;
  }

  // Créer la zone de contenu
  _createContentArea(config) {
    const contentArea = $('div', {
      id: `${config.id}_content`,
      css: {
        padding: '12px',
        minHeight: '60px',
        position: 'relative',
        ...config.styling.content
      }
    });

    // Ajouter le contenu dynamique en syntaxe Squirrel
    if (config.content) {
      if (typeof config.content === 'function') {
        // Si c'est une fonction, l'exécuter pour générer le contenu
        const dynamicContent = config.content();
        if (dynamicContent && dynamicContent.element) {
          contentArea.appendChild(dynamicContent.element);
        } else if (dynamicContent) {
          contentArea.appendChild(dynamicContent);
        }
      } else if (config.content.element) {
        // Si c'est déjà un élément Squirrel
        contentArea.appendChild(config.content.element);
      } else {
        // Si c'est un élément DOM direct
        contentArea.appendChild(config.content);
      }
    }
    
    return contentArea;
  }

  // Créer les connecteurs (inputs/outputs)
  _createConnectors(config) {
    const connectorsContainer = $('div', {
      id: `${config.id}_connectors`,
      css: {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none'
      }
    });

    // Créer les inputs (côté gauche)
    config.inputs.forEach((input, index) => {
      const connector = this._createConnector(config.id, input, 'input', index, config);
      connectorsContainer.appendChild(connector);
    });

    // Créer les outputs (côté droit)
    config.outputs.forEach((output, index) => {
      const connector = this._createConnector(config.id, output, 'output', index, config);
      connectorsContainer.appendChild(connector);
    });

    return connectorsContainer;
  }

  // Créer un connecteur individuel
  _createConnector(moduleId, connectorConfig, type, index, moduleConfig) {
    const connectorId = `${moduleId}_${type}_${index}`;
    const isInput = type === 'input';
    
    // Position du connecteur
    const yPosition = 40 + (index * 25); // Espacement vertical
    const xPosition = isInput ? -8 : moduleConfig.size.width - 8;
    
    const connector = $('div', {
      id: connectorId,
      css: {
        position: 'absolute',
        left: `${xPosition}px`,
        top: `${yPosition}px`,
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        backgroundColor: connectorConfig.color || (isInput ? '#4CAF50' : '#2196F3'),
        border: '2px solid #fff',
        cursor: 'pointer',
        pointerEvents: 'auto',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        transition: 'transform 0.2s ease',
        zIndex: '1001',
        ...moduleConfig.styling[`${type}Connector`]
      },
      title: connectorConfig.label || connectorConfig.name || `${type} ${index + 1}`
    });

    // Ajouter le label
    if (connectorConfig.label) {
      const label = $('span', {
        id: `${connectorId}_label`,
        css: {
          position: 'absolute',
          top: '18px',
          left: isInput ? '20px' : '-60px',
          fontSize: '11px',
          color: '#666',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          ...moduleConfig.styling[`${type}Label`]
        },
        text: connectorConfig.label
      });
      connector.appendChild(label);
    }

    // Stocker les données du connecteur
    connector.connectorData = {
      moduleId,
      type,
      index,
      config: connectorConfig,
      id: connectorId,
      connections: new Set()
    };

    return connector;
  }

  // Ajouter la fonctionnalité de drag pour le module
  _addDragFunctionality(moduleElement, config) {
    if (!config.draggable) return;

    let isDragging = false;
    let startX, startY, initialX, initialY;

    const header = moduleElement.querySelector(`#${config.id}_header`);
    
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('[data-connector]')) return; // Ne pas drag si on clique sur un connecteur
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialX = parseInt(moduleElement.style.left);
      initialY = parseInt(moduleElement.style.top);
      
      moduleElement.style.zIndex = '1002';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });

    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      moduleElement.style.left = `${initialX + deltaX}px`;
      moduleElement.style.top = `${initialY + deltaY}px`;
      
      // Mettre à jour les connexions visuelles
      this._updateConnections(config.id);
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        moduleElement.style.zIndex = '1000';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // Callback de fin de drag
        if (config.callbacks.onDragEnd) {
          config.callbacks.onDragEnd(config.id, {
            x: parseInt(moduleElement.style.left),
            y: parseInt(moduleElement.style.top)
          });
        }
      }
    };
  }

  // Ajouter la fonctionnalité de connexion
  _addConnectorFunctionality(moduleElement, config) {
    const connectors = moduleElement.querySelectorAll('[id*="_input_"], [id*="_output_"]');
    
    connectors.forEach(connector => {
      // Gestion du drag pour connexion
      connector.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this._startConnection(connector);
      });

      // Gestion du clic simple pour connexion
      connector.addEventListener('click', (e) => {
        e.stopPropagation();
        this._handleConnectorClick(connector);
      });

      connector.addEventListener('mouseenter', () => {
        connector.style.transform = 'scale(1.2)';
        // Indiquer visuellement si c'est un connecteur sélectionné
        if (this.selectedConnector === connector) {
          connector.style.boxShadow = '0 0 8px #FF5722';
        }
      });

      connector.addEventListener('mouseleave', () => {
        connector.style.transform = 'scale(1)';
        if (this.selectedConnector !== connector) {
          connector.style.boxShadow = '';
        }
      });

      connector.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        this._endConnection(connector);
      });
    });
  }

  // Gestion du clic sur connecteur (pour connexion par clic)
  _handleConnectorClick(connector) {
    if (!this.selectedConnector) {
      // Premier clic : sélectionner le connecteur
      this.selectedConnector = connector;
      connector.style.boxShadow = '0 0 8px #FF5722';
      connector.style.borderColor = '#FF5722';
      console.log('Connecteur sélectionné - cliquez sur un autre pour connecter');
    } else if (this.selectedConnector === connector) {
      // Clic sur le même connecteur : désélectionner
      this._clearSelectedConnector();
      console.log('Sélection annulée');
    } else {
      // Deuxième clic : créer la connexion
      this._createConnection(this.selectedConnector, connector);
      this._clearSelectedConnector();
    }
  }

  // Nettoyer la sélection de connecteur
  _clearSelectedConnector() {
    if (this.selectedConnector) {
      this.selectedConnector.style.boxShadow = '';
      this.selectedConnector.style.borderColor = '';
      this.selectedConnector = null;
    }
  }

  // Démarrer une connexion
  _startConnection(sourceConnector) {
    this.draggedConnector = sourceConnector;
    
    // Créer une ligne temporaire pour la visualisation
    this._createTempConnectionLine(sourceConnector);
    
    // Bind des méthodes pour conserver le contexte
    this.boundOnConnectionDrag = this._onConnectionDrag.bind(this);
    this.boundOnConnectionEnd = this._onConnectionEnd.bind(this);
    
    document.addEventListener('mousemove', this.boundOnConnectionDrag);
    document.addEventListener('mouseup', this.boundOnConnectionEnd);
  }

  // Gérer le drag de connexion
  _onConnectionDrag(e) {
    if (!this.draggedConnector || !this.tempLine) return;
    
    const rect = this.draggedConnector.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    
    // Calculer la distance et l'angle pour créer une vraie ligne
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
    
    // Positionner la ligne
    this.tempLine.style.left = `${startX}px`;
    this.tempLine.style.top = `${startY}px`;
    this.tempLine.style.width = `${distance}px`;
    this.tempLine.style.height = '2px';
    this.tempLine.style.transform = `rotate(${angle}deg)`;
    this.tempLine.style.transformOrigin = '0 50%';
  }

  // Terminer une connexion (mouseup global)
  _onConnectionEnd(e) {
    // Vérifier si on est sur un connecteur valide
    const targetConnector = e.target.closest('[id*="_input_"], [id*="_output_"]');
    
    if (this.draggedConnector && targetConnector && this.draggedConnector !== targetConnector) {
      this._createConnection(this.draggedConnector, targetConnector);
    }
    
    this._cleanupTempConnection();
  }

  // Terminer une connexion (mouseup sur connecteur spécifique)
  _endConnection(targetConnector) {
    if (this.draggedConnector && targetConnector && this.draggedConnector !== targetConnector) {
      this._createConnection(this.draggedConnector, targetConnector);
    }
    
    this._cleanupTempConnection();
  }

  // Nettoyer la connexion temporaire
  _cleanupTempConnection() {
    if (this.tempLine) {
      this.tempLine.remove();
      this.tempLine = null;
    }
    
    this.draggedConnector = null;
    
    if (this.boundOnConnectionDrag) {
      document.removeEventListener('mousemove', this.boundOnConnectionDrag);
      this.boundOnConnectionDrag = null;
    }
    
    if (this.boundOnConnectionEnd) {
      document.removeEventListener('mouseup', this.boundOnConnectionEnd);
      this.boundOnConnectionEnd = null;
    }
  }

  // Créer une ligne de connexion temporaire
  _createTempConnectionLine(connector) {
    this.tempLine = $('div', {
      css: {
        position: 'fixed',
        backgroundColor: '#FF5722',
        height: '2px',
        zIndex: '999',
        pointerEvents: 'none',
        opacity: '0.7'
      }
    });
    
    document.body.appendChild(this.tempLine);
  }

  // Créer une connexion permanente
  _createConnection(sourceConnector, targetConnector) {
    const sourceData = sourceConnector.connectorData;
    const targetData = targetConnector.connectorData;
    
    // Vérifier que la connexion est valide (input vers output ou vice versa)
    if (sourceData.type === targetData.type) {
      console.warn('Connexion invalide: même type de connecteur');
      return;
    }
    
    const connectionId = `${sourceData.id}_to_${targetData.id}`;
    
    // Vérifier si la connexion existe déjà
    if (this.connections.has(connectionId)) {
      console.warn('Connexion déjà existante');
      return;
    }
    
    // Créer la ligne de connexion
    const connectionLine = this._createConnectionLine(sourceConnector, targetConnector);
    
    // Stocker la connexion
    const connection = {
      id: connectionId,
      source: sourceData,
      target: targetData,
      element: connectionLine
    };
    
    this.connections.set(connectionId, connection);
    sourceData.connections.add(connectionId);
    targetData.connections.add(connectionId);
    
    // Callbacks
    this.connectionCallbacks.onConnect.forEach(callback => {
      callback(connection);
    });
    
    console.log(`Connexion créée: ${sourceData.moduleId} -> ${targetData.moduleId}`);
  }

  // Créer une ligne de connexion visuelle
  _createConnectionLine(sourceConnector, targetConnector) {
    const line = $('div', {
      id: `connection_${Date.now()}`,
      css: {
        position: 'fixed',
        backgroundColor: '#2196F3',
        height: '2px',
        zIndex: '998',
        pointerEvents: 'auto',
        cursor: 'pointer'
      }
    });
    
    // Ajouter la possibilité de supprimer la connexion
    line.addEventListener('dblclick', () => {
      this._removeConnection(line);
    });
    
    document.body.appendChild(line);
    this._updateConnectionLine(line, sourceConnector, targetConnector);
    
    return line;
  }

  // Mettre à jour la position d'une ligne de connexion
  _updateConnectionLine(line, sourceConnector, targetConnector) {
    const sourceRect = sourceConnector.getBoundingClientRect();
    const targetRect = targetConnector.getBoundingClientRect();
    
    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;
    
    const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
    
    line.style.left = `${startX}px`;
    line.style.top = `${startY}px`;
    line.style.width = `${length}px`;
    line.style.transform = `rotate(${angle}deg)`;
    line.style.transformOrigin = '0 50%';
  }

  // Mettre à jour toutes les connexions d'un module
  _updateConnections(moduleId) {
    this.connections.forEach(connection => {
      if (connection.source.moduleId === moduleId || connection.target.moduleId === moduleId) {
        const sourceElement = document.getElementById(connection.source.id);
        const targetElement = document.getElementById(connection.target.id);
        
        if (sourceElement && targetElement) {
          this._updateConnectionLine(connection.element, sourceElement, targetElement);
        }
      }
    });
  }

  // Supprimer une connexion
  _removeConnection(connectionElement) {
    const connectionId = Array.from(this.connections.entries())
      .find(([id, conn]) => conn.element === connectionElement)?.[0];
    
    if (connectionId) {
      const connection = this.connections.get(connectionId);
      
      // Supprimer l'élément visuel
      connectionElement.remove();
      
      // Nettoyer les références
      connection.source.connections.delete(connectionId);
      connection.target.connections.delete(connectionId);
      this.connections.delete(connectionId);
      
      // Callbacks
      this.connectionCallbacks.onDisconnect.forEach(callback => {
        callback(connection);
      });
      
      console.log(`Connexion supprimée: ${connectionId}`);
    }
  }

  // API publique pour les callbacks
  onConnect(callback) {
    this.connectionCallbacks.onConnect.push(callback);
  }

  onDisconnect(callback) {
    this.connectionCallbacks.onDisconnect.push(callback);
  }

  onConnectionAttempt(callback) {
    this.connectionCallbacks.onConnectionAttempt.push(callback);
  }

  // API publique pour nettoyer la sélection
  clearSelection() {
    this._clearSelectedConnector();
  }

  // Obtenir un module par ID
  getModule(moduleId) {
    return this.modules.get(moduleId);
  }

  // Obtenir tous les modules
  getModules() {
    return Array.from(this.modules.values());
  }

  // Obtenir toutes les connexions
  getConnections() {
    return Array.from(this.connections.values());
  }

  // Obtenir tous les modules
  getModules() {
    return Array.from(this.modules.values());
  }

  // Supprimer un module
  removeModule(moduleId) {
    const module = this.modules.get(moduleId);
    if (module) {
      // Nettoyer la sélection si elle concerne ce module
      if (this.selectedConnector && this.selectedConnector.connectorData.moduleId === moduleId) {
        this._clearSelectedConnector();
      }
      
      // Supprimer toutes les connexions du module
      module.connections.forEach(connectionId => {
        const connection = this.connections.get(connectionId);
        if (connection) {
          this._removeConnection(connection.element);
        }
      });
      
      // Supprimer l'élément DOM
      module.element.remove();
      
      // Supprimer de la map
      this.modules.delete(moduleId);
    }
  }

  // Exporter la configuration actuelle
  exportConfig() {
    const config = {
      modules: [],
      connections: []
    };
    
    this.modules.forEach(module => {
      config.modules.push({
        id: module.id,
        config: module.config,
        position: {
          x: parseInt(module.element.style.left),
          y: parseInt(module.element.style.top)
        }
      });
    });
    
    this.connections.forEach(connection => {
      config.connections.push({
        source: {
          moduleId: connection.source.moduleId,
          type: connection.source.type,
          index: connection.source.index
        },
        target: {
          moduleId: connection.target.moduleId,
          type: connection.target.type,
          index: connection.target.index
        }
      });
    });
    
    return config;
  }
}

// Template prédéfinis
const ModuleTemplates = {
  // Template simple
  simple: {
    size: { width: 150, height: 100 },
    inputs: [{ label: 'In', color: '#4CAF50' }],
    outputs: [{ label: 'Out', color: '#2196F3' }],
    content: () => $('div', {
      text: 'Simple Module',
      css: { textAlign: 'center', padding: '10px', fontSize: '12px' }
    })
  },
  
  // Template pour contrôles audio
  audioControl: {
    size: { width: 200, height: 120 },
    inputs: [{ label: 'Audio In', color: '#FF5722' }],
    outputs: [{ label: 'Audio Out', color: '#FF5722' }],
    styling: {
      container: { backgroundColor: '#2c2c2c', color: '#fff' },
      header: { backgroundColor: '#1a1a1a' }
    },
    content: () => {
      const container = $('div', { css: { padding: '5px' } });
      
      // Volume slider
      const volumeSlider = $('input', {
        type: 'range',
        min: '0',
        max: '100',
        value: '50',
        css: {
          width: '100%',
          margin: '5px 0'
        }
      });
      
      const volumeLabel = $('div', {
        text: 'Volume: 50%',
        css: { fontSize: '11px', textAlign: 'center' }
      });
      
      volumeSlider.addEventListener('input', (e) => {
        volumeLabel.textContent = `Volume: ${e.target.value}%`;
      });
      
      container.appendChild(volumeLabel);
      container.appendChild(volumeSlider);
      
      return container;
    }
  },
  
  // Template pour générateurs
  generator: {
    size: { width: 180, height: 100 },
    inputs: [],
    outputs: [
      { label: 'Signal', color: '#4CAF50' },
      { label: 'Trigger', color: '#FF9800' }
    ],
    content: () => {
      const container = $('div', { css: { padding: '5px', textAlign: 'center' } });
      
      const button = $('button', {
        text: 'Generate',
        css: {
          padding: '5px 10px',
          background: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '3px',
          cursor: 'pointer',
          fontSize: '11px'
        }
      });
      
      button.addEventListener('click', () => {
        console.log('Generator triggered!');
      });
      
      container.appendChild(button);
      return container;
    }
  },
  
  // Template pour processeurs
  processor: {
    size: { width: 160, height: 120 },
    inputs: [
      { label: 'Input', color: '#4CAF50' },
      { label: 'Control', color: '#9C27B0' }
    ],
    outputs: [{ label: 'Output', color: '#4CAF50' }],
    content: () => {
      const container = $('div', { css: { padding: '5px' } });
      
      const typeSelect = $('select', {
        css: {
          width: '100%',
          padding: '2px',
          fontSize: '11px',
          margin: '5px 0'
        }
      });
      
      ['Low Pass', 'High Pass', 'Band Pass', 'Notch'].forEach(option => {
        const optionEl = $('option', {
          value: option.toLowerCase().replace(' ', '_'),
          text: option
        });
        typeSelect.appendChild(optionEl);
      });
      
      const label = $('div', {
        text: 'Filter Type:',
        css: { fontSize: '10px', marginBottom: '3px' }
      });
      
      container.appendChild(label);
      container.appendChild(typeSelect);
      
      return container;
    }
  },
  
  // Template pour affichage de données
  display: {
    size: { width: 180, height: 140 },
    inputs: [{ label: 'Data', color: '#2196F3' }],
    outputs: [],
    content: () => {
      const container = $('div', { css: { padding: '5px' } });
      
      const display = $('div', {
        css: {
          backgroundColor: '#000',
          color: '#0f0',
          padding: '10px',
          fontFamily: 'monospace',
          fontSize: '10px',
          height: '60px',
          overflow: 'auto',
          border: '1px solid #333'
        },
        text: 'Waiting for data...'
      });
      
      container.appendChild(display);
      return container;
    }
  },
  
  // Template pour contrôles MIDI
  midiControl: {
    size: { width: 200, height: 100 },
    inputs: [{ label: 'MIDI', color: '#E91E63' }],
    outputs: [{ label: 'Control', color: '#9C27B0' }],
    styling: {
      container: { backgroundColor: '#1a1a2e' },
      header: { backgroundColor: '#16213e', color: '#fff' }
    },
    content: () => {
      const container = $('div', { css: { padding: '5px', color: '#fff' } });
      
      const ccLabel = $('div', {
        text: 'CC: 74',
        css: { fontSize: '11px', marginBottom: '5px' }
      });
      
      const valueLabel = $('div', {
        text: 'Value: 0',
        css: { fontSize: '11px', textAlign: 'center' }
      });
      
      container.appendChild(ccLabel);
      container.appendChild(valueLabel);
      
      return container;
    }
  }
};

// Export pour utilisation
window.ModuleBuilder = ModuleBuilder;
window.ModuleTemplates = ModuleTemplates;

// Intégration avec Squirrel.js
if (typeof $ !== 'undefined') {
  // Ajouter la méthode module à l'API Squirrel
  $.module = function(config) {
    if (!window.moduleBuilderInstance) {
      window.moduleBuilderInstance = new ModuleBuilder();
    }
    return window.moduleBuilderInstance.create(config);
  };
  
  // Alias pour les templates
  $.moduleTemplates = ModuleTemplates;
}
