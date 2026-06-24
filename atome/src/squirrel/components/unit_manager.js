// Extracted from unit_builder.js: UnitManager — registry of units + connections + selection state.
class UnitManager {
  constructor() {
    this.units = new Map();
    this.connections = new Map();
    this.selectedUnits = new Set();
    this.dragState = null;
    this.connectionMode = false;
    this.firstConnector = null;
    this.nextUnitId = 1;
    this.nextConnectorId = 1;
    this.nextConnectionId = 1;

    // État pour le drag de connecteurs
    this.connectorDragState = {
      isDragging: false,
      sourceConnector: null,
      dragLine: null
    };

    this.setupGlobalListeners();
  }

  setupGlobalListeners() {
    // Désélectionner tout au clic sur le fond
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.unit-container') && !e.target.closest('.unit-connector')) {
        this.deselectAll();
      }
    });
  }

  generateUnitId() {
    return `unit_${this.nextUnitId++}`;
  }

  generateConnectorId() {
    return `connector_${this.nextConnectorId++}`;
  }

  generateConnectionId() {
    return `connection_${this.nextConnectionId++}`;
  }

  registerUnit(unit) {
    this.units.set(unit.id, unit);
  }

  unregisterUnit(unitId) {
    // Supprimer toutes les connexions liées à ce unit
    this.removeAllConnectionsForUnit(unitId);
    this.units.delete(unitId);
    this.selectedUnits.delete(unitId);
  }

  removeAllConnectionsForUnit(unitId) {
    const connectionsToRemove = [];
    this.connections.forEach((connection, connectionId) => {
      if (connection.fromUnit === unitId || connection.toUnit === unitId) {
        connectionsToRemove.push(connectionId);
      }
    });
    connectionsToRemove.forEach(id => this.removeConnection(id));
  }

  selectUnit(unitId) {
    this.selectedUnits.add(unitId);
    const unit = this.units.get(unitId);
    if (unit) {
      unit.element.classList.add('unit-selected');
    }
  }

  deselectUnit(unitId) {
    this.selectedUnits.delete(unitId);
    const unit = this.units.get(unitId);
    if (unit) {
      unit.element.classList.remove('unit-selected');
    }
  }

  deselectAll() {
    this.selectedUnits.forEach(unitId => this.deselectUnit(unitId));
  }

  getSelectedUnits() {
    return Array.from(this.selectedUnits);
  }

  createConnection(fromUnitId, fromConnectorId, toUnitId, toConnectorId) {
    const connectionId = this.generateConnectionId();
    const connection = {
      id: connectionId,
      fromUnit: fromUnitId,
      fromConnector: fromConnectorId,
      toUnit: toUnitId,
      toConnector: toConnectorId
    };

    this.connections.set(connectionId, connection);
    this.renderConnection(connection);
    return connectionId;
  }

  removeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      const connectionElement = document.querySelector(`[data-connection-id="${connectionId}"]`);
      if (connectionElement) {
        connectionElement.remove();
      }
      this.connections.delete(connectionId);
    }
  }

  renderConnection(connection) {
    const fromUnit = this.units.get(connection.fromUnit);
    const toUnit = this.units.get(connection.toUnit);

    if (!fromUnit || !toUnit) return;

    const fromConnector = fromUnit.element.querySelector(`[data-connector-id="${connection.fromConnector}"]`);
    const toConnector = toUnit.element.querySelector(`[data-connector-id="${connection.toConnector}"]`);

    if (!fromConnector || !toConnector) return;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('data-connection-id', connection.id);
    line.classList.add('unit-connection-line');

    this.updateConnectionPosition(line, fromConnector, toConnector);

    // Ajouter la ligne au SVG container (créé s'il n'existe pas)
    let svg = document.querySelector('.unit-connections-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('unit-connections-svg');
      svg.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 50;
      `;
      document.body.appendChild(svg);
    }

    svg.appendChild(line);
  }

  updateConnectionPosition(line, fromConnector, toConnector) {
    const fromRect = fromConnector.getBoundingClientRect();
    const toRect = toConnector.getBoundingClientRect();

    const fromX = fromRect.left + fromRect.width / 2;
    const fromY = fromRect.top + fromRect.height / 2;
    const toX = toRect.left + toRect.width / 2;
    const toY = toRect.top + toRect.height / 2;

    line.setAttribute('x1', fromX);
    line.setAttribute('y1', fromY);
    line.setAttribute('x2', toX);
    line.setAttribute('y2', toY);
    line.setAttribute('stroke', '#666');
    line.setAttribute('stroke-width', '2');
  }

  updateAllConnections() {
    this.connections.forEach(connection => {
      const line = document.querySelector(`[data-connection-id="${connection.id}"]`);
      if (line) {
        const fromUnit = this.units.get(connection.fromUnit);
        const toUnit = this.units.get(connection.toUnit);

        if (fromUnit && toUnit) {
          const fromConnector = fromUnit.element.querySelector(`[data-connector-id="${connection.fromConnector}"]`);
          const toConnector = toUnit.element.querySelector(`[data-connector-id="${connection.toConnector}"]`);

          if (fromConnector && toConnector) {
            this.updateConnectionPosition(line, fromConnector, toConnector);
          }
        }
      }
    });
  }

  getAllConnections() {
    return Array.from(this.connections.values());
  }

  handleConnectorClick(unitId, connectorId, connectorType) {
    if (!this.firstConnector) {
      // Premier connecteur sélectionné
      this.firstConnector = { unitId, connectorId, connectorType };
      this.highlightConnector(unitId, connectorId, true);
    } else {
      // Deuxième connecteur sélectionné
      const { unitId: firstUnitId, connectorId: firstConnectorId, connectorType: firstType } = this.firstConnector;

      // Vérifier que ce ne sont pas les mêmes connecteurs
      if (firstUnitId !== unitId || firstConnectorId !== connectorId) {
        // Vérifier qu'un est input et l'autre output
        if ((firstType === 'input' && connectorType === 'output') ||
          (firstType === 'output' && connectorType === 'input')) {

          // Déterminer fromUnit/fromConnector et toUnit/toConnector
          let fromUnitId, fromConnectorId, toUnitId, toConnectorId;
          if (firstType === 'output') {
            fromUnitId = firstUnitId;
            fromConnectorId = firstConnectorId;
            toUnitId = unitId;
            toConnectorId = connectorId;
          } else {
            fromUnitId = unitId;
            fromConnectorId = connectorId;
            toUnitId = firstUnitId;
            toConnectorId = firstConnectorId;
          }

          // Vérifier s'il existe déjà une connexion entre ces connecteurs
          const existingConnection = Array.from(this.connections.values()).find(conn =>
            conn.fromUnit === fromUnitId &&
            conn.fromConnector === fromConnectorId &&
            conn.toUnit === toUnitId &&
            conn.toConnector === toConnectorId
          );

          if (existingConnection) {
            // Déconnecter
            this.removeConnection(existingConnection.id);
          } else {
            // Connecter
            this.createConnection(fromUnitId, fromConnectorId, toUnitId, toConnectorId);
          }
        }
      }

      // Reset de la sélection
      this.highlightConnector(firstUnitId, firstConnectorId, false);
      this.firstConnector = null;
    }
  }

  highlightConnector(unitId, connectorId, highlight) {
    const unit = this.units.get(unitId);
    if (unit) {
      const connector = unit.element.querySelector(`[data-connector-id="${connectorId}"]`);
      if (connector) {
        if (highlight) {
          connector.classList.add('connector-selected');
        } else {
          connector.classList.remove('connector-selected');
        }
      }
    }
  }

  // === MÉTHODES POUR LE DRAG DE CONNECTEURS ===

  startConnectorDrag(unitId, connectorId, connectorType, event) {
    event.preventDefault();
    event.stopPropagation();

    this.connectorDragState.isDragging = true;
    this.connectorDragState.sourceConnector = { unitId, connectorId, connectorType };

    // Créer une ligne temporaire pour visualiser la connexion
    this.createDragLine(event);

    // Ajouter les listeners globaux
    document.addEventListener('mousemove', this.handleConnectorDragMove.bind(this));
    document.addEventListener('mouseup', this.handleConnectorDragEnd.bind(this));
  }

  createDragLine(event) {
    // Obtenir ou créer le SVG container
    let svg = document.querySelector('.unit-connections-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('unit-connections-svg');
      svg.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 50;
      `;
      document.body.appendChild(svg);
    }

    // Créer la ligne temporaire
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.classList.add('unit-drag-line');
    line.setAttribute('stroke', '#007bff');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '5,5');
    line.setAttribute('opacity', '0.8');

    const sourceConnector = this.getConnectorElement(
      this.connectorDragState.sourceConnector.unitId,
      this.connectorDragState.sourceConnector.connectorId
    );

    if (sourceConnector) {
      const rect = sourceConnector.getBoundingClientRect();
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;

      line.setAttribute('x1', startX);
      line.setAttribute('y1', startY);
      line.setAttribute('x2', event.clientX);
      line.setAttribute('y2', event.clientY);
    }

    svg.appendChild(line);
    this.connectorDragState.dragLine = line;
  }

  handleConnectorDragMove(event) {
    if (!this.connectorDragState.isDragging || !this.connectorDragState.dragLine) return;

    // Mettre à jour la position de fin de la ligne
    this.connectorDragState.dragLine.setAttribute('x2', event.clientX);
    this.connectorDragState.dragLine.setAttribute('y2', event.clientY);

    // Highlight du connecteur cible potentiel
    const targetElement = document.elementFromPoint(event.clientX, event.clientY);
    if (targetElement && targetElement.classList.contains('unit-connector')) {
      const targetConnectorId = targetElement.getAttribute('data-connector-id');
      const targetConnectorType = targetElement.getAttribute('data-connector-type');
      const targetUnitId = targetElement.closest('.unit-container').getAttribute('data-unit-id');

      // Vérifier si c'est un connecteur valide pour la connexion
      const sourceType = this.connectorDragState.sourceConnector.connectorType;
      if ((sourceType === 'output' && targetConnectorType === 'input') ||
        (sourceType === 'input' && targetConnectorType === 'output')) {
        targetElement.classList.add('connector-drag-hover');
      }
    }

    // Supprimer les anciens highlights
    document.querySelectorAll('.connector-drag-hover').forEach(el => {
      if (!el.contains(targetElement)) {
        el.classList.remove('connector-drag-hover');
      }
    });
  }

  handleConnectorDragEnd(event) {
    if (!this.connectorDragState.isDragging) return;

    // Supprimer la ligne temporaire
    if (this.connectorDragState.dragLine) {
      this.connectorDragState.dragLine.remove();
    }

    // Trouver le connecteur cible
    const targetElement = document.elementFromPoint(event.clientX, event.clientY);
    if (targetElement && targetElement.classList.contains('unit-connector')) {
      const targetConnectorId = targetElement.getAttribute('data-connector-id');
      const targetConnectorType = targetElement.getAttribute('data-connector-type');
      const targetUnitId = targetElement.closest('.unit-container').getAttribute('data-unit-id');

      const source = this.connectorDragState.sourceConnector;

      // Vérifier si c'est une connexion valide
      if ((source.connectorType === 'output' && targetConnectorType === 'input') ||
        (source.connectorType === 'input' && targetConnectorType === 'output')) {

        // Déterminer fromUnit/fromConnector et toUnit/toConnector
        let fromUnitId, fromConnectorId, toUnitId, toConnectorId;
        if (source.connectorType === 'output') {
          fromUnitId = source.unitId;
          fromConnectorId = source.connectorId;
          toUnitId = targetUnitId;
          toConnectorId = targetConnectorId;
        } else {
          fromUnitId = targetUnitId;
          fromConnectorId = targetConnectorId;
          toUnitId = source.unitId;
          toConnectorId = source.connectorId;
        }

        // Vérifier s'il existe déjà une connexion
        const existingConnection = Array.from(this.connections.values()).find(conn =>
          conn.fromUnit === fromUnitId &&
          conn.fromConnector === fromConnectorId &&
          conn.toUnit === toUnitId &&
          conn.toConnector === toConnectorId
        );

        if (existingConnection) {
          // Déconnecter
          this.removeConnection(existingConnection.id);
        } else {
          // Connecter
          this.createConnection(fromUnitId, fromConnectorId, toUnitId, toConnectorId);
        }
      }
    }

    // Nettoyer
    document.querySelectorAll('.connector-drag-hover').forEach(el => {
      el.classList.remove('connector-drag-hover');
    });

    document.removeEventListener('mousemove', this.handleConnectorDragMove.bind(this));
    document.removeEventListener('mouseup', this.handleConnectorDragEnd.bind(this));

    this.connectorDragState.isDragging = false;
    this.connectorDragState.sourceConnector = null;
    this.connectorDragState.dragLine = null;
  }

  getConnectorElement(unitId, connectorId) {
    const unit = this.units.get(unitId);
    if (unit) {
      return unit.element.querySelector(`[data-connector-id="${connectorId}"]`);
    }
    return null;
  }
}

// Instance globale du gestionnaire

export const unitManager = new UnitManager();
export { UnitManager };
