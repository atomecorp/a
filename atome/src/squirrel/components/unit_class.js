// Extracted from unit_builder.js: the Unit component class (DOM element, connectors, drag, edit).
import { $ } from '../squirrel.js';
import { unitManager } from './unit_manager.js';

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


export { Unit };
