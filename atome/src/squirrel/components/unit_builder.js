import { $, define } from '../squirrel.js';
import { unitManager } from './unit_manager.js';
import { Unit } from './unit_class.js';

/**
 * Composant Unit Builder avec HyperSquirrel
 * Créer des blocs graphiques draggables connectables entre eux
 */

// === GESTIONNAIRE GLOBAL DES UNITS ===

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
