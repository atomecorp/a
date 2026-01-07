import { $, define } from '../squirrel.js';

/**
 * Composant Unit Builder avec HyperSquirrel
 * Créer des blocs graphiques draggables connectables entre eux
 */

// === GESTIONNAIRE GLOBAL DES UNITS ===
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
const unitManager = new UnitManager();

// === DÉFINITION DES TEMPLATES ===

// Template pour le conteneur principal du unit
define('unit-container', {
  tag: 'div',
  class: 'unit-container',
  css: {
    position: 'absolute',
    minWidth: '120px',
    minHeight: '80px',
    backgroundColor: '#f8f9fa',
    border: '2px solid #ddd',
    borderRadius: '8px',
    cursor: 'move',
    userSelect: 'none',
    overflow: 'visible',
    zIndex: '100'
  }
});

// Template pour l'en-tête du unit
define('unit-header', {
  tag: 'div',
  class: 'unit-header',
  css: {
    backgroundColor: '#e9ecef',
    borderBottom: '1px solid #ddd',
    borderRadius: '6px 6px 0 0',
    padding: '8px 12px',
    fontWeight: 'bold',
    fontSize: '14px',
    color: '#333',
    cursor: 'move'
  }
});

// Template pour le nom éditable
define('unit-name', {
  tag: 'span',
  class: 'unit-name',
  css: {
    display: 'block',
    outline: 'none',
    backgroundColor: 'transparent',
    border: 'none'
  }
});

// Template pour le corps du unit
define('unit-body', {
  tag: 'div',
  class: 'unit-body',
  css: {
    padding: '8px 12px', // Réduire le padding vertical
    minHeight: '32px', // Réduire la hauteur minimale
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  }
});

// Template pour l'icône
define('unit-icon', {
  tag: 'img',
  class: 'unit-icon',
  attrs: { draggable: 'false' },
  css: {
    maxWidth: '32px',
    maxHeight: '32px',
    objectFit: 'contain',
    pointerEvents: 'none'
  }
});

// Template pour les connecteurs
define('unit-connector', {
  tag: 'div',
  class: 'unit-connector',
  css: {
    zIndex: '2',
    position: 'absolute',
    width: '12px',
    height: '12px',
    backgroundColor: '#007bff',
    borderRadius: '50%',
    cursor: 'pointer',
    border: '2px solid #fff',
    boxShadow: '0 0 0 1px #007bff'
  }
});

// Template pour les connecteurs d'entrée
define('unit-connector-input', {
  tag: 'div',
  class: 'unit-connector unit-connector-input',
  css: {
    position: 'absolute',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    cursor: 'pointer',
    border: '2px solid #fff',
    left: '-8px',
    backgroundColor: '#28a745',
    boxShadow: '0 0 0 1px #28a745'
  }
});

// Template pour les connecteurs de sortie
define('unit-connector-output', {
  tag: 'div',
  class: 'unit-connector unit-connector-output',
  css: {
    position: 'absolute',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    cursor: 'pointer',
    border: '2px solid #fff',
    right: '-8px',
    backgroundColor: '#dc3545',
    boxShadow: '0 0 0 1px #dc3545'
  }
});

// === CSS GLOBAL ===
const unitStyles = `
  .unit-selected {
    border-color: #007bff !important;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25) !important;
  }
  
  .unit-name[contenteditable="true"] {
    background-color: rgba(255, 255, 255, 0.9) !important;
    border: none !important;
    border-radius: 3px !important;
    padding: 0 !important;
    outline: none !important;
    box-shadow: inset 0 0 0 1px rgba(0, 123, 255, 0.3) !important;
  }
  
  .connector-selected {
    transform: scale(1.3) !important;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.4) !important;
  }
  
  .unit-connector:hover {
    transform: scale(1.2);
  }
  
  .connector-drag-hover {
    transform: scale(1.4) !important;
    box-shadow: 0 0 0 4px rgba(40, 167, 69, 0.6) !important;
  }
  
  .unit-icon.animated {
    animation: iconPulse 0.3s ease;
  }
  
  @keyframes iconPulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }
`;

// Injecter les styles
if (!document.querySelector('#unit-styles')) {
  const style = document.createElement('style');
  style.id = 'unit-styles';
  style.textContent = unitStyles;
  document.head.appendChild(style);
}

// === CLASSE UNIT ===
class Unit {
  constructor(options = {}) {
    const {
      id = unitManager.generateUnitId(),
      name = 'Unit',
      position = { x: 100, y: 100 },
      inputs = [],
      outputs = [],
      icon = null,
      iconSrc = null,
      backgroundColor = null,
      parent = null
    } = options;

    this.id = id;
    this.name = name;
    this.position = position;
    this.inputs = [];
    this.outputs = [];
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.isEditingName = false;
    this.backgroundColor = backgroundColor;
    this.parent = parent;

    this.createElement();
    this.setupDragging();
    this.setupSelection();
    this.setupNameEditing();
    this.setPosition(position.x, position.y);

    // Appliquer la couleur de fond si fournie
    if (backgroundColor) {
      this.setBackgroundColor(backgroundColor);
    }

    // Ajouter au DOM d'abord
    unitManager.registerUnit(this);

    // Utiliser le parent spécifié ou document.body par défaut
    const parentElement = this.getParentElement();
    parentElement.appendChild(this.element);

    // Puis ajouter les connecteurs
    inputs.forEach(input => this.addInput(input));
    outputs.forEach(output => this.addOutput(output));

    // Ajuster la hauteur initiale du module
    this.adjustModuleHeight();

    // Ajouter l'icône si fournie
    if (icon || iconSrc) {
      this.setIcon(icon || iconSrc);
    }
  }

  createElement() {
    this.element = $('unit-container', {
      attrs: { 'data-unit-id': this.id }
    });

    this.header = $('unit-header');
    this.nameElement = $('unit-name', { text: this.name });
    this.body = $('unit-body');

    this.header.appendChild(this.nameElement);
    this.element.appendChild(this.header);
    this.element.appendChild(this.body);
  }

  getParentElement() {
    if (!this.parent) {
      return document.body;
    }

    // Si parent est une string, traiter comme ID ou sélecteur
    if (typeof this.parent === 'string') {
      if (this.parent.startsWith('#')) {
        return document.querySelector(this.parent) || document.body;
      } else {
        return document.getElementById(this.parent) || document.body;
      }
    }

    // Si parent est un élément DOM
    if (this.parent && this.parent.nodeType === Node.ELEMENT_NODE) {
      return this.parent;
    }

    // Fallback
    return document.body;
  }

  setupDragging() {
    let startX, startY, startPosX, startPosY;

    const handleMouseDown = (e) => {
      if (this.isEditingName) return;

      this.isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPosX = this.position.x;
      startPosY = this.position.y;

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      e.preventDefault();
    };

    const handleMouseMove = (e) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      this.setPosition(startPosX + deltaX, startPosY + deltaY);
      unitManager.updateAllConnections();
    };

    const handleMouseUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    this.header.addEventListener('mousedown', handleMouseDown);
  }

  setupSelection() {
    this.element.addEventListener('click', (e) => {
      e.stopPropagation();

      if (e.ctrlKey || e.metaKey) {
        // Multi-sélection
        if (unitManager.selectedUnits.has(this.id)) {
          unitManager.deselectUnit(this.id);
        } else {
          unitManager.selectUnit(this.id);
        }
      } else {
        // Sélection simple
        unitManager.deselectAll();
        unitManager.selectUnit(this.id);
      }
    });
  }

  setupNameEditing() {
    this.nameElement.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.startNameEditing();
    });
  }

  startNameEditing() {
    this.isEditingName = true;
    this.nameElement.contentEditable = true;
    this.nameElement.focus();

    // Sélectionner tout le texte
    const range = document.createRange();
    range.selectNodeContents(this.nameElement);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    const finishEditing = () => {
      this.isEditingName = false;
      this.nameElement.contentEditable = false;
      this.name = this.nameElement.textContent.trim() || 'Unit';
      this.nameElement.textContent = this.name;
    };

    this.nameElement.addEventListener('blur', finishEditing, { once: true });
    this.nameElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.nameElement.blur();
      }
    });
  }

  setPosition(x, y) {
    this.position.x = x;
    this.position.y = y;
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }

  setBackgroundColor(color) {
    this.backgroundColor = color;
    if (this.element) {
      this.element.style.backgroundColor = color;
    }
  }

  setIcon(iconData) {
    // Supprimer l'ancienne icône
    const oldIcon = this.body.querySelector('.unit-icon');
    if (oldIcon) {
      oldIcon.remove();
    }

    if (!iconData) return;

    const icon = $('unit-icon');

    // Désactiver le drag par défaut sur l'image
    icon.draggable = false;


    this.body.appendChild(icon);
    this.iconElement = icon;
  }

  animateIcon() {
    if (this.iconElement) {
      this.iconElement.classList.add('animated');
      setTimeout(() => {
        this.iconElement.classList.remove('animated');
      }, 300);
    }
  }

  addInput(options = {}) {
    const {
      id = unitManager.generateConnectorId(),
      name = `Input ${this.inputs.length + 1}`,
      color = '#28a745'
    } = options;

    const connector = $('unit-connector-input', {
      attrs: {
        'data-connector-id': id,
        'data-connector-type': 'input',
        'title': name
      }
    });

    if (color) {
      connector.style.backgroundColor = color;
      connector.style.boxShadow = `0 0 0 1px ${color}`;
    }

    // Positionner le connecteur
    const inputIndex = this.inputs.length;
    const spacing = 20;
    const headerHeight = 35; // Hauteur du header
    const bodyPaddingTop = 8; // Padding top du body
    const connectorRadius = 6; // Moitié de la taille d'un connecteur (12px/2)
    const startY = headerHeight + bodyPaddingTop + connectorRadius; // Position sous le début du body + marge
    connector.style.top = `${startY + inputIndex * spacing}px`;

    connector.addEventListener('click', (e) => {
      e.stopPropagation();
      unitManager.handleConnectorClick(this.id, id, 'input');
    });

    // Ajouter les event listeners pour le drag
    connector.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      unitManager.startConnectorDrag(this.id, id, 'input', e);
    });

    this.element.appendChild(connector);
    this.inputs.push({ id, name, color, element: connector });

    // Ajuster la hauteur du module après ajout
    this.adjustModuleHeight();

    return id;
  }

  addOutput(options = {}) {
    const {
      id = unitManager.generateConnectorId(),
      name = `Output ${this.outputs.length + 1}`,
      color = '#dc3545'
    } = options;

    const connector = $('unit-connector-output', {
      attrs: {
        'data-connector-id': id,
        'data-connector-type': 'output',
        'title': name
      }
    });

    if (color) {
      connector.style.backgroundColor = color;
      connector.style.boxShadow = `0 0 0 1px ${color}`;
    }

    // Positionner le connecteur
    const outputIndex = this.outputs.length;
    const spacing = 20;
    const headerHeight = 35; // Hauteur du header
    const bodyPaddingTop = 8; // Padding top du body
    const connectorRadius = 6; // Moitié de la taille d'un connecteur (12px/2)
    const startY = headerHeight + bodyPaddingTop + connectorRadius; // Position sous le début du body + marge
    connector.style.top = `${startY + outputIndex * spacing}px`;

    connector.addEventListener('click', (e) => {
      e.stopPropagation();
      unitManager.handleConnectorClick(this.id, id, 'output');
    });

    // Ajouter les event listeners pour le drag
    connector.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      unitManager.startConnectorDrag(this.id, id, 'output', e);
    });

    this.element.appendChild(connector);
    this.outputs.push({ id, name, color, element: connector });

    // Ajuster la hauteur du module après ajout
    this.adjustModuleHeight();

    return id;
  }

  removeInput(connectorId) {
    const inputIndex = this.inputs.findIndex(input => input.id === connectorId);
    if (inputIndex !== -1) {
      const input = this.inputs[inputIndex];
      input.element.remove();
      this.inputs.splice(inputIndex, 1);

      // Repositionner les connecteurs restants
      this.repositionInputs();
    }
  }

  removeOutput(connectorId) {
    const outputIndex = this.outputs.findIndex(output => output.id === connectorId);
    if (outputIndex !== -1) {
      const output = this.outputs[outputIndex];
      output.element.remove();
      this.outputs.splice(outputIndex, 1);

      // Repositionner les connecteurs restants
      this.repositionOutputs();
    }
  }

  repositionInputs() {
    const spacing = 20;
    const headerHeight = 35; // Hauteur du header
    const bodyPaddingTop = 8; // Padding top du body
    const connectorRadius = 6; // Moitié de la taille d'un connecteur (12px/2)
    const startY = headerHeight + bodyPaddingTop + connectorRadius; // Position sous le début du body + marge
    this.inputs.forEach((input, index) => {
      input.element.style.top = `${startY + index * spacing}px`;
    });

    // Ajuster la hauteur du module après repositionnement
    this.adjustModuleHeight();
  }

  repositionOutputs() {
    const spacing = 20;
    const headerHeight = 35; // Hauteur du header
    const bodyPaddingTop = 8; // Padding top du body
    const connectorRadius = 6; // Moitié de la taille d'un connecteur (12px/2)
    const startY = headerHeight + bodyPaddingTop + connectorRadius; // Position sous le début du body + marge
    this.outputs.forEach((output, index) => {
      output.element.style.top = `${startY + index * spacing}px`;
    });

    // Ajuster la hauteur du module après repositionnement
    this.adjustModuleHeight();
  }

  // Nouvelle méthode pour ajuster automatiquement la hauteur du module
  adjustModuleHeight() {
    const connectorSpacing = 20;
    const headerHeight = 35; // Hauteur réduite du header
    const bodyPadding = 16; // Padding réduit top + bottom du body
    const minBodyHeight = 32; // Hauteur minimale réduite du body
    const extraMargin = 8; // Marge réduite pour l'esthétique

    // Calculer le nombre maximum de connecteurs sur un côté
    const maxConnectors = Math.max(this.inputs.length, this.outputs.length);

    if (maxConnectors === 0) {
      // Pas de connecteurs, utiliser une hauteur minimale réduite
      this.element.style.height = 'auto';
      this.element.style.minHeight = '60px';
      return;
    }

    // Calculer la hauteur nécessaire pour tous les connecteurs
    const connectorsHeight = Math.max(1, maxConnectors) * connectorSpacing; // Supprimer le +10 pour startY
    const requiredBodyHeight = Math.max(minBodyHeight, connectorsHeight);
    const totalHeight = headerHeight + requiredBodyHeight + bodyPadding + extraMargin;

    // Appliquer la nouvelle hauteur
    this.element.style.height = `${totalHeight}px`;
    this.element.style.minHeight = `${totalHeight}px`;

    // Optionnel: Log pour debug
    console.log(`📏 Unit ${this.name}: ${maxConnectors} connecteurs max → hauteur ${totalHeight}px`);
  }

  select() {
    unitManager.selectUnit(this.id);
  }

  deselect() {
    unitManager.deselectUnit(this.id);
  }

  rename(newName) {
    this.name = newName;
    this.nameElement.textContent = newName;
  }

  destroy() {
    unitManager.unregisterUnit(this.id);
    this.element.remove();
  }

  // Events
  onClick() {
    this.animateIcon();
  }

  onLongClick() {
    this.animateIcon();
  }
}

// === FONCTIONS UTILITAIRES DE L'API ===

function createUnit(options) {
  return new Unit(options);
}

function deleteUnit(unitId) {
  const unit = unitManager.units.get(unitId);
  if (unit) {
    unit.destroy();
  }
}

function deleteUnits(unitIds) {
  unitIds.forEach(id => deleteUnit(id));
}

function selectUnit(unitId) {
  unitManager.selectUnit(unitId);
}

function selectUnits(unitIds) {
  unitIds.forEach(id => selectUnit(id));
}

function deselectUnit(unitId) {
  unitManager.deselectUnit(unitId);
}

function deselectUnits(unitIds) {
  unitIds.forEach(id => deselectUnit(id));
}

function deselectAllUnits() {
  unitManager.deselectAll();
}

function getSelectedUnits() {
  return unitManager.getSelectedUnits();
}

function renameUnit(unitId, newName) {
  const unit = unitManager.units.get(unitId);
  if (unit) {
    unit.rename(newName);
  }
}

function renameUnits(unitIds, newName) {
  unitIds.forEach(id => renameUnit(id, newName));
}

function connectUnits(fromUnitId, fromConnectorId, toUnitId, toConnectorId) {
  return unitManager.createConnection(fromUnitId, fromConnectorId, toUnitId, toConnectorId);
}

function disconnectUnits(fromUnitId, fromConnectorId, toUnitId, toConnectorId) {
  const connectionToRemove = Array.from(unitManager.connections.values()).find(conn =>
    conn.fromUnit === fromUnitId &&
    conn.fromConnector === fromConnectorId &&
    conn.toUnit === toUnitId &&
    conn.toConnector === toConnectorId
  );

  if (connectionToRemove) {
    unitManager.removeConnection(connectionToRemove.id);
  }
}

function getAllConnections() {
  return unitManager.getAllConnections();
}

function getUnit(unitId) {
  return unitManager.units.get(unitId);
}

function getAllUnits() {
  return Array.from(unitManager.units.values());
}

// === EXPORT ===
export { createUnit };

// Alias pour compatibilité avec l'ancien pattern (éviter le conflit avec la classe Unit)
const UnitComponent = createUnit;
export { UnitComponent };
export { UnitComponent as Unit };

// Export par défaut - fonction directe pour usage: Unit({...})
export default createUnit;

// Export des utilitaires supplémentaires
export {
  deleteUnit,
  deleteUnits,
  selectUnit,
  selectUnits,
  deselectUnit,
  deselectUnits,
  deselectAllUnits,
  getSelectedUnits,
  renameUnit,
  renameUnits,
  connectUnits,
  disconnectUnits,
  getAllConnections,
  getUnit,
  getAllUnits,
  unitManager
};
