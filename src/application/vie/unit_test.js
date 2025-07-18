

import { unitManager } from '../../squirrel/components/unit_builder.js';


/////////////////////////
function createUnitsFromJSON(jsonData) {
  const createdUnits = new Map();

  // 1. CRÉER TOUS LES COMPOSANTS
  jsonData.components.forEach(component => {
    const unitConfig = getUnitConfigByType(component.type);

    const unit = Unit({
      id: `unit_${component.id}`,
      parent: vieViewer,
      name: component.name,
      position: {
        x: component.x * 200,
        y: component.y * 150 + 50
      },
      inputs: unitConfig.inputs || [],
      outputs: unitConfig.outputs || [],
      backgroundColor: unitConfig.backgroundColor
    });

    createdUnits.set(component.id, unit);
  });

  // 2. CRÉER LES CONNEXIONS après que tous les units soient créés
  setTimeout(() => {
    jsonData.relations.forEach(relation => {
      const sourceUnit = createdUnits.get(relation.sourceComponent);
      const targetUnit = createdUnits.get(relation.targetComponent);

      if (sourceUnit && targetUnit) {
        // Récupérer les IDs réels des connecteurs
        const sourceConnectorId = sourceUnit.outputs[relation.sourceOutputSlot]?.id;
        const targetConnectorId = targetUnit.inputs[relation.targetInputSlot]?.id;

        if (sourceConnectorId && targetConnectorId) {
          // Utiliser l'API connectUnits
          unitManager.createConnection(
            sourceUnit.id,
            sourceConnectorId,
            targetUnit.id,
            targetConnectorId
          );

          console.log(`✅ Connexion: ${sourceUnit.name} → ${targetUnit.name}`);
        }
      }
    });
  }, 100); // Petit délai pour s'assurer que tous les éléments DOM sont créés

  return Array.from(createdUnits.values());
}

function getUnitConfigByType(typeUUID) {
  const typeConfigs = {
    // Midi in
    "5a16b1c8-60cc-41c9-ba11-8bb960a4c84c": {
      backgroundColor: '#4A90E2',
      inputs: [], // Pas d'entrées pour un input MIDI
      outputs: [
        { name: 'Note', color: '#FF6B6B' },
        { name: 'Velocity', color: '#4ECDC4' },
        { name: 'Channel', color: '#45B7D1' }
      ]
    },

    // Sin oscillator  
    "d3b92367-1e77-476b-9805-00add6a2fce6": {
      backgroundColor: '#F5A623',
      inputs: [
        { name: 'Frequency', color: '#D0021B' },
        { name: 'Amplitude', color: '#7ED321' }
      ],
      outputs: [
        { name: 'Sine Wave', color: '#9013FE' },
        { name: 'Phase', color: '#FF6D00' },
        { name: 'Sync', color: '#00E676' },
        { name: 'Audio', color: '#FF1744' } // Output slot 3 utilisé dans la relation
      ]
    },

    // Audio out
    "dda34b63-2c09-4492-9e27-18c2bc4dddb0": {
      backgroundColor: '#50E3C2',
      inputs: [
        { name: 'Left', color: '#B8E986' },
        { name: 'Right', color: '#F8E71C' }, // Input slot 1 utilisé dans la relation
        { name: 'Volume', color: '#BD10E0' }
      ],
      outputs: [
        { name: 'Monitor L', color: '#9013FE' },
        { name: 'Monitor R', color: '#50E3C2' },
        { name: 'Peak Level', color: '#F5A623' } // Output slot 2 mentionné dans la relation
      ]
    }
  };

  return typeConfigs[typeUUID] || {
    backgroundColor: '#E0E0E0',
    inputs: [{ name: 'Input' }],
    outputs: [{ name: 'Output' }]
  };
}


/////////////////

const units_to_creaet = {
  "components": [
    {
      "id": 0,
      "name": "Midi in",
      "type": "5a16b1c8-60cc-41c9-ba11-8bb960a4c84c",
      "x": 0,
      "y": 0,
      "z": 0
    },
    {
      "id": 1,
      "name": "Sin oscillator",
      "type": "d3b92367-1e77-476b-9805-00add6a2fce6",
      "x": 1,
      "y": 0,
      "z": 0
    },
    {
      "id": 2,
      "name": "Audio out",
      "type": "dda34b63-2c09-4492-9e27-18c2bc4dddb0",
      "x": 2,
      "y": 0,
      "z": 0
    }
  ],
  "relations": [
    {
      "sourceComponent": 0,
      "sourceOutputSlot": 0,
      "targetComponent": 1,
      "targetInputSlot": 0
    },
    {
      "sourceComponent": 1,
      "sourceOutputSlot": 3,
      "targetComponent": 2,
      "targetInputSlot": 1
    },
    {
      "sourceComponent": 2,
      "sourceOutputSlot": 2,
      "targetComponent": 3,
      "targetInputSlot": 1
    }
  ]
}


createUnitsFromJSON(units_to_creaet)